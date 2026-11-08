"use server";
import path from "node:path";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir, ehAdmin } from "@/lib/auth";
import { auditar } from "@/lib/auditoria";
import { salvar, apagarPrefixo, ler, urlRelativa } from "@/lib/storage";
import { sha256 } from "@/lib/crypto";
import { textoTermo, TERMO_VERSAO, fraseAleatoria, cpfValido } from "@/lib/termo";
import { conector } from "@/lib/conectores";
import { credenciais, registrarChamada } from "@/lib/integracoes";
import { carregarContexto, disponibilidade } from "@/lib/orquestrador";
import { enfileirarTarefa } from "@/lib/tarefas";
import { gerarPrevia } from "@/lib/pipeline";

type R = { ok: boolean; mensagem: string };

async function carregar(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.avatares).where(eq(schema.avatares.id, id));
  if (!a || a.status === "excluido") throw new Error("Avatar não encontrado");
  return { db, a };
}


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

/** Passo 2 — verificação ao vivo: o vídeo já foi enviado direto ao Storage; aqui só registra. */
export async function enviarVerificacao(id: string, caminho: string): Promise<R> {
  await exigir(["admin", "editor"]);
  const { db, a } = await carregar(id);
  if (!a.consentimento) return { ok: false, mensagem: "Faça o consentimento primeiro" };
  if (!caminho.startsWith(`avatares/${id}/`)) return { ok: false, mensagem: "Arquivo inválido" };
  await db.update(schema.avatares).set({ verificacao: { ...a.verificacao!, video: caminho, gravadaEm: new Date().toISOString(), status: "gravada" }, status: a.status === "consentido" ? "verificado" : a.status })
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

/** Passo 3 — rosto: vídeo de 2 a 5 min + 5 a 10 fotos. A conversão e o checklist rodam no worker. */
export async function enviarRosto(id: string, e: { video?: string; fotos: string[] }): Promise<R & { tarefa?: string }> {
  await exigir(["admin", "editor"]);
  await carregar(id);
  const dono = (c: string) => c.startsWith(`avatares/${id}/`);
  if ((e.video && !dono(e.video)) || !e.fotos.every(dono)) return { ok: false, mensagem: "Arquivo inválido" };
  const tarefa = await enfileirarTarefa("proc_rosto", { avatarId: id, video: e.video, fotos: e.fotos });
  return { ok: true, mensagem: "Processando o material…", tarefa };
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
export async function verificarRosto(id: string): Promise<R & { tarefa?: string }> {
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
  const tarefa = await enfileirarTarefa("verificar_rosto", { avatarId: id, usuarioId: s.id, usuarioEmail: s.email });
  return { ok: true, mensagem: "Comparando rosto…", tarefa };
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

/** Passo 4 — voz: converte e mede no worker. */
export async function enviarVoz(id: string, caminho: string): Promise<R & { tarefa?: string }> {
  await exigir(["admin", "editor"]);
  await carregar(id);
  if (!caminho.startsWith(`avatares/${id}/`)) return { ok: false, mensagem: "Arquivo inválido" };
  const tarefa = await enfileirarTarefa("proc_voz", { avatarId: id, bruto: caminho });
  return { ok: true, mensagem: "Processando a voz…", tarefa };
}

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

/** Comparar vozes (A/B): mesmo texto em dois motores, sem dizer qual é qual. Gerado no worker. */
export async function compararVozes(id: string, texto: string): Promise<R & { tarefa?: string }> {
  await exigir(["admin", "editor"]);
  await carregar(id);
  const tarefa = await enfileirarTarefa("ab_voz", { avatarId: id, texto });
  return { ok: true, mensagem: "Gerando as duas vozes…", tarefa };
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

/** Acompanha uma tarefa do worker (a tela consulta a cada 1,5 s). */
export async function statusTarefa(jobId: string) {
  await exigir();
  const db = await getDb();
  const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!j) return { status: "erro" as const, ok: false, mensagem: "Tarefa não encontrada" };
  if (j.status === "erro") return { status: "erro" as const, ok: false, mensagem: j.erro ?? "Falhou" };
  if (j.status !== "ok") return { status: "rodando" as const, ok: false, mensagem: "" };
  const r = (j.resposta ?? {}) as { ok: boolean; mensagem: string; caminho?: string; amostras?: { rotulo: string; caminho: string; motor: string }[] };
  return { status: "ok" as const, ok: r.ok, mensagem: r.mensagem, url: r.caminho ? urlRelativa(r.caminho) : undefined, amostras: r.amostras?.map((x) => ({ rotulo: x.rotulo, motor: x.motor, url: urlRelativa(x.caminho)! })) };
}
