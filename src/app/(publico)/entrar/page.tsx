"use client";
import { useActionState } from "react";
import { acaoEntrar } from "@/app/acoes/sessao";
import { Botao } from "@/components/ui";
import { Logo } from "@/components/Logo";

export default function Entrar() {
  const [estado, acao, pendente] = useActionState(acaoEntrar, null);
  return (
    <div className="flex min-h-screen items-center justify-center bg-tinta p-4">
      <form action={acao} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6">
          <Logo />
          <h1 className="mt-6 text-2xl font-bold">Entrar</h1>
          <p className="text-sm text-slate-500">Gêmeo digital com IA</p>
        </div>
        <label className="rotulo" htmlFor="email">E-mail ou usuário</label>
        <input id="email" name="email" type="text" required className="campo mb-3" autoComplete="username" />
        <label className="rotulo" htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" required className="campo mb-4" autoComplete="current-password" />
        {estado?.erro && <p className="mb-3 text-sm text-red-600">{estado.erro}</p>}
        <Botao className="w-full" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</Botao>
      </form>
    </div>
  );
}
