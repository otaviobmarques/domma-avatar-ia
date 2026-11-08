"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Home, Plus, FolderKanban, UserRound, Library, CheckCircle2, BarChart3, Plug, Tags, Settings, LogOut, Menu as MenuIcon, X, FlaskConical } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";
import { BotaoBaixarApp } from "./BotaoBaixarApp";

const GRUPOS = [
  { titulo: "Criar", itens: [
    { href: "/", nome: "Início", icone: Home },
    { href: "/videos/novo", nome: "Novo vídeo", icone: Plus, destaque: true },
    { href: "/avatares", nome: "Avatares", icone: UserRound },
    { href: "/biblioteca", nome: "Biblioteca", icone: Library },
  ] },
  { titulo: "Acompanhar", itens: [
    { href: "/projetos", nome: "Projetos", icone: FolderKanban },
    { href: "/aprovacoes", nome: "Aprovações", icone: CheckCircle2 },
    { href: "/custos", nome: "Custos", icone: BarChart3, admin: true },
  ] },
  { titulo: "Administração", admin: true, itens: [
    { href: "/integracoes", nome: "Integrações", icone: Plug, admin: true },
    { href: "/precos", nome: "Preços", icone: Tags, admin: true },
    { href: "/configuracoes", nome: "Configurações", icone: Settings, admin: true },
  ] },
];

const PAPEIS: Record<string, string> = { admin: "Administrador", editor: "Editor", cliente: "Cliente" };

export function Menu({ nome, papel, sistema, demo, sair }: { nome: string; papel: string; sistema: string; demo: boolean; sair: () => Promise<void> }) {
  const p = usePathname();
  const [aberto, setAberto] = useState(false);
  const ativo = (href: string) => href === "/" ? p === "/" : href === "/projetos" ? p.startsWith("/projetos") || (p.startsWith("/videos/") && p !== "/videos/novo") : p.startsWith(href);
  const iniciais = nome.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return (
    <>
      <button className="fixed left-3 top-3 z-40 rounded-xl bg-tinta p-2.5 text-white shadow-suave md:hidden print:hidden" onClick={() => setAberto(!aberto)} aria-label="Menu">
        {aberto ? <X size={18} /> : <MenuIcon size={18} />}
      </button>
      {aberto && <div className="fixed inset-0 z-20 bg-tinta/40 backdrop-blur-sm md:hidden" onClick={() => setAberto(false)} />}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-30 flex w-64 flex-col overflow-hidden bg-tinta text-slate-300 transition-transform md:translate-x-0 print:hidden",
        aberto ? "translate-x-0" : "-translate-x-full",
      )}>
        {/* brilho de fundo */}
        <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-marca-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-marca-700/30 blur-3xl" />

        <div className="relative px-5 pb-5 pt-6">
          <Logo claro produto={sistema.replace(/^Domma\s*/i, "") || "AvatarIA"} />
          {demo && (
            <Link href="/configuracoes" className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-300/15">
              <FlaskConical size={14} />Modo demonstração ativo
            </Link>
          )}
        </div>

        <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {GRUPOS.filter((g) => !g.admin || papel === "admin").map((g) => (
            <div key={g.titulo}>
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{g.titulo}</div>
              <div className="space-y-0.5">
                {g.itens.filter((i) => !("admin" in i && i.admin) || papel === "admin").map((i) => {
                  const on = ativo(i.href);
                  return (
                    <Link key={i.href} href={i.href} onClick={() => setAberto(false)}
                      className={clsx(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                        on ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-slate-300/90 hover:bg-white/[0.05] hover:text-white",
                      )}>
                      {on && <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-marca-400" />}
                      <span className={clsx("flex h-7 w-7 items-center justify-center rounded-lg transition",
                        "destaque" in i && i.destaque ? "bg-gradient-to-br from-marca-400 to-marca-600 text-white shadow-marca" : on ? "bg-marca-500/25 text-marca-200" : "text-slate-400 group-hover:text-white")}>
                        <i.icone size={16} />
                      </span>
                      {i.nome}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative"><BotaoBaixarApp variante="menu" /></div>
        <div className="relative m-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-marca-400 to-marca-700 text-xs font-bold text-white">{iniciais || "?"}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{nome}</div>
              <div className="text-[11px] text-slate-400">{PAPEIS[papel] ?? papel}</div>
            </div>
            <form action={sair}>
              <button title="Sair" className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"><LogOut size={16} /></button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
