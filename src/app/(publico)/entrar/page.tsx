"use client";
import { useActionState } from "react";
import { ShieldCheck, Gauge, Sparkles } from "lucide-react";
import { acaoEntrar } from "@/app/acoes/sessao";
import { Botao } from "@/components/ui";
import { Logo, Simbolo } from "@/components/Logo";

const DESTAQUES = [
  { icone: Sparkles, titulo: "Gêmeo digital", texto: "Voz clonada, boca e olhos sincronizados, em qualquer cenário." },
  { icone: Gauge, titulo: "Custo antes de gerar", texto: "Escolha o motor e veja quanto o vídeo vai custar." },
  { icone: ShieldCheck, titulo: "Com consentimento", texto: "Só clona a própria pessoa, com verificação ao vivo." },
];

export default function Entrar() {
  const [estado, acao, pendente] = useActionState(acaoEntrar, null);
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-tinta p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-marca-500/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-marca-700/40 blur-3xl" />
        <Simbolo tamanho={520} ponto="#ffffff" className="pointer-events-none absolute -right-28 bottom-16 opacity-[0.07]" />
        <div className="relative"><Logo claro /></div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Vídeos com o seu gêmeo digital, <span className="text-marca-300">sem estúdio.</span></h1>
          <ul className="mt-8 space-y-5">
            {DESTAQUES.map((d) => (
              <li key={d.titulo} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-marca-200"><d.icone size={19} /></div>
                <div><div className="font-semibold">{d.titulo}</div><div className="text-sm text-slate-300">{d.texto}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-slate-400">© {new Date().getFullYear()} Domma Tecnologia</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form action={acao} className="surgir w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-[28px] font-extrabold tracking-tight text-tinta">Bem-vindo de volta</h2>
          <p className="mb-8 mt-1 text-sm text-slate-500">Entre para acessar o Domma AvatarIA.</p>
          <label className="rotulo" htmlFor="email">E-mail ou usuário</label>
          <input id="email" name="email" type="text" required className="campo mb-4" autoComplete="username" autoFocus />
          <label className="rotulo" htmlFor="senha">Senha</label>
          <input id="senha" name="senha" type="password" required className="campo mb-5" autoComplete="current-password" />
          {estado?.erro && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>}
          <Botao className="w-full py-3" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</Botao>
          <p className="mt-6 text-center text-xs text-slate-400">Acesso restrito · Domma Tecnologia</p>
        </form>
      </div>
    </div>
  );
}
