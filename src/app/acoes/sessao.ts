"use server";
import { redirect } from "next/navigation";
import { entrar, sair } from "@/lib/auth";
import { auditar } from "@/lib/auditoria";

export async function acaoEntrar(_: unknown, fd: FormData) {
  const s = await entrar(String(fd.get("email") ?? ""), String(fd.get("senha") ?? ""));
  if (!s) return { erro: "E-mail ou senha inválidos" };
  await auditar(s, "login");
  redirect("/");
}

export async function acaoSair() {
  await sair();
  redirect("/entrar");
}
