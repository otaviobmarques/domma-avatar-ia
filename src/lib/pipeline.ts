import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { BlocoRoteiro, Etapa } from "@/db/schema";
import { carregarContexto, estimar, saldoOrcamento, textoFalado, escolher, REGRAS, type AvatarLite, type Escolha } from "./orquestrador";

type Video = typeof schema.videos.$inferSelect;
type Cena = typeof schema.cenas.$inferSelect;

export class BloqueioOrcamento extends Error {}

export function avatarLite(a: typeof schema.avatares.$inferSelect | undefined | null): AvatarLite {
  return a ? { id: a.id, nome: a.nome, modelos: a.modelos, foto: a.foto } : null;
}

export async function carregarVideo(id: string) {
  const db = await getDb();
  const [v] = await db.select().from(schema.videos).where(eq(schema.videos.id, id));
  if (!v) throw new Error("Vídeo não encontrado");
  const [a] = v.avatarId ? await db.select().from(schema.avatares).where(eq(schema.avatares.id, v.avatarId)) : [];
  return { video: v, avatar: a ?? null };
}

async function custoRoteiroReal(videoId: string) {
  const db = await getDb();
  const [r] = await db.select({ t: sql<number>`coalesce(sum(${schema.integracaoChamadas.custo}),0)::float` }).from(schema.integracaoChamadas)
    .where(and(eq(schema.integracaoChamadas.videoId, videoId), eq(schema.integracaoChamadas.etapa, "roteiro")));
  return Number(r?.t ?? 0);
}

/** Estimativa do vídeo para um modo (usada na tela-chave "Motores e custo"). */
export async function estimarVideo(v: Video, avatar: typeof schema.avatares.$inferSelect | null, modo = v.modo) {
  const ctx = await carregarContexto();
  return estimar(ctx, {
    modo, formato: v.formato, blocos: v.roteiro, avatar: avatarLite(avatar), motoresManuais: v.motores,
    usarCenarioBiblioteca: !!v.cenarioId, enquadramento: v.enquadramento,
  }, { roteiroJaGerado: v.roteiro.length > 0, custoRoteiroReal: await custoRoteiroReal(v.id) });
}

function validarAvatar(avatar: typeof schema.avatares.$inferSelect | null) {
  if (!avatar) throw new Error("Escolha um avatar");
  if (avatar.status !== "pronto") throw new Error("O avatar ainda não foi concluído (consentimento, verificação e amostras)");
  if (!avatar.consentimentoValidade || avatar.consentimentoValidade < new Date()) throw new Error("Consentimento do avatar vencido — renove antes de gerar");
}

async function novoJob(d: {
  videoId: string; cenaId?: string | null; etapa: Etapa; escolha: Escolha | { provedor: string; modelo: string; simulado: boolean } | null;
  depende?: string[]; entrada?: Record<string, unknown>;
}) {
  const db = await getDb();
  const [j] = await db.insert(schema.jobs).values({
    videoId: d.videoId, cenaId: d.cenaId ?? null, etapa: d.etapa,
    provedor: d.escolha ? (d.escolha.simulado ? "simulador" : d.escolha.provedor) : "local",
    modelo: d.escolha?.modelo ?? null, depende: d.depende ?? [],
    entrada: { ...(d.entrada ?? {}), simulado: !!d.escolha?.simulado, motorReal: d.escolha ? `${d.escolha.provedor}/${d.escolha.modelo}` : null },
  }).returning();
  return j.id;
}

/** Gera a prévia completa (480p): voz → (cenário) → avatar → (olhar) → cenas → montagem → revisão. */
export async function gerarPrevia(videoId: string, usuario: { id: string; papel: string }) {
  const db = await getDb();
  const { video: v, avatar } = await carregarVideo(videoId);
  if (!v.roteiro.length) throw new Error("O roteiro está vazio");
  if (v.roteiro.some((b) => b.tipo === "avatar")) validarAvatar(avatar);
  if (["gerando", "renderizando"].includes(v.status)) throw new Error("Este vídeo já está sendo gerado");

  const est = await estimarVideo(v, avatar);
  const orc = await saldoOrcamento(v.empresaId);
  if (est.totalBrl > orc.restante && !v.aprovadoExcedente) {
    throw new BloqueioOrcamento(`Custo estimado (R$ ${est.totalBrl.toFixed(2)}) ultrapassa o orçamento restante do cliente (R$ ${orc.restante.toFixed(2)}). É preciso aprovação do Administrador.`);
  }
  const semMotor = est.plano.porBloco.filter((b) => (b.tipo === "avatar" && !b.avatar));
  if (semMotor.length || (!est.plano.voz && v.roteiro.some((b) => textoFalado(b.texto)))) {
    throw new Error("Há etapas sem motor disponível. Ligue as integrações ou ative o modo demonstração em Configurações.");
  }

  await db.delete(schema.jobs).where(eq(schema.jobs.videoId, videoId));
  await db.delete(schema.cenas).where(eq(schema.cenas.videoId, videoId));
  const cenas = await db.insert(schema.cenas).values(v.roteiro.map((b, i) => ({
    videoId, ordem: i, tipo: b.tipo, texto: b.texto, marcacoes: b.marcacoes,
    motor: b.tipo === "avatar" ? est.plano.porBloco[i].avatar?.motor : b.tipo === "broll" ? est.plano.porBloco[i].cena?.motor : null,
  }))).returning();

  const finais: string[] = [];
  let jobCenario: string | null = null;
  if (est.plano.cenario && !v.cenarioId) {
    jobCenario = await novoJob({ videoId, etapa: "cenario", escolha: est.plano.cenario, entrada: { descricao: v.briefing?.produto ?? v.titulo } });
  }
  for (const c of cenas.sort((a, b) => a.ordem - b.ordem)) {
    const bloco = v.roteiro[c.ordem];
    const plano = est.plano.porBloco[c.ordem];
    const ultimos = await jobsCena(videoId, c, bloco, plano, est.plano.voz, est.plano.olhar, jobCenario);
    finais.push(...ultimos);
  }
  if (jobCenario) finais.push(jobCenario);
  const montagem = await novoJob({ videoId, etapa: "montagem", escolha: null, depende: finais, entrada: { qualidade: "previa", ladoCurto: 480 } });
  if (est.plano.revisao) await novoJob({ videoId, etapa: "revisao", escolha: est.plano.revisao, depende: [montagem] });

  await db.update(schema.videos).set({
    status: "gerando", estimativa: { ...est, plano: undefined } as never, custoEstimado: est.totalBrl, erro: null, qualidade: [], atualizadoEm: new Date(),
  }).where(eq(schema.videos.id, videoId));
  void usuario;
  return est;
}

async function jobsCena(videoId: string, c: Cena, bloco: BlocoRoteiro, plano: { avatar?: Escolha | null; cena?: Escolha | null },
  voz: Escolha | null, olhar: Escolha | null, jobCenario: string | null): Promise<string[]> {
  const ultimos: string[] = [];
  let jVoz: string | null = null;
  if (textoFalado(bloco.texto) && voz) {
    jVoz = await novoJob({ videoId, cenaId: c.id, etapa: "voz", escolha: voz });
    ultimos.push(jVoz);
  }
  if (bloco.tipo === "avatar" && plano.avatar) {
    const jAv = await novoJob({ videoId, cenaId: c.id, etapa: "avatar", escolha: plano.avatar, depende: [jVoz, jobCenario].filter(Boolean) as string[] });
    ultimos.push(jAv);
    if (olhar) ultimos.push(await novoJob({ videoId, cenaId: c.id, etapa: "olhar", escolha: olhar, depende: [jAv] }));
  }
  if (bloco.tipo === "broll" && plano.cena && plano.cena.provedor !== "local") {
    ultimos.push(await novoJob({ videoId, cenaId: c.id, etapa: "cenas", escolha: plano.cena, depende: jobCenario ? [jobCenario] : [], entrada: { prompt: bloco.broll ?? bloco.texto } }));
  }
  return ultimos;
}

/** "Regerar trecho": refaz só uma cena e remonta a prévia. */
export async function regerarCena(videoId: string, cenaId: string, novoTexto?: string) {
  const db = await getDb();
  const { video: v, avatar } = await carregarVideo(videoId);
  const [c] = await db.select().from(schema.cenas).where(and(eq(schema.cenas.id, cenaId), eq(schema.cenas.videoId, videoId)));
  if (!c) throw new Error("Cena não encontrada");
  const roteiro = [...v.roteiro];
  if (novoTexto != null) roteiro[c.ordem] = { ...roteiro[c.ordem], texto: novoTexto };
  await db.update(schema.cenas).set({ versao: c.versao + 1, texto: roteiro[c.ordem].texto, arquivo: c.tipo === "broll" ? c.arquivo : null })
    .where(eq(schema.cenas.id, cenaId));
  const est = await estimarVideo({ ...v, roteiro }, avatar);
  const plano = est.plano.porBloco[c.ordem];
  const ultimos = await jobsCena(videoId, c, roteiro[c.ordem], plano, est.plano.voz, est.plano.olhar, null);
  await db.delete(schema.jobs).where(and(eq(schema.jobs.videoId, videoId), inArray(schema.jobs.etapa, ["montagem", "revisao"])));
  const m = await novoJob({ videoId, etapa: "montagem", escolha: null, depende: ultimos, entrada: { qualidade: "previa", ladoCurto: 480 } });
  if (est.plano.revisao) await novoJob({ videoId, etapa: "revisao", escolha: est.plano.revisao, depende: [m] });
  await db.update(schema.videos).set({ roteiro, status: "gerando", atualizadoEm: new Date() }).where(eq(schema.videos.id, videoId));
}

/** Custo de regerar uma cena (exibido antes). */
export async function custoRegerarCena(videoId: string, cenaId: string) {
  const db = await getDb();
  const { video: v, avatar } = await carregarVideo(videoId);
  const [c] = await db.select().from(schema.cenas).where(eq(schema.cenas.id, cenaId));
  if (!c) return 0;
  const est = await estimarVideo({ ...v, roteiro: [v.roteiro[c.ordem]], cenarioId: v.cenarioId ?? "x" }, avatar);
  return est.linhas.filter((l) => ["voz", "avatar", "olhar", "cenas"].includes(l.etapa)).reduce((s, l) => s + (l.custoBrl ?? 0), 0);
}

export async function corrigirOlhar(videoId: string, cenaId: string) {
  const db = await getDb();
  const ctx = await carregarContexto();
  const esc = escolher(ctx, ["olhar_gpu/olhar-padrao"], null);
  if (!esc) throw new Error("Cadastre e ligue o servidor de Correção de olhar em Integrações (ou ative o modo demonstração)");
  const j = await novoJob({ videoId, cenaId, etapa: "olhar", escolha: esc });
  await db.delete(schema.jobs).where(and(eq(schema.jobs.videoId, videoId), inArray(schema.jobs.etapa, ["montagem", "revisao"])));
  await novoJob({ videoId, etapa: "montagem", escolha: null, depende: [j], entrada: { qualidade: "previa", ladoCurto: 480 } });
  await db.update(schema.videos).set({ status: "gerando", atualizadoEm: new Date() }).where(eq(schema.videos.id, videoId));
}

/** "Aprovar e renderizar em alta": reaproveita as cenas já geradas e remonta em 720p/1080p (sem novo custo de IA). */
export async function renderizarFinal(videoId: string, resolucao: 720 | 1080, proporcoes: string[]) {
  const db = await getDb();
  const { video: v } = await carregarVideo(videoId);
  if (!v.previa) throw new Error("Gere e confira a prévia antes da versão final");
  await novoJob({ videoId, etapa: "montagem", escolha: null, entrada: { qualidade: "final", ladoCurto: resolucao, proporcoes: proporcoes.length ? proporcoes : [v.proporcao] } });
  await db.update(schema.videos).set({ status: "renderizando", atualizadoEm: new Date() }).where(eq(schema.videos.id, videoId));
}

export async function progresso(videoId: string) {
  const db = await getDb();
  const js = await db.select().from(schema.jobs).where(eq(schema.jobs.videoId, videoId)).orderBy(asc(schema.jobs.criadoEm));
  const total = js.length || 1;
  const feitos = js.filter((j) => j.status === "ok").length;
  return { jobs: js, pct: Math.round((feitos / total) * 100) };
}

export { REGRAS };
