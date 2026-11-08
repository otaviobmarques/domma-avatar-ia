"use server";
import fs from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Amostras } from "@/db/schema";
import { exigir, ehAdmin } from "@/lib/auth";
import { auditar } from "@/lib/auditoria";
import { salvar, apagarPrefixo, arquivoLocal, ler, tipoPorExtensao } from "@/lib/storage";
import { sha256 } from "@/lib/crypto";
import { textoTermo, TERMO_VERSAO, fraseAleatoria, cpfValido } from "@/lib/termo";
import * as ff from "@/lib/ffmpeg";
import { conector } from "@/lib/conectores";
import { credenciais, registrarChamada } from "@/lib/integracoes";
import { carregarContexto, disponibilidade } from "@/lib/orquestrador";
import { compararRosto } from "@/lib/claude";
import { gerarPrevia } from "@/lib/pipeline";

type R = { ok: boolean; mensagem: string };

async function carregar(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.avatares).where(eq(schema.avatares.id, id));
  if (!a || a.status === "excluido") throw new Error("Avatar não encontrado");
  return { db, a };
}

const ext = (f: File, padrao: string) => (path.extname(f.name) || padrao).toLowerCase();

export async function criarAvatar(fd: FormData) {
  const s = await exigir(["admin", "editor"]);
  const db = await getDb();
  const [a] = await db.insert(schema.avatares).values({
    nome: String(fd.get("nome") || "Novo avatar"), empresaId: String(fd.get("empresaId") || "") || s.empresaId, criadoPor: s.id, verificacao: { frase: fraseAleatoria(), geradaEm: new Date().toISOString(), status: "pendente" },
  }).returning();
  await auditar(s, "avatar_criado", a.id);
  redirect(`/avatares/${a.id}?passo=1`);
}

/** Passo 1 — consentimento específico (biométrico), com nome e CPF da própria pessoa. */
export async function aceitarConsentimento(id: string, fd: FormData): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  const nome = String(fd.get("nome") ?? "").trim();
  const cpf = String(fd.get("cpf") ?? "").replace(/\D/g, "");
  const finalidade = String(fd.get("finalidade") ?? "").trim();
  const prazoMeses = Math.max(1, Math.min(60, Number(fd.get("prazoMeses") ?? 12)));
  if (!nome || !finalidade) return { ok: false, mensagem: "Preencha nome e finalidade" };
  if (!cpfValido(cpf)) return { ok: false, mensagem: "CPF inválido" };
  if (fd.get("aceite") !== "on" || fd.get("propriaPessoa") !== "on") return { ok: false, mensagem: "É preciso marcar o aceite e confirmar que é a própria pessoa" };
  const [emp] = a.empresaId ? await db.select().from(schema.empresas).where(eq(schema.empresas.id, a.empresaId)) : [];
  const termo = textoTermo({ nome, cpf, finalidade, prazoMeses, empresa: emp?.nome ?? "" });
  const h = await headers();
  const validade = new Date();
  validade.setMonth(validade.getMonth() + prazoMeses);
  const cpfMasc = `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
  const arquivo = await salvar(`avatares/${id}/consentimento_v${TERMO_VERSAO}.txt`, Buffer.from(`${termo}\n\nAceito em: ${new Date().toISOString()}\nIP: ${h.get("x-forwarded-for") ?? "-"}\n`), "text/plain");
  await db.update(schema.avatares).set({
    consentimento: { termoVersao: TERMO_VERSAO, nome, cpf: cpfMasc, finalidade, prazoMeses, aceitoEm: new Date().toISOString(), ip: h.get("x-forwarded-for"), userAgent: h.get("user-agent"), hashTermo: sha256(termo) },
    consentimentoValidade: validade, status: a.status === "rascunho" ? "consentido" : a.status, nome: a.nome === "Novo avatar" ? nome : a.nome,
    amostras: { ...a.amostras, checklist: { ...(a.amostras.checklist ?? {}), termoArquivo: !!arquivo } },
  }).where(eq(schema.avatares.id, id));
  await auditar(s, "consentimento_aceito", id, { versao: TERMO_VERSAO, hash: sha256(termo), validade: validade.toISOString() });
  revalidatePath(`/avatares/${id}`);
  return { ok: true, mensagem: "Consentimento registrado" };
}

/** Passo 2 — verificação ao vivo: grava pela câmera a frase aleatória gerada na hora. */
export async function enviarVerificacao(id: string, fd: FormData): Promise<R> {
  await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  if (!a.consentimento) return { ok: false, mensagem: "Faça o consentimento primeiro" };
  const f = fd.get("video") as File | null;
  if (!f || !f.size) return { ok: false, mensagem: "Grave o vídeo de verificação" };
  const bruto = await salvar(`avatares/${id}/verificacao${ext(f, ".webm")}`, Buffer.from(await f.arrayBuffer()), f.type);
  await db.update(schema.avatares).set({ verificacao: { ...a.verificacao!, video: bruto, gravadaEm: new Date().toISOString(), status: "gravada" }, status: a.status === "consentido" ? "verificado" : a.status })
    .where(eq(schema.avatares.id, id));
  revalidatePath(`/avatares/${id}`);
  return { ok: true, mensagem: "Verificação gravada. O rosto será comparado com as fotos no passo 3." };
}

export async function novaFrase(id: string): Promise<R> {
  await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  await db.update(schema.avatares).set({ verificacao: { frase: fraseAleatoria(), geradaEm: new Date().toISOString(), status: "pendente" } }).where(eq(schema.avatares.id, a.id));
  revalidatePath(`/avatares/${id}`);
  return { ok: true, mensagem: "Nova frase gerada" };
}

/** Passo 3 — rosto: vídeo de 2 a 5 min + 5 a 10 fotos, com checklist automático. */
export async function enviarRosto(id: string, fd: FormData): Promise<R & { checklist?: Record<string, boolean>; detalhes?: string[] }> {
  await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  const amostras: Amostras = { ...a.amostras, fotos: [...(a.amostras.fotos ?? [])] };
  const detalhes: string[] = [];
  const check: Record<string, boolean> = { ...(amostras.checklist ?? {}) };
  const dir = await ff.tmp("rosto-");
  const v = fd.get("video") as File | null;
  if (v && v.size) {
    const bruto = path.join(dir, `bruto${ext(v, ".mp4")}`);
    await fs.writeFile(bruto, Buffer.from(await v.arrayBuffer()));
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
    amostras.video = await salvar(`avatares/${id}/rosto.mp4`, await fs.readFile(mp4), "video/mp4");
    amostras.videoDuracao = d;
  }
  const fotos = fd.getAll("fotos").filter((x): x is File => x instanceof File && x.size > 0);
  for (const [i, f] of fotos.entries()) {
    const p = await salvar(`avatares/${id}/fotos/${Date.now()}_${i}${ext(f, ".jpg")}`, Buffer.from(await f.arrayBuffer()), f.type || "image/jpeg");
    amostras.fotos.push(p);
  }
  amostras.fotos = amostras.fotos.slice(-10);
  check.fotos = amostras.fotos.length >= 5 && amostras.fotos.length <= 10;
  detalhes.push(`${amostras.fotos.length} foto(s) ${check.fotos ? "✓" : "(envie de 5 a 10, ângulos e expressões variados)"}`);
  amostras.checklist = check;
  await db.update(schema.avatares).set({ amostras, foto: a.foto ?? amostras.fotos[0] ?? null, status: a.status === "verificado" ? "amostras" : a.status }).where(eq(schema.avatares.id, id));
  await fs.rm(dir, { recursive: true, force: true });
  revalidatePath(`/avatares/${id}`);
  return { ok: true, mensagem: "Material enviado", checklist: check, detalhes };
}

export async function definirFotoPrincipal(id: string, foto: string): Promise<R> {
  await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  if (!a.amostras.fotos.includes(foto)) return { ok: false, mensagem: "Foto inválida" };
  await db.update(schema.avatares).set({ foto }).where(eq(schema.avatares.id, id));
  revalidatePath(`/avatares/${id}`);
  return { ok: true, mensagem: "Foto principal definida" };
}

/** Compara o rosto da verificação ao vivo com as fotos (Claude). Sem Claude: aprovação manual do Administrador. */
export async function verificarRosto(id: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  if (!a.verificacao?.video) return { ok: false, mensagem: "Grave a verificação (passo 2)" };
  if (a.amostras.fotos.length < 1) return { ok: false, mensagem: "Envie as fotos (passo 3)" };
  const ctx = await carregarContexto();
  if (!disponibilidade(ctx, "anthropic").ok) {
    if (ctx.config.modoDemo) {
      await db.update(schema.avatares).set({ verificacao: { ...a.verificacao, status: "aprovada", observacao: "Modo demonstração — comparação facial simulada (sem Claude). Revise antes de usar com clientes." } }).where(eq(schema.avatares.id, id));
      await auditar(s, "verificacao_aprovada_demo", id);
      revalidatePath(`/avatares/${id}`);
      return { ok: true, mensagem: "Modo demonstração: verificação aprovada sem comparação real" };
    }
    return { ok: false, mensagem: "Claude não disponível. O Administrador pode aprovar a verificação manualmente." };
  }
  const dir = await ff.tmp("verif-");
  try {
    const local = await arquivoLocal(a.verificacao.video, dir);
    const frames = await ff.extrairFrames(local, 3, 640);
    const fotos = await Promise.all(a.amostras.fotos.slice(0, 3).map(async (f) => ({ dados: await ler(f), tipo: tipoPorExtensao(f) })));
    const r = await compararRosto({ avatarId: id, verificacao: frames.map((f) => f.arquivo), fotos });
    const aprovada = r.mesmaPessoa && r.confianca !== "baixa";
    await db.update(schema.avatares).set({ verificacao: { ...a.verificacao, status: aprovada ? "aprovada" : "reprovada", observacao: `Claude (${r.confianca}): ${r.observacao}` } }).where(eq(schema.avatares.id, id));
    await auditar(s, aprovada ? "verificacao_aprovada" : "verificacao_reprovada", id, r);
    revalidatePath(`/avatares/${id}`);
    return { ok: aprovada, mensagem: aprovada ? `Rosto confere (${r.confianca}). ${r.observacao}` : `Não confere: ${r.observacao}` };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

export async function aprovarVerificacaoManual(id: string, fd: FormData): Promise<R> {
  const s = await exigir(["admin"]);
  if (!ehAdmin(s)) return { ok: false, mensagem: "Só o Administrador" };
  const { db, a } = await carregar(id);
  if (!a.verificacao?.video) return { ok: false, mensagem: "Sem gravação de verificação" };
  const obs = String(fd.get("observacao") ?? "").trim() || "Conferido manualmente pelo Administrador";
  await db.update(schema.avatares).set({ verificacao: { ...a.verificacao, status: "aprovada", observacao: `Manual (${s.email}): ${obs}` } }).where(eq(schema.avatares.id, id));
  await auditar(s, "verificacao_aprovada_manual", id, { obs });
  revalidatePath(`/avatares/${id}`);
  return { ok: true, mensagem: "Verificação aprovada" };
}

/** Passo 4 — voz: 2 minutos de leitura guiada, com medidor de ruído. */
export async function enviarVoz(id: string, fd: FormData): Promise<R> {
  await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  const f = fd.get("audio") as File | null;
  if (!f || !f.size) return { ok: false, mensagem: "Grave ou envie o áudio" };
  const dir = await ff.tmp("voz-");
  const bruto = path.join(dir, `bruto${ext(f, ".webm")}`);
  await fs.writeFile(bruto, Buffer.from(await f.arrayBuffer()));
  const mp3 = path.join(dir, "voz.mp3");
  await ff.converterAudio(mp3, bruto);
  const final = (await fs.stat(mp3).catch(() => null)) ? mp3 : mp3.replace(/\.mp3$/, ".m4a");
  const d = await ff.duracao(final);
  const db_ = await ff.nivelMedioDb(final);
  const p = await salvar(`avatares/${id}/voz${path.extname(final)}`, await fs.readFile(final), "audio/mpeg");
  await fs.rm(dir, { recursive: true, force: true });
  const check = { ...(a.amostras.checklist ?? {}), vozDuracao: d >= 90, vozNivel: db_ != null && db_ > -35 && db_ < -8 };
  await db.update(schema.avatares).set({ amostras: { ...a.amostras, voz: p, vozDuracao: d, vozRuidoDb: db_ ?? undefined, checklist: check } }).where(eq(schema.avatares.id, id));
  revalidatePath(`/avatares/${id}`);
  const avisos = [!check.vozDuracao && "grave pelo menos 1min30 (ideal 2 min)", !check.vozNivel && "nível de áudio fora do ideal (fale mais perto do microfone, em local silencioso)"].filter(Boolean);
  return { ok: true, mensagem: `Voz enviada (${Math.round(d)}s, ${db_?.toFixed(0) ?? "?"} dB)${avisos.length ? ` — atenção: ${avisos.join("; ")}` : ""}` };
}

/** Passo 5 — treina a voz nos motores escolhidos e registra os IDs dos modelos. */
export async function treinarVoz(id: string, prov: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  if (!a.amostras.voz) return { ok: false, mensagem: "Envie a voz no passo 4" };
  const ctx = await carregarContexto();
  if (!disponibilidade(ctx, prov).ok) {
    if (ctx.config.modoDemo) {
      await db.update(schema.avatares).set({ modelos: { ...a.modelos, [prov]: `demo-${prov}` } }).where(eq(schema.avatares.id, id));
      revalidatePath(`/avatares/${id}`);
      return { ok: true, mensagem: `Modo demonstração: voz marcada como treinada em ${prov} (simulada)` };
    }
    return { ok: false, mensagem: `${prov} não está ligado em Integrações` };
  }
  const inicio = Date.now();
  try {
    const vozId = await conector(prov).clonarVoz!(await credenciais(prov), { nome: `${a.nome} (Domma AvatarIA ${id.slice(0, 6)})`, amostra: await ler(a.amostras.voz), nomeArquivo: path.basename(a.amostras.voz) });
    await db.update(schema.avatares).set({ modelos: { ...a.modelos, [prov]: vozId } }).where(eq(schema.avatares.id, id));
    await registrarChamada({ provedor: prov, acao: "clonar_voz", inicio, sucesso: true, custo: 0 });
    await auditar(s, "voz_treinada", id, { prov });
    revalidatePath(`/avatares/${id}`);
    return { ok: true, mensagem: `Voz treinada em ${prov}` };
  } catch (e) {
    await registrarChamada({ provedor: prov, acao: "clonar_voz", inicio, sucesso: false, erro: (e as Error).message });
    return { ok: false, mensagem: (e as Error).message };
  }
}

/** IDs de modelos treinados fora (ex.: gêmeo digital HeyGen criado no painel deles). */
export async function salvarModelos(id: string, fd: FormData): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  const modelos = { ...a.modelos };
  for (const k of ["heygen", "elevenlabs", "voicestudio"]) {
    const v = String(fd.get(k) ?? "").trim();
    if (v) modelos[k] = v; else if (fd.has(k)) delete modelos[k];
  }
  await db.update(schema.avatares).set({ modelos, motorVoz: String(fd.get("motorVoz") || "") || a.motorVoz, motorAvatar: String(fd.get("motorAvatar") || "") || a.motorAvatar }).where(eq(schema.avatares.id, id));
  await auditar(s, "avatar_modelos", id, modelos);
  revalidatePath(`/avatares/${id}`);
  return { ok: true, mensagem: "Motores salvos" };
}

/** Comparar vozes (A/B): mesmo texto em dois motores, sem dizer qual é qual. */
export async function compararVozes(id: string, texto: string): Promise<R & { amostras?: { rotulo: string; url: string; motor: string }[] }> {
  await exigir(["admin", "editor"]);
  const { a } = await carregar(id);
  const ctx = await carregarContexto();
  const motores = [["voicestudio", "voicestudio-tts"], ["elevenlabs", "eleven_multilingual_v2"]] as const;
  const { urlRelativa } = await import("@/lib/storage");
  const res: { rotulo: string; url: string; motor: string }[] = [];
  for (const [prov, modelo] of motores) {
    const real = disponibilidade(ctx, prov).ok && a.modelos[prov] && !a.modelos[prov].startsWith("demo-");
    const destino = `avatares/${id}/ab/${prov}_${Date.now()}.${real ? "mp3" : "m4a"}`;
    if (real) {
      const inicio = Date.now();
      const r = await conector(prov).voz!(await credenciais(prov), { texto, vozId: a.modelos[prov], modelo });
      await salvar(destino, r.audio, "audio/mpeg");
      await registrarChamada({ provedor: prov, modelo, acao: "teste_ab", inicio, sucesso: true });
    } else if (ctx.config.modoDemo) {
      const dir = await ff.tmp();
      const f = path.join(dir, "v.m4a");
      await ff.vozSimulada(f, texto);
      await salvar(destino, await fs.readFile(f), "audio/mp4");
      await fs.rm(dir, { recursive: true, force: true });
    } else continue;
    res.push({ rotulo: "", url: urlRelativa(destino)!, motor: real ? prov : `${prov} (simulado)` });
  }
  if (res.length < 2) return { ok: false, mensagem: "É preciso dois motores de voz disponíveis (ou o modo demonstração)" };
  res.sort(() => Math.random() - 0.5).forEach((r, i) => (r.rotulo = i === 0 ? "A" : "B"));
  return { ok: true, mensagem: "Ouça as duas e escolha", amostras: res };
}

export async function concluirAvatar(id: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  const faltas: string[] = [];
  if (!a.consentimento || !a.consentimentoValidade || a.consentimentoValidade < new Date()) faltas.push("consentimento válido");
  if (a.verificacao?.status !== "aprovada") faltas.push("verificação ao vivo aprovada");
  if (!a.foto) faltas.push("foto");
  if (!a.amostras.voz) faltas.push("amostra de voz");
  if (!Object.keys(a.modelos).some((k) => ["voicestudio", "elevenlabs"].includes(k))) faltas.push("voz treinada em pelo menos um motor");
  if (faltas.length) return { ok: false, mensagem: `Falta: ${faltas.join(", ")}` };
  await db.update(schema.avatares).set({ status: "pronto" }).where(eq(schema.avatares.id, id));
  await auditar(s, "avatar_concluido", id);
  revalidatePath("/avatares");
  return { ok: true, mensagem: "Avatar liberado para uso" };
}

/** "Testar": gera uma frase curta com voz + rosto para conferência. */
export async function testarAvatar(id: string): Promise<R & { videoId?: string }> {
  const s = await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  if (a.status !== "pronto") return { ok: false, mensagem: "Conclua o avatar antes de testar" };
  const [v] = await db.insert(schema.videos).values({
    titulo: `Teste — ${a.nome}`, projeto: "Testes de avatar", empresaId: a.empresaId, avatarId: a.id, formato: "apresentacao", duracaoAlvo: 8, modo: "economico", criadoPor: s.id,
    roteiro: [{ id: "t1", tipo: "avatar", texto: `Olá! Eu sou o gêmeo digital de ${a.nome.split(" ")[0]}. [pausa] Este é um teste rápido.`, marcacoes: ["olha_camera"], enquadramento: "rosto" }],
    legendas: true,
  }).returning();
  try {
    await gerarPrevia(v.id, s);
    return { ok: true, mensagem: "Teste em geração", videoId: v.id };
  } catch (e) { return { ok: false, mensagem: (e as Error).message, videoId: v.id }; }
}

/** "Excluir meu clone": apaga rosto, voz e modelos no sistema e nos provedores. Mantém o registro do consentimento (prova legal). */
export async function excluirClone(id: string): Promise<R> {
  const s = await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  const relatorio: string[] = [];
  for (const [prov, modeloId] of Object.entries(a.modelos)) {
    if (modeloId.startsWith("demo-")) continue;
    const c = (await import("@/lib/conectores")).CONECTORES[prov];
    if (c?.excluirVoz) {
      try { await c.excluirVoz(await credenciais(prov), modeloId); relatorio.push(`${prov}: excluído`); }
      catch (e) { relatorio.push(`${prov}: falhou (${(e as Error).message.slice(0, 80)}) — solicitar manualmente`); }
    } else relatorio.push(`${prov}: solicitar exclusão no painel do provedor (ID ${modeloId})`);
  }
  await apagarPrefixo(`avatares/${id}/fotos`);
  await apagarPrefixo(`avatares/${id}/ab`);
  for (const f of [a.amostras.video, a.amostras.voz, a.verificacao?.video].filter(Boolean) as string[]) {
    await apagarPrefixo(f).catch(() => {});
  }
  await db.update(schema.avatares).set({ status: "excluido", excluidoEm: new Date(), foto: null, amostras: { fotos: [] }, modelos: {}, verificacao: null }).where(eq(schema.avatares.id, id));
  await auditar(s, "clone_excluido", id, { relatorio });
  revalidatePath("/avatares");
  return { ok: true, mensagem: `Clone excluído. ${relatorio.join(" · ") || "Nenhum modelo externo."}` };
}
