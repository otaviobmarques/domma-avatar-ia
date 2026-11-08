"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { BlocoRoteiro, Briefing, Formato, Modo, Etapa } from "@/db/schema";
import { exigir, type Sessao } from "@/lib/auth";
import { auditar } from "@/lib/auditoria";
import { gerarRoteiro, roteiroDemo } from "@/lib/claude";
import { carregarContexto, disponibilidade } from "@/lib/orquestrador";
import { gerarPrevia, regerarCena, corrigirOlhar, renderizarFinal, estimarVideo, custoRegerarCena, BloqueioOrcamento, carregarVideo, progresso } from "@/lib/pipeline";
import { token } from "@/lib/crypto";
import { env } from "@/lib/env";
import { urlRelativa } from "@/lib/storage";

type R = { ok: boolean; mensagem: string };

async function meu(id: string, s: Sessao) {
  const { video, avatar } = await carregarVideo(id);
  if (s.papel === "cliente" && video.empresaId !== s.empresaId) throw new Error("Sem acesso");
  return { video, avatar };
}

async function atualizar(id: string, dados: Partial<typeof schema.videos.$inferInsert>) {
  const db = await getDb();
  await db.update(schema.videos).set({ ...dados, atualizadoEm: new Date() }).where(eq(schema.videos.id, id));
}

export async function novoVideo(fd?: FormData) {
  const s = await exigir(["admin", "editor"]);
  const db = await getDb();
  const modeloId = fd ? String(fd.get("modeloId") ?? "") : "";
  let base: Partial<typeof schema.videos.$inferInsert> = {};
  if (modeloId) {
    const [m] = await db.select().from(schema.videos).where(eq(schema.videos.id, modeloId));
    if (m) {
      const { id: _i, criadoEm: _c, atualizadoEm: _a, status: _s, previa: _p, final: _f, finais: _fs, qualidade: _q, custoReal: _cr, isModelo: _im, modeloNome: _mn, erro: _e, ...resto } = m;
      void _i; void _c; void _a; void _s; void _p; void _f; void _fs; void _q; void _cr; void _im; void _mn; void _e;
      base = { ...resto, titulo: `${m.modeloNome ?? m.titulo} — novo` };
    }
  }
  const cfg = (await carregarContexto()).config;
  const [v] = await db.insert(schema.videos).values({ titulo: "Novo vídeo", empresaId: s.empresaId, modo: cfg.modoPadrao, ...base, criadoPor: s.id, status: "rascunho" }).returning();
  await auditar(s, "video_criado", v.id, { modelo: modeloId || null });
  redirect(`/videos/${v.id}/formato`);
}

/* Passo 1 — formato */
export async function salvarFormato(id: string, fd: FormData) {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  await atualizar(id, {
    titulo: String(fd.get("titulo") || "Novo vídeo"), formato: String(fd.get("formato")) as Formato,
    duracaoAlvo: Number(fd.get("duracaoPersonalizada") || fd.get("duracao") || 30), proporcao: String(fd.get("proporcao")) as "9:16",
    empresaId: String(fd.get("empresaId") || "") || null, projeto: String(fd.get("projeto") || "") || null,
  });
  redirect(`/videos/${id}/roteiro`);
}

/* Passo 2 — roteiro */
export async function salvarRoteiro(id: string, briefing: Briefing, roteiro: BlocoRoteiro[], avancar = false) {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  await atualizar(id, { briefing, roteiro });
  if (avancar) redirect(`/videos/${id}/avatar`);
  return { ok: true, mensagem: "Roteiro salvo" };
}

export async function gerarRoteiroIA(id: string, briefing: Briefing, versoes: 1 | 3, ajuste?: string, atual?: BlocoRoteiro[]) {
  const s = await exigir(["admin", "editor"]);
  const { video, avatar } = await meu(id, s);
  const db = await getDb();
  const [emp] = video.empresaId ? await db.select().from(schema.empresas).where(eq(schema.empresas.id, video.empresaId)) : [];
  const ctx = await carregarContexto();
  const pedido = { briefing, formato: video.formato, duracao: video.duracaoAlvo, proporcao: video.proporcao, empresa: emp?.nome, nomeAvatar: avatar?.nome, versoes, ajuste, roteiroAtual: atual, videoId: id };
  await atualizar(id, { briefing });
  try {
    if (!disponibilidade(ctx, "anthropic").ok) {
      if (!ctx.config.modoDemo) return { ok: false, mensagem: "Ligue a Anthropic (Claude) em Integrações", versoes: [] };
      return { ok: true, mensagem: "Modo demonstração: roteiro de exemplo (sem Claude)", versoes: roteiroDemo(pedido).versoes, custo: 0 };
    }
    const r = await gerarRoteiro(pedido);
    await auditar(s, "roteiro_gerado", id, { versoes, ajuste: ajuste ?? null, custo: r.custo });
    return { ok: true, mensagem: `Gerado pelo Claude${r.custo != null ? ` · custo R$ ${r.custo.toFixed(3)}` : ""}`, versoes: r.versoes, custo: r.custo };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message, versoes: [] };
  }
}

/* Passo 3 — avatar e cenário */
export async function salvarAvatarCenario(id: string, fd: FormData) {
  const s = await exigir(["admin", "editor"]);
  const { video } = await meu(id, s);
  const cen = String(fd.get("cenarioId") ?? "");
  const roteiro = video.roteiro.map((b) => {
    const t = fd.get(`tipo_${b.id}`);
    return t ? { ...b, tipo: String(t) as BlocoRoteiro["tipo"] } : b;
  });
  await atualizar(id, {
    avatarId: String(fd.get("avatarId") || "") || null, cenarioId: cen && cen !== "novo" ? cen : null,
    enquadramento: String(fd.get("enquadramento") || "meio_corpo"), olhar: String(fd.get("olhar") || "camera"), roteiro,
    legendas: fd.get("legendas") === "on", logoId: String(fd.get("logoId") || "") || null, trilhaId: String(fd.get("trilhaId") || "") || null,
  });
  redirect(`/videos/${id}/motores`);
}

/* Passo 4 — motores e custo */
export async function calcularEstimativa(id: string, modo: Modo, motores: Partial<Record<Etapa, string>>) {
  const s = await exigir(["admin", "editor"]);
  const { video, avatar } = await meu(id, s);
  await atualizar(id, { modo, motores });
  const v = { ...video, modo, motores };
  const modos: Modo[] = ["economico", "equilibrado", "premium", "manual"];
  const todos = await Promise.all(modos.map(async (m) => ({ modo: m, est: await estimarVideo(v, avatar, m) })));
  const atual = todos.find((t) => t.modo === modo)!.est;
  return {
    atual: { ...atual, plano: undefined },
    comparacao: todos.map((t) => ({ modo: t.modo, total: t.est.totalBrl, aConfirmar: t.est.aConfirmar })),
  };
}

export async function gerarPreviaAcao(id: string): Promise<R & { bloqueio?: boolean }> {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  try {
    const est = await gerarPrevia(id, s);
    await auditar(s, "previa_gerada", id, { estimado: est.totalBrl, modo: est.modo });
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message, bloqueio: e instanceof BloqueioOrcamento };
  }
  redirect(`/videos/${id}`);
}

export async function aprovarExcedente(id: string): Promise<R> {
  const s = await exigir(["admin"]);
  await atualizar(id, { aprovadoExcedente: true });
  await auditar(s, "orcamento_excedente_aprovado", id);
  return { ok: true, mensagem: "Excedente aprovado pelo Administrador" };
}

/* Revisão e editor */
export async function regerarTrecho(id: string, cenaId: string, texto?: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  try { await regerarCena(id, cenaId, texto); await auditar(s, "trecho_regerado", id, { cenaId }); revalidatePath(`/videos/${id}`); return { ok: true, mensagem: "Regerando trecho…" }; }
  catch (e) { return { ok: false, mensagem: (e as Error).message }; }
}

export async function custoTrecho(id: string, cenaId: string) {
  await exigir(["admin", "editor"]);
  return custoRegerarCena(id, cenaId);
}

export async function corrigirOlharAcao(id: string, cenaId: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  try { await corrigirOlhar(id, cenaId); revalidatePath(`/videos/${id}`); return { ok: true, mensagem: "Corrigindo olhar…" }; }
  catch (e) { return { ok: false, mensagem: (e as Error).message }; }
}

export async function salvarAcabamento(id: string, fd: FormData): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  const cfg = (await carregarContexto()).config;
  await atualizar(id, {
    legendas: fd.get("legendas") === "on", logoId: String(fd.get("logoId") || "") || null, trilhaId: String(fd.get("trilhaId") || "") || null,
    // Rótulo "gerado por IA" ligado por padrão; só o Administrador pode desligar
    marcaDagua: s.papel === "admin" ? fd.get("marcaDagua") === "on" : true,
  });
  void cfg;
  return { ok: true, mensagem: "Acabamento salvo — clique em Remontar prévia para aplicar" };
}

export async function remontarPrevia(id: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  const db = await getDb();
  await db.insert(schema.jobs).values({ videoId: id, etapa: "montagem", provedor: "local", entrada: { qualidade: "previa", ladoCurto: 480 } });
  await atualizar(id, { status: "gerando" });
  return { ok: true, mensagem: "Remontando (sem custo de IA)…" };
}

export async function enviarParaAprovacao(id: string): Promise<R & { link?: string }> {
  const s = await exigir(["admin", "editor"]);
  const { video } = await meu(id, s);
  if (!video.previa) return { ok: false, mensagem: "Gere a prévia primeiro" };
  const db = await getDb();
  const t = token(18);
  await db.insert(schema.aprovacoes).values({ videoId: id, token: t, arquivo: video.previa });
  await atualizar(id, { status: "em_aprovacao" });
  await auditar(s, "enviado_aprovacao", id);
  revalidatePath(`/videos/${id}`);
  return { ok: true, mensagem: "Link de aprovação criado", link: `${env.appUrl}/a/${t}` };
}

export async function aprovarERenderizar(id: string, resolucao: 720 | 1080, proporcoes: string[]): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  try { await renderizarFinal(id, resolucao, proporcoes); await auditar(s, "render_final", id, { resolucao, proporcoes }); revalidatePath(`/videos/${id}`); return { ok: true, mensagem: "Renderizando versão final…" }; }
  catch (e) { return { ok: false, mensagem: (e as Error).message }; }
}

export async function statusVideo(id: string) {
  const s = await exigir();
  const { video } = await meu(id, s);
  const p = await progresso(id);
  return {
    status: video.status, erro: video.erro, pct: p.pct, custoReal: video.custoReal, previa: urlRelativa(video.previa),
    jobs: p.jobs.map((j) => ({ id: j.id, etapa: j.etapa, provedor: j.provedor, modelo: j.modelo, status: j.status, tentativas: j.tentativas, erro: j.erro, custo: j.custo, fallbackDe: j.fallbackDe, cenaId: j.cenaId })),
  };
}

/* Projetos e biblioteca */
export async function duplicarVideo(id: string, fd: FormData) {
  const s = await exigir(["admin", "editor"]);
  const { video } = await meu(id, s);
  const db = await getDb();
  const { id: _i, criadoEm: _c, atualizadoEm: _a, previa: _p, final: _f, finais: _fs, qualidade: _q, custoReal: _cr, erro: _e, isModelo: _m, modeloNome: _mn, ...resto } = video;
  void _i; void _c; void _a; void _p; void _f; void _fs; void _q; void _cr; void _e; void _m; void _mn;
  const [n] = await db.insert(schema.videos).values({
    ...resto, titulo: `${video.titulo} (variação)`, status: "rascunho", criadoPor: s.id,
    avatarId: String(fd.get("avatarId") || "") || video.avatarId, cenarioId: String(fd.get("cenarioId") || "") || video.cenarioId,
    duracaoAlvo: Number(fd.get("duracao") || video.duracaoAlvo), roteiro: video.roteiro.map((b) => ({ ...b, id: `${b.id}d${Date.now().toString(36)}` })),
  }).returning();
  await auditar(s, "video_duplicado", n.id, { origem: id });
  redirect(`/videos/${n.id}/formato`);
}

export async function salvarComoModelo(id: string, nome: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { video } = await meu(id, s);
  const db = await getDb();
  const { id: _i, criadoEm: _c, atualizadoEm: _a, ...resto } = video;
  void _i; void _c; void _a;
  await db.insert(schema.videos).values({ ...resto, isModelo: true, modeloNome: nome || video.titulo, status: "rascunho", previa: null, final: null, finais: {}, custoReal: 0, criadoPor: s.id });
  return { ok: true, mensagem: `Modelo “${nome || video.titulo}” salvo` };
}

export async function salvarTrechoBiblioteca(id: string, cenaId: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { video } = await meu(id, s);
  const db = await getDb();
  const [c] = await db.select().from(schema.cenas).where(and(eq(schema.cenas.id, cenaId), eq(schema.cenas.videoId, id)));
  if (!c?.arquivo) return { ok: false, mensagem: "Esta cena não tem vídeo próprio para reaproveitar" };
  await db.insert(schema.biblioteca).values({ tipo: "trecho", nome: c.texto.slice(0, 60) || "Trecho", arquivo: c.arquivo, texto: c.texto, empresaId: video.empresaId, origem: `video:${id}`, tags: [] });
  return { ok: true, mensagem: "Trecho salvo na biblioteca" };
}

export async function excluirVideo(id: string) {
  const s = await exigir(["admin", "editor"]);
  await meu(id, s);
  const db = await getDb();
  await db.delete(schema.videos).where(eq(schema.videos.id, id));
  await auditar(s, "video_excluido", id);
  redirect("/projetos");
}

/** "Ouvir prévia da voz": custo exibido antes; gera um áudio rápido do roteiro inteiro. */
export async function custoPreviaVoz(id: string, roteiro: BlocoRoteiro[]) {
  const s = await exigir(["admin", "editor"]);
  const { video, avatar } = await meu(id, s);
  const est = await estimarVideo({ ...video, roteiro }, avatar);
  const l = est.linhas.find((x) => x.etapa === "voz");
  return { custo: l?.custoBrl ?? null, motor: l ? `${l.provedor}/${l.modelo}` : null, simulado: !!est.plano.voz?.simulado };
}

export async function ouvirPreviaVoz(id: string, roteiro: BlocoRoteiro[]): Promise<R & { tarefa?: string }> {
  const s = await exigir(["admin", "editor"]);
  const { video, avatar } = await meu(id, s);
  const est = await estimarVideo({ ...video, roteiro }, avatar);
  const voz = est.plano.voz;
  if (!voz) return { ok: false, mensagem: "Nenhum motor de voz disponível" };
  const { enfileirarTarefa } = await import("@/lib/tarefas");
  const tarefa = await enfileirarTarefa("previa_voz", {
    videoId: id, roteiro, provedor: voz.provedor, modelo: voz.modelo, simulado: voz.simulado,
    vozId: avatar?.modelos?.[voz.provedor], custo: est.linhas.find((x) => x.etapa === "voz")?.custoBrl ?? null,
  });
  return { ok: true, mensagem: "Gerando a voz…", tarefa };
}
