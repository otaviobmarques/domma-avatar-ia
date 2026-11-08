import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Etapa, ItemQualidade } from "@/db/schema";
import { conector } from "./conectores";
import { credenciais, registrarChamada, baixar, ErroProvedor } from "./integracoes";
import { carregarContexto, escolher, textoFalado, REGRAS, type Escolha } from "./orquestrador";
import { custoBrl } from "./precos";
import { salvar, urlAssinada, arquivoLocal, ler } from "./storage";
import * as ff from "./ffmpeg";
import { lerConfig } from "./config";
import { revisarFrames } from "./claude";
import { avatarLite } from "./pipeline";

type Job = typeof schema.jobs.$inferSelect;
const log = (...a: unknown[]) => console.log("[worker]", ...a);

/* ---------- Fila ---------- */
async function pegarJob(): Promise<Job | null> {
  const db = await getDb();
  // Destrava jobs presos (worker caiu no meio)
  await db.execute(sql`update jobs set status='pendente', travado_em=null where status='rodando' and travado_em < now() - interval '20 minutes'`);
  // Dependência com erro → propaga o erro
  await db.execute(sql`
    update jobs j set status='erro', erro='Uma etapa anterior falhou', finalizado_em=now()
    where j.status='pendente' and exists (
      select 1 from jobs d where d.id::text in (select jsonb_array_elements_text(j.depende)) and d.status in ('erro','cancelado'))`);
  const r = await db.execute(sql`
    update jobs set status='rodando', travado_em=now(), tentativas = tentativas + (case when status='pendente' then 1 else 0 end)
    where id = (
      select j.id from jobs j
      where j.status in ('pendente','aguardando') and j.rodar_apos <= now()
        and not exists (select 1 from jobs d where d.id::text in (select jsonb_array_elements_text(j.depende)) and d.status <> 'ok')
      order by j.criado_em
      limit 1
      for update skip locked)
    returning id`);
  const rows = (r as unknown as { rows?: { id: string }[] }).rows ?? (r as unknown as { id: string }[]);
  const id = rows?.[0]?.id;
  if (!id) return null;
  const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return j ?? null;
}

async function concluir(j: Job, dados: Partial<typeof schema.jobs.$inferInsert>) {
  const db = await getDb();
  await db.update(schema.jobs).set({ status: "ok", finalizadoEm: new Date(), travadoEm: null, erro: null, ...dados }).where(eq(schema.jobs.id, j.id));
  if (j.videoId) await atualizarCustoVideo(j.videoId);
}

async function aguardar(j: Job, tarefa: string, segundos = 12) {
  const db = await getDb();
  await db.update(schema.jobs).set({ status: "aguardando", tarefaExterna: tarefa, travadoEm: null, rodarApos: new Date(Date.now() + segundos * 1000) }).where(eq(schema.jobs.id, j.id));
}

async function atualizarCustoVideo(videoId: string) {
  const db = await getDb();
  await db.execute(sql`update videos set custo_real = (select coalesce(sum(custo),0) from jobs where video_id=${videoId} and status='ok') + coalesce((select sum(custo) from integracao_chamadas where video_id=${videoId} and etapa='roteiro'),0), atualizado_em=now() where id=${videoId}`);
}

async function falhar(j: Job, e: unknown) {
  const db = await getDb();
  const err = e as ErroProvedor;
  const msg = (err?.message ?? String(e)).slice(0, 1500);
  log(`job ${j.etapa} (${j.provedor}) falhou:`, msg);
  if (err instanceof ErroProvedor && err.semSaldo && j.provedor !== "simulador") {
    await db.update(schema.integracoes).set({ status: "sem_saldo", ultimoErro: msg }).where(eq(schema.integracoes.provedor, j.provedor));
  }
  const retentar = !(err instanceof ErroProvedor) || err.retentavel;
  if (retentar && !err?.semSaldo && j.tentativas < j.maxTentativas) {
    const espera = 10 * 2 ** j.tentativas;
    await db.update(schema.jobs).set({ status: "pendente", erro: msg, travadoEm: null, tarefaExterna: null, rodarApos: new Date(Date.now() + espera * 1000) }).where(eq(schema.jobs.id, j.id));
    return;
  }
  // Fallback automático (seção 5.1): usa o motor reserva e registra o motivo
  const fb = await motorFallback(j);
  if (fb) {
    log(`fallback ${j.provedor}/${j.modelo} → ${fb.provedor}/${fb.modelo}`);
    await db.update(schema.jobs).set({
      status: "pendente", provedor: fb.simulado ? "simulador" : fb.provedor, modelo: fb.modelo, tentativas: 0, tarefaExterna: null, travadoEm: null,
      fallbackDe: `${j.provedor}/${j.modelo}: ${msg.slice(0, 200)}`, erro: null, rodarApos: new Date(),
      entrada: { ...j.entrada, simulado: fb.simulado, motorReal: `${fb.provedor}/${fb.modelo}` },
    }).where(eq(schema.jobs.id, j.id));
    return;
  }
  await db.update(schema.jobs).set({ status: "erro", erro: msg, finalizadoEm: new Date(), travadoEm: null }).where(eq(schema.jobs.id, j.id));
  if (j.videoId) await db.update(schema.videos).set({ status: "erro", erro: `${j.etapa}: ${msg.slice(0, 300)}`, atualizadoEm: new Date() }).where(eq(schema.videos.id, j.videoId));
}

async function motorFallback(j: Job): Promise<Escolha | null> {
  if (["montagem", "revisao", "roteiro"].includes(j.etapa) || j.provedor === "simulador") return null;
  const db = await getDb();
  const ctx = await carregarContexto();
  const integ = ctx.integracoes.get(j.provedor);
  // Remove o motor que falhou desta rodada
  ctx.integracoes.set(j.provedor, { ...integ!, ligado: false });
  const [v] = j.videoId ? await db.select().from(schema.videos).where(eq(schema.videos.id, j.videoId)) : [];
  const [a] = v?.avatarId ? await db.select().from(schema.avatares).where(eq(schema.avatares.id, v.avatarId)) : [];
  const r = REGRAS[v?.modo === "manual" || !v ? "equilibrado" : v.modo];
  const cand: Record<string, string[]> = { voz: r.voz, avatar: [...r.avatarClose, ...r.avatar], cenas: r.cenas.filter((x) => !x.startsWith("local")), cenario: r.cenario, olhar: [] };
  const preferido = integ?.fallback ? (ctx.integracoes.get(integ.fallback)?.modelosHabilitados ?? []).map((m) => `${integ.fallback}/${m}`).find((m) => (cand[j.etapa] ?? []).includes(m)) : undefined;
  const e = escolher(ctx, cand[j.etapa] ?? [], avatarLite(a), preferido);
  return e && !(e.provedor === j.provedor) ? e : null;
}

/* ---------- Execução das etapas ---------- */
async function contexto(j: Job) {
  const db = await getDb();
  const [video] = await db.select().from(schema.videos).where(eq(schema.videos.id, j.videoId!));
  const [cena] = j.cenaId ? await db.select().from(schema.cenas).where(eq(schema.cenas.id, j.cenaId)) : [];
  const [avatar] = video?.avatarId ? await db.select().from(schema.avatares).where(eq(schema.avatares.id, video.avatarId)) : [];
  return { db, video, cena, avatar };
}

async function cobrar(j: Job, quantidade: number, acao: string, inicio: number) {
  if (j.entrada.simulado) return 0;
  const ctx = await carregarContexto();
  const motor = `${j.provedor}/${j.modelo}`;
  const custo = custoBrl(ctx.precos.get(motor), quantidade, ctx.cambio);
  await registrarChamada({ provedor: j.provedor, modelo: j.modelo, videoId: j.videoId, etapa: j.etapa, acao, inicio, quantidade, custo, sucesso: true });
  return custo ?? 0;
}

const simulado = (j: Job) => !!j.entrada.simulado || j.provedor === "simulador";

async function etapaVoz(j: Job) {
  const { db, cena, avatar } = await contexto(j);
  const inicio = Date.now();
  const texto = textoFalado(cena.texto);
  const dir = await ff.tmp();
  let caminho: string, palavras: { palavra: string; inicio: number; fim: number }[] | undefined;
  if (simulado(j)) {
    const f = path.join(dir, "voz.m4a");
    await ff.vozSimulada(f, texto);
    caminho = await salvar(`videos/${cena.videoId}/cenas/${cena.id}/voz_v${cena.versao}.m4a`, await fs.readFile(f), "audio/mp4");
  } else {
    const vozId = avatar?.modelos?.[j.provedor];
    if (!vozId) throw new ErroProvedor(`Voz não clonada em ${j.provedor}`, 400, false, false);
    const comPausas = j.provedor === "elevenlabs" ? cena.texto.replace(/\[pausa\]/gi, ' <break time="0.4s" /> ') : cena.texto.replace(/\[pausa\]/gi, "... ");
    const r = await conector(j.provedor).voz!(await credenciais(j.provedor), { texto: textoFalado(comPausas.replace(/<break[^>]*>/g, "§")).replace(/§/g, '<break time="0.4s" />'), vozId, modelo: j.modelo! });
    caminho = await salvar(`videos/${cena.videoId}/cenas/${cena.id}/voz_v${cena.versao}.${r.ext}`, r.audio, "audio/mpeg");
    palavras = r.palavras;
  }
  const local = await arquivoLocal(caminho, dir);
  const dur = await ff.duracao(local);
  await db.update(schema.cenas).set({ audio: caminho, duracao: dur, palavras: palavras ?? null }).where(eq(schema.cenas.id, cena.id));
  const integ = j.provedor;
  const ctx = await carregarContexto();
  const un = ctx.precos.get(`${integ}/${j.modelo}`)?.unidade;
  const q = un === "mil_caracteres" ? texto.length / 1000 : un === "minuto_gpu" ? (dur / 60) * 1.5 : dur;
  const custo = await cobrar(j, q, "tts", inicio);
  await fs.rm(dir, { recursive: true, force: true });
  await concluir(j, { custo, resposta: { arquivo: caminho, duracao: dur } });
}

async function etapaCenario(j: Job) {
  const { db, video } = await contexto(j);
  const inicio = Date.now();
  const desc = String(j.entrada.descricao ?? video.titulo);
  let arquivo: string;
  if (simulado(j)) {
    const dir = await ff.tmp();
    const f = path.join(dir, "cen.png");
    await ff.gerarImagem(f, { w: 1080, h: 1920, cor1: "0x1e1238", cor2: "0x7360fa", titulo: `Cenário: ${desc}`.slice(0, 40) });
    arquivo = await salvar(`biblioteca/cenarios/${video.id}.png`, await fs.readFile(f), "image/png");
    await fs.rm(dir, { recursive: true, force: true });
  } else {
    const c = await credenciais(j.provedor);
    if (!j.tarefaExterna) {
      const t = await conector(j.provedor).imagem!(c, { modelo: j.modelo!, prompt: `Cenário fotográfico realista, vazio, para gravação de vídeo comercial: ${desc}. Luz natural, sem pessoas, sem texto.`, proporcao: video.proporcao });
      return aguardar(j, t, 8);
    }
    const st = await conector(j.provedor).consultar!(c, j.tarefaExterna);
    if (st.status === "rodando") return aguardar(j, j.tarefaExterna, 8);
    if (st.status === "erro" || !st.url) throw new ErroProvedor(st.erro ?? "falhou sem URL");
    arquivo = await salvar(`biblioteca/cenarios/${video.id}.png`, await baixar(st.url, st.headers), "image/png");
  }
  const [item] = await db.insert(schema.biblioteca).values({ tipo: "cenario", nome: desc.slice(0, 60), arquivo, empresaId: video.empresaId, origem: "gerado", tags: ["gerado"] }).returning();
  await db.update(schema.videos).set({ cenarioId: item.id }).where(eq(schema.videos.id, video.id));
  const custo = await cobrar(j, 1, "imagem_cenario", inicio);
  await concluir(j, { custo, resposta: { arquivo, bibliotecaId: item.id } });
}

async function fundoVideo(videoId: string) {
  const db = await getDb();
  const [v] = await db.select().from(schema.videos).where(eq(schema.videos.id, videoId));
  if (!v?.cenarioId) return null;
  const [b] = await db.select().from(schema.biblioteca).where(eq(schema.biblioteca.id, v.cenarioId));
  return b?.arquivo ?? null;
}

async function etapaAvatar(j: Job) {
  const { db, video, cena, avatar } = await contexto(j);
  const inicio = Date.now();
  if (!cena.audio) throw new Error("Cena sem áudio");
  const destino = `videos/${video.id}/cenas/${cena.id}/avatar_v${cena.versao}.mp4`;
  if (simulado(j)) {
    const dir = await ff.tmp();
    const { w, h } = ff.dimensoes(video.proporcao, 480);
    const f = path.join(dir, "av.mp4");
    const foto = avatar?.foto ? await arquivoLocal(avatar.foto, dir) : null;
    await ff.avatarSimulado(f, { foto, audio: await arquivoLocal(cena.audio, dir), w, h, nome: avatar?.nome ?? "Avatar" });
    await salvar(destino, await fs.readFile(f), "video/mp4");
    await fs.rm(dir, { recursive: true, force: true });
  } else {
    const c = await credenciais(j.provedor);
    if (!j.tarefaExterna) {
      const fundo = await fundoVideo(video.id);
      const prompt = cena.marcacoes.includes("animado") ? "pessoa falando com energia e sorriso, olhando para a câmera" :
        cena.marcacoes.includes("pensar") ? "pessoa falando, desvia o olhar brevemente como quem pensa, volta para a câmera" : undefined;
      const t = await conector(j.provedor).avatar!(c, {
        modelo: j.modelo!, fotoUrl: avatar?.foto ? urlAssinada(avatar.foto) : null, audioUrl: urlAssinada(cena.audio), avatarId: avatar?.modelos?.[j.provedor],
        proporcao: video.proporcao, fundoUrl: fundo ? urlAssinada(fundo) : null, prompt,
      });
      return aguardar(j, t, 20);
    }
    const st = await conector(j.provedor).consultar!(c, j.tarefaExterna);
    if (st.status === "rodando") return aguardar(j, j.tarefaExterna, 15);
    if (st.status === "erro" || !st.url) throw new ErroProvedor(st.erro ?? "falhou sem URL");
    await salvar(destino, await baixar(st.url, st.headers), "video/mp4");
  }
  await db.update(schema.cenas).set({ arquivo: destino }).where(eq(schema.cenas.id, cena.id));
  const custo = await cobrar(j, cena.duracao ?? 0, "avatar", inicio);
  await concluir(j, { custo, resposta: { arquivo: destino } });
}

async function etapaOlhar(j: Job) {
  const { db, cena } = await contexto(j);
  const inicio = Date.now();
  if (!cena.arquivo) throw new Error("Cena sem vídeo de avatar");
  if (!simulado(j)) {
    const buf = await conector(j.provedor).olhar!(await credenciais(j.provedor), { videoUrl: urlAssinada(cena.arquivo), intensidade: cena.marcacoes.includes("pensar") ? 0.5 : 0.8 });
    const destino = cena.arquivo.replace(/\.mp4$/, "_olhar.mp4");
    await salvar(destino, buf, "video/mp4");
    await db.update(schema.cenas).set({ arquivo: destino }).where(eq(schema.cenas.id, cena.id));
  }
  const custo = await cobrar(j, ((cena.duracao ?? 0) / 60) * 3, "corrigir_olhar", inicio);
  await concluir(j, { custo, resposta: { simulado: simulado(j) } });
}

async function etapaCenas(j: Job) {
  const { db, video, cena } = await contexto(j);
  const inicio = Date.now();
  const destino = `videos/${video.id}/cenas/${cena.id}/broll_v${cena.versao}.mp4`;
  if (simulado(j)) {
    // Simulador: o b-roll usa o cenário com movimento na montagem (sem arquivo próprio)
    return concluir(j, { custo: 0, resposta: { simulado: true } });
  }
  const c = await credenciais(j.provedor);
  if (!j.tarefaExterna) {
    const fundo = await fundoVideo(video.id);
    const t = await conector(j.provedor).cena!(c, {
      modelo: j.modelo!, prompt: `${String(j.entrada.prompt ?? cena.texto)}. Vídeo comercial, realista, sem texto na tela.`,
      imagemUrl: fundo ? urlAssinada(fundo) : null, duracao: cena.duracao ?? 5, proporcao: video.proporcao,
    });
    return aguardar(j, t, 20);
  }
  const st = await conector(j.provedor).consultar!(c, j.tarefaExterna);
  if (st.status === "rodando") return aguardar(j, j.tarefaExterna, 15);
  if (st.status === "erro" || !st.url) throw new ErroProvedor(st.erro ?? "falhou sem URL");
  await salvar(destino, await baixar(st.url, st.headers), "video/mp4");
  await db.update(schema.cenas).set({ arquivo: destino }).where(eq(schema.cenas.id, cena.id));
  const custo = await cobrar(j, cena.duracao ?? 5, "cena", inicio);
  await concluir(j, { custo, resposta: { arquivo: destino } });
}

function legendasDaCena(c: typeof schema.cenas.$inferSelect, offset: number) {
  const out: ff.Legenda[] = [];
  const dur = c.duracao ?? 0;
  if (c.palavras?.length) {
    for (let i = 0; i < c.palavras.length; i += 4) {
      const g = c.palavras.slice(i, i + 4);
      out.push({ inicio: offset + g[0].inicio, fim: offset + g[g.length - 1].fim, texto: g.map((p) => p.palavra).join(" ") });
    }
    return out;
  }
  const palavras = textoFalado(c.texto).split(" ").filter(Boolean);
  if (!palavras.length || !dur) return out;
  const grupos: string[][] = [];
  for (let i = 0; i < palavras.length; i += 4) grupos.push(palavras.slice(i, i + 4));
  const pedaco = dur / grupos.length;
  grupos.forEach((g, i) => out.push({ inicio: offset + i * pedaco, fim: offset + (i + 1) * pedaco - 0.05, texto: g.join(" ") }));
  return out;
}

async function etapaMontagem(j: Job) {
  const { db, video } = await contexto(j);
  const cfg = await lerConfig();
  const cenas = await db.select().from(schema.cenas).where(eq(schema.cenas.videoId, video.id)).orderBy(asc(schema.cenas.ordem));
  const final = j.entrada.qualidade === "final";
  const lado = Number(j.entrada.ladoCurto ?? 480);
  const proporcoes = (final ? (j.entrada.proporcoes as string[]) : [video.proporcao]) as ff.Proporcao[];
  const dir = await ff.tmp("montagem-");
  const fundo = await fundoVideo(video.id);
  const fundoLocal = fundo ? await arquivoLocal(fundo, dir) : null;
  const extras = async (id: string | null) => {
    if (!id) return null;
    const [b] = await db.select().from(schema.biblioteca).where(eq(schema.biblioteca.id, id));
    return b?.arquivo ? arquivoLocal(b.arquivo, dir) : null;
  };
  const logo = await extras(video.logoId);
  const trilha = await extras(video.trilhaId);
  const resultados: Record<string, string> = {};
  const mapa: { cena: number; inicio: number; fim: number }[] = [];

  for (const prop of proporcoes) {
    const { w, h } = ff.dimensoes(prop, lado);
    const clipes: string[] = [];
    const legendas: ff.Legenda[] = [];
    let t = 0;
    mapa.length = 0;
    for (const c of cenas) {
      const audio = c.audio ? await arquivoLocal(c.audio, dir) : null;
      const dur = c.duracao ?? (c.tipo === "texto" ? 2.5 : 3);
      const visual = c.arquivo ? await arquivoLocal(c.arquivo, dir) : c.tipo === "broll" ? fundoLocal : c.tipo === "avatar" ? null : null;
      const saida = path.join(dir, `c${c.ordem}_${prop.replace(":", "x")}.mp4`);
      await ff.normalizarCena(saida, {
        visual, visualEhImagem: !c.arquivo && !!visual, audio, duracao: dur, w, h,
        texto: c.tipo === "texto" ? textoFalado(c.texto) : c.tipo === "broll" && !c.arquivo ? undefined : undefined,
      });
      clipes.push(saida);
      if (c.tipo !== "texto") legendas.push(...legendasDaCena(c, t));
      mapa.push({ cena: c.ordem + 1, inicio: t, fim: t + dur });
      t += dur;
    }
    const bruto = path.join(dir, `bruto_${prop.replace(":", "x")}.mp4`);
    await ff.concatenar(bruto, clipes);
    const saida = path.join(dir, `final_${prop.replace(":", "x")}.mp4`);
    await ff.acabamento(saida, {
      entrada: bruto, w, h, legendas: video.legendas ? legendas : [],
      marcaDagua: cfg.marcaDagua && video.marcaDagua ? cfg.textoMarcaDagua : null, logo, trilha, crf: final ? 20 : 28,
    });
    const nome = final ? `videos/${video.id}/final_${lado}p_${prop.replace(":", "x")}.mp4` : `videos/${video.id}/previa_${Date.now()}.mp4`;
    resultados[prop] = await salvar(nome, await fs.readFile(saida), "video/mp4");
  }
  await fs.rm(dir, { recursive: true, force: true });
  if (final) {
    await db.update(schema.videos).set({ final: resultados[proporcoes[0]], finais: { ...video.finais, ...Object.fromEntries(Object.entries(resultados).map(([k, v]) => [`${k}@${lado}p`, v])) }, status: "finalizado", atualizadoEm: new Date() }).where(eq(schema.videos.id, video.id));
  } else {
    await db.update(schema.videos).set({ previa: resultados[video.proporcao], status: "previa_pronta", atualizadoEm: new Date() }).where(eq(schema.videos.id, video.id));
  }
  await concluir(j, { custo: 0, resposta: { arquivos: resultados, mapa } });
}

async function etapaRevisao(j: Job) {
  const { db, video } = await contexto(j);
  if (!video.previa) throw new Error("Sem prévia para revisar");
  const [m] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.videoId, video.id), eq(schema.jobs.etapa, "montagem"), eq(schema.jobs.status, "ok"))).orderBy(sql`finalizado_em desc`).limit(1);
  const mapa = ((m?.resposta?.mapa as { cena: number; inicio: number; fim: number }[]) ?? []);
  let itens: ItemQualidade[];
  let custo = 0;
  if (simulado(j)) {
    itens = [{ cena: 0, tempo: "00:00", tipo: "outro", mensagem: "Revisão simulada (modo demonstração). Cadastre a Anthropic para o Claude conferir olhos, boca e cenário nos frames.", gravidade: "info" }];
  } else {
    const dir = await ff.tmp();
    const frames = await ff.extrairFrames(await arquivoLocal(video.previa, dir), 8);
    const r = await revisarFrames({
      videoId: video.id, roteiro: video.roteiro, olhar: video.olhar, formato: video.formato,
      frames: frames.map((f) => ({ ...f, cena: mapa.find((x) => f.tempo >= x.inicio && f.tempo < x.fim)?.cena ?? 1 })),
    });
    itens = r.itens.length ? r.itens : [{ cena: 0, tempo: "00:00", tipo: "outro", mensagem: `Sem problemas visíveis. ${r.resumo}`, gravidade: "info" }];
    custo = r.custo ?? 0;
    await fs.rm(dir, { recursive: true, force: true });
  }
  await db.update(schema.videos).set({ qualidade: itens }).where(eq(schema.videos.id, video.id));
  await concluir(j, { custo, resposta: { itens: itens.length } });
}

const ETAPAS: Partial<Record<Etapa, (j: Job) => Promise<void>>> = {
  voz: etapaVoz, cenario: etapaCenario, avatar: etapaAvatar, olhar: etapaOlhar, cenas: etapaCenas, efeitos: etapaCenas, montagem: etapaMontagem, revisao: etapaRevisao,
};

async function processar(j: Job) {
  const fn = ETAPAS[j.etapa];
  try {
    if (!fn) throw new Error(`Etapa ${j.etapa} sem executor`);
    await fn(j);
  } catch (e) {
    if (!simulado(j) && j.provedor !== "local") {
      await registrarChamada({ provedor: j.provedor, modelo: j.modelo, videoId: j.videoId, etapa: j.etapa, acao: j.etapa, inicio: Date.now(), sucesso: false, erro: (e as Error).message }).catch(() => {});
    }
    await falhar(j, e);
  }
}

/* ---------- Loop ---------- */
type G = { __worker?: { rodando: number; timer?: NodeJS.Timeout } };
const g = globalThis as unknown as G;

export function iniciarWorker(concorrencia = Number(process.env.WORKER_CONCURRENCY ?? 3)) {
  if (g.__worker) return;
  g.__worker = { rodando: 0 };
  const w = g.__worker;
  log(`iniciado (concorrência ${concorrencia})`);
  const tick = async () => {
    try {
      while (w.rodando < concorrencia) {
        const j = await pegarJob();
        if (!j) break;
        w.rodando++;
        processar(j).finally(() => { w.rodando--; });
      }
    } catch (e) {
      log("erro no loop:", (e as Error).message);
    }
  };
  w.timer = setInterval(tick, 2000);
  void tick();
}

/** Limpeza de prévias antigas (política de armazenamento, seção 6.5). */
export async function limparPrevias() {
  const db = await getDb();
  const dias = (await lerConfig()).limpezaPreviasDias;
  const velhos = await db.select().from(schema.videos).where(sql`${schema.videos.status} in ('finalizado','aprovado') and ${schema.videos.atualizadoEm} < now() - (${dias} || ' days')::interval and ${schema.videos.previa} is not null`);
  for (const v of velhos) {
    await db.update(schema.videos).set({ previa: null }).where(eq(schema.videos.id, v.id));
  }
  return velhos.length;
}

export { ler };
