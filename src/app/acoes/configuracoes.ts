"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Papel, Modo, Etapa, Formato } from "@/db/schema";
import { exigir, hashSenha } from "@/lib/auth";
import { auditar } from "@/lib/auditoria";
import { salvarConfig, lerConfig } from "@/lib/config";
import { token } from "@/lib/crypto";
import { env } from "@/lib/env";

type R = { ok: boolean; mensagem: string };

/** "+ Usuário": cria o acesso com senha provisória (e envia por e-mail se RESEND_API_KEY estiver configurada). */
export async function convidarUsuario(fd: FormData): Promise<R> {
  const s = await exigir(["admin"]);
  const db = await getDb();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const nome = String(fd.get("nome") ?? "").trim() || email.split("@")[0];
  const papel = String(fd.get("papel") ?? "editor") as Papel;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, mensagem: "E-mail inválido" };
  const [existe] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
  if (existe) return { ok: false, mensagem: "Já existe um usuário com este e-mail" };
  const senha = token(9);
  await db.insert(schema.usuarios).values({ nome, email, papel, senhaHash: await hashSenha(senha), empresaId: String(fd.get("empresaId") || "") || null });
  await auditar(s, "usuario_convidado", email, { papel });
  let enviado = false;
  if (process.env.RESEND_API_KEY && process.env.EMAIL_REMETENTE) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_REMETENTE, to: email, subject: "Seu acesso ao Domma AvatarIA",
        html: `<p>Olá, ${nome}!</p><p>Você foi convidado para o <b>Domma AvatarIA</b> (Domma Tecnologia).</p><p>Acesse <a href="${env.appUrl}/entrar">${env.appUrl}/entrar</a><br>E-mail: ${email}<br>Senha provisória: <b>${senha}</b></p><p>Troque a senha no primeiro acesso.</p>` }),
    }).catch(() => null);
    enviado = !!r?.ok;
  }
  revalidatePath("/configuracoes");
  return { ok: true, mensagem: enviado ? `Convite enviado para ${email}` : `Usuário criado. Senha provisória: ${senha} (envie ao usuário; configure RESEND_API_KEY para enviar por e-mail)` };
}

export async function atualizarUsuario(id: string, fd: FormData): Promise<R> {
  const s = await exigir(["admin"]);
  if (id === s.id && String(fd.get("papel")) !== "admin") return { ok: false, mensagem: "Você não pode remover seu próprio acesso de Administrador" };
  const db = await getDb();
  await db.update(schema.usuarios).set({ papel: String(fd.get("papel")) as Papel, ativo: fd.get("ativo") === "on", empresaId: String(fd.get("empresaId") || "") || null }).where(eq(schema.usuarios.id, id));
  await auditar(s, "usuario_atualizado", id);
  revalidatePath("/configuracoes");
  return { ok: true, mensagem: "Usuário atualizado" };
}

export async function trocarSenha(fd: FormData): Promise<R> {
  const s = await exigir();
  const nova = String(fd.get("nova") ?? "");
  if (nova.length < 8) return { ok: false, mensagem: "A senha precisa de pelo menos 8 caracteres" };
  const db = await getDb();
  await db.update(schema.usuarios).set({ senhaHash: await hashSenha(nova) }).where(eq(schema.usuarios.id, s.id));
  await auditar(s, "senha_trocada", s.id);
  return { ok: true, mensagem: "Senha alterada" };
}

/** "+ Cliente": cria espaço do cliente com orçamento próprio. */
export async function salvarEmpresa(fd: FormData): Promise<R> {
  const s = await exigir(["admin"]);
  const db = await getDb();
  const id = String(fd.get("id") ?? "");
  const dados = { nome: String(fd.get("nome") ?? "").trim(), orcamentoMensal: Number(String(fd.get("orcamento") ?? "0").replace(",", ".")) || 0, plano: String(fd.get("plano") || "interno") };
  if (!dados.nome) return { ok: false, mensagem: "Informe o nome" };
  if (id) await db.update(schema.empresas).set(dados).where(eq(schema.empresas.id, id));
  else await db.insert(schema.empresas).values(dados);
  await auditar(s, id ? "cliente_atualizado" : "cliente_criado", dados.nome, dados);
  revalidatePath("/configuracoes");
  return { ok: true, mensagem: "Cliente salvo" };
}

export async function salvarGerais(fd: FormData): Promise<R> {
  const s = await exigir(["admin"]);
  const atual = await lerConfig();
  const pref: Partial<Record<Formato, Partial<Record<Etapa, string>>>> = {};
  for (const f of ["propaganda", "depoimento", "apresentacao", "ugc"] as Formato[]) {
    for (const e of ["voz", "avatar", "cenas"] as Etapa[]) {
      const v = String(fd.get(`pref_${f}_${e}`) ?? "");
      if (v) (pref[f] ??= {})[e] = v;
    }
  }
  await salvarConfig({
    nomeSistema: String(fd.get("nomeSistema") || atual.nomeSistema),
    marcaDagua: fd.get("marcaDagua") === "on",
    textoMarcaDagua: String(fd.get("textoMarcaDagua") || atual.textoMarcaDagua),
    idioma: String(fd.get("idioma") || "pt-BR"),
    formatosExportacao: fd.getAll("formatos").map(String),
    modoPadrao: String(fd.get("modoPadrao") || "equilibrado") as Modo,
    modeloClaude: String(fd.get("modeloClaude") || atual.modeloClaude),
    revisaoAutomatica: fd.get("revisaoAutomatica") === "on",
    modoDemo: fd.get("modoDemo") === "on",
    limpezaPreviasDias: Number(fd.get("limpezaPreviasDias") || 30),
    preferenciasPorFormato: pref,
  });
  await auditar(s, "configuracoes_salvas", undefined, { marcaDagua: fd.get("marcaDagua") === "on", modoDemo: fd.get("modoDemo") === "on" });
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Configurações salvas" };
}
