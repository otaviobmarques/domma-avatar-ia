import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Amostras, BlocoRoteiro, Tarefa } from "@/db/schema";
import * as ff from "./ffmpeg";
import { salvar, arquivoLocal, ler, tipoPorExtensao } from "./storage";
import { carregarContexto, disponibilidade, textoFalado } from "./orquestrador";
import { compararRosto } from "./claude";
import { conector } from "./conectores";
import { credenciais, registrarChamada } from "./integracoes";
import { auditar } from "./auditoria";

/**
 * Tarefas pesadas (FFmpeg / chamadas longas) que rodam no worker.
 * O servidor web (Vercel) só enfileira; a tela acompanha pelo id do job.
 */
export type Resultado = { ok: boolean; mensagem: string; [k: string]: unknown };

export async function enfileirarTarefa(etapa: Tarefa, entrada: Record<string, unknown>, videoId?: string) {
  const db = await getDb();
  const [j] = await db.insert(schema.jobs).values({ etapa, provedor: "local", entrada, videoId: videoId ?? null, maxTentativas: 2 }).returning();
  return j.id;
}

async function avatar(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.avatares).where(eq(schema.avatares.id, id));
  if (!a) throw new Error("Avatar não encontrado");
  return { db, a };
}

/** Passo 3 — converte o vídeo, checa duração/resolução/luz e anexa as fotos. */
async function procRosto(e: { avatarId: string; video?: string; fotos?: string[] }): Promise<Resultado> {
  const { db, a } = await avatar(e.avatarId);
  const amostras: Amostras = { ...a.amostras, fotos: [...(a.amostras.fotos ?? [])] };
  const check: Record<string, boolean> = { ...(amostras.checklist ?? {}) };
  const detalhes: string[] = [];
  const dir = await ff.tmp("rosto-");
  try {
    if (e.video) {
      const bruto = await arquivoLocal(e.video, dir);
      const mp4 = path.join(dir, "rosto.mp4");
      await ff.converterParaMp4(mp4, bruto);
      const d = await ff.duracao(mp4);
      const dim = await ff.dimensoesMidia(mp4);
      const luz = await ff.brilhoMedio(mp4);
      check.duracao = d >= 120 && d <= 300;
      check.resolucao = !!dim && Math.min(dim.w, dim.h) >= 720;
      check.luz = luz != null && luz >= 70 && luz <= 200;
      detalhes.push(`Duração ${Math.round(d)}s ${check.duracao ? "✓" : "(ideal: 2 a 5 min)"}`);
      detalhes.push(`Resolução ${dim ? `${dim.w}×${dim.h}` : "?"} ${check.resolucao ? "✓" : "(mín. 720p)"}`);
      detalhes.push(`Luz média ${luz?.toFixed(0) ?? "?"} ${check.luz ? "✓" : luz != null && luz < 70 ? "(escuro — use luz frontal)" : "(estourado)"}`);
      amostras.video = await salvar(`avatares/${a.id}/rosto.mp4`, await fs.readFile(mp4), "video/mp4");
      amostras.videoDuracao = d;
    }
    for (const f of e.fotos ?? []) amostras.fotos.push(f);
    amostras.fotos = amostras.fotos.slice(-10);
    check.fotos = amostras.fotos.length >= 5 && amostras.fotos.length <= 10;
    detalhes.push(`${amostras.fotos.length} foto(s) ${check.fotos ? "✓" : "(envie de 5 a 10, ângulos e expressões variados)"}`);
    amostras.checklist = check;
    await db.update(schema.avatares).set({ amostras, foto: a.foto ?? amostras.fotos[0] ?? null, status: a.status === "verificado" ? "amostras" : a.status }).where(eq(schema.avatares.id, a.id));
    return { ok: true, mensagem: `Material enviado. ${detalhes.join(" · ")}` };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Passo 4 — converte a voz, mede duração e nível. */
async function procVoz(e: { avatarId: string; bruto: string }): Promise<Resultado> {
  const { db, a } = await avatar(e.avatarId);
  const dir = await ff.tmp("voz-");
  try {
    const bruto = await arquivoLocal(e.bruto, dir);
    const mp3 = path.join(dir, "voz.mp3");
    await ff.converterAudio(mp3, bruto);
    const final = (await fs.stat(mp3).catch(() => null)) ? mp3 : mp3.replace(/\.mp3$/, ".m4a");
    const d = await ff.duracao(final);
    const nivel = await ff.nivelMedioDb(final);
    const p = await salvar(`avatares/${a.id}/voz${path.extname(final)}`, await fs.readFile(final), "audio/mpeg");
    const check = { ...(a.amostras.checklist ?? {}), vozDuracao: d >= 90, vozNivel: nivel != null && nivel > -35 && nivel < -8 };
    await db.update(schema.avatares).set({ amostras: { ...a.amostras, voz: p, vozDuracao: d, vozRuidoDb: nivel ?? undefined, checklist: check } }).where(eq(schema.avatares.id, a.id));
    const avisos = [!check.vozDuracao && "grave pelo menos 1min30 (ideal 2 min)", !check.vozNivel && "nível de áudio fora do ideal (fale mais perto do microfone, em local silencioso)"].filter(Boolean);
    return { ok: true, mensagem: `Voz enviada (${Math.round(d)}s, ${nivel?.toFixed(0) ?? "?"} dB)${avisos.length ? ` — atenção: ${avisos.join("; ")}` : ""}` };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Compara o rosto da verificação ao vivo com as fotos (Claude). */
async function verificarRosto(e: { avatarId: string; usuarioId?: string; usuarioEmail?: string }): Promise<Resultado> {
  const { db, a } = await avatar(e.avatarId);
  if (!a.verificacao?.video) return { ok: false, mensagem: "Grave a verificação (passo 2)" };
  const dir = await ff.tmp("verif-");
  try {
    const frames = await ff.extrairFrames(await arquivoLocal(a.verificacao.video, dir), 3, 640);
    const fotos = await Promise.all(a.amostras.fotos.slice(0, 3).map(async (f) => ({ dados: await ler(f), tipo: tipoPorExtensao(f) })));
    const r = await compararRosto({ avatarId: a.id, verificacao: frames.map((f) => f.arquivo), fotos });
    const aprovada = r.mesmaPessoa && r.confianca !== "baixa";
    await db.update(schema.avatares).set({ verificacao: { ...a.verificacao, status: aprovada ? "aprovada" : "reprovada", observacao: `Claude (${r.confianca}): ${r.observacao}` } }).where(eq(schema.avatares.id, a.id));
    await auditar(e.usuarioId ? { id: e.usuarioId, email: e.usuarioEmail ?? "" } : null, aprovada ? "verificacao_aprovada" : "verificacao_reprovada", a.id, r);
    return { ok: aprovada, mensagem: aprovada ? `Rosto confere (${r.confianca}). ${r.observacao}` : `Não confere: ${r.observacao}` };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Comparar vozes (A/B) às cegas. */
async function abVoz(e: { avatarId: string; texto: string }): Promise<Resultado> {
  const { a } = await avatar(e.avatarId);
  const ctx = await carregarContexto();
  const res: { rotulo: string; caminho: string; motor: string }[] = [];
  for (const [prov, modelo] of [["voicestudio", "voicestudio-tts"], ["elevenlabs", "eleven_multilingual_v2"]] as const) {
    const real = disponibilidade(ctx, prov).ok && a.modelos[prov] && !a.modelos[prov].startsWith("demo-");
    const destino = `avatares/${a.id}/ab/${prov}_${Date.now()}.${real ? "mp3" : "m4a"}`;
    if (real) {
      const inicio = Date.now();
      const r = await conector(prov).voz!(await credenciais(prov), { texto: e.texto, vozId: a.modelos[prov], modelo });
      await salvar(destino, r.audio, "audio/mpeg");
      await registrarChamada({ provedor: prov, modelo, acao: "teste_ab", inicio, sucesso: true });
    } else if (ctx.config.modoDemo) {
      const dir = await ff.tmp();
      await ff.vozSimulada(path.join(dir, "v.m4a"), e.texto);
      await salvar(destino, await fs.readFile(path.join(dir, "v.m4a")), "audio/mp4");
      await fs.rm(dir, { recursive: true, force: true });
    } else continue;
    res.push({ rotulo: "", caminho: destino, motor: real ? prov : `${prov} (simulado)` });
  }
  if (res.length < 2) return { ok: false, mensagem: "É preciso dois motores de voz disponíveis (ou o modo demonstração)" };
  res.sort(() => Math.random() - 0.5).forEach((r, i) => (r.rotulo = i === 0 ? "A" : "B"));
  return { ok: true, mensagem: "Ouça as duas e escolha", amostras: res };
}

/** "Ouvir prévia da voz" do roteiro. */
async function previaVoz(e: { videoId: string; roteiro: BlocoRoteiro[]; provedor: string; modelo: string; simulado: boolean; vozId?: string; custo: number | null }): Promise<Resultado> {
  const texto = e.roteiro.map((b) => textoFalado(b.texto)).filter(Boolean).join(" ... ");
  const destino = `videos/${e.videoId}/previa_voz_${Date.now()}`;
  if (e.simulado) {
    const dir = await ff.tmp();
    await ff.vozSimulada(path.join(dir, "v.m4a"), texto);
    const c = await salvar(`${destino}.m4a`, await fs.readFile(path.join(dir, "v.m4a")), "audio/mp4");
    await fs.rm(dir, { recursive: true, force: true });
    return { ok: true, mensagem: "Voz simulada (modo demonstração)", caminho: c };
  }
  if (!e.vozId) return { ok: false, mensagem: `Escolha um avatar com voz treinada em ${e.provedor} (passo 3)` };
  const inicio = Date.now();
  try {
    const r = await conector(e.provedor).voz!(await credenciais(e.provedor), { texto, vozId: e.vozId, modelo: e.modelo });
    const c = await salvar(`${destino}.${r.ext}`, r.audio, "audio/mpeg");
    await registrarChamada({ provedor: e.provedor, modelo: e.modelo, videoId: e.videoId, etapa: "voz", acao: "previa_voz", inicio, custo: e.custo, sucesso: true });
    return { ok: true, mensagem: `Prévia gerada em ${e.provedor}`, caminho: c };
  } catch (err) {
    await registrarChamada({ provedor: e.provedor, modelo: e.modelo, videoId: e.videoId, etapa: "voz", acao: "previa_voz", inicio, sucesso: false, erro: (err as Error).message });
    return { ok: false, mensagem: (err as Error).message };
  }
}

export const TAREFAS: Record<Tarefa, (e: never) => Promise<Resultado>> = {
  proc_rosto: procRosto, proc_voz: procVoz, verificar_rosto: verificarRosto, ab_voz: abVoz, previa_voz: previaVoz,
};
