"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Home, Plus, FolderKanban, UserRound, Library, CheckCircle2, BarChart3, Plug, Tags, Settings, LogOut, Menu as MenuIcon } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";

const ITENS = [
  { href: "/", nome: "Início", icone: Home },
  { href: "/videos/novo", nome: "Novo vídeo", icone: Plus },
  { href: "/projetos", nome: "Projetos", icone: FolderKanban },
  { href: "/avatares", nome: "Avatares", icone: UserRound },
  { href: "/biblioteca", nome: "Biblioteca", icone: Library },
  { href: "/aprovacoes", nome: "Aprovações", icone: CheckCircle2 },
  { href: "/custos", nome: "Custos", icone: BarChart3, admin: true },
  { href: "/integracoes", nome: "Integrações", icone: Plug, admin: true },
  { href: "/precos", nome: "Preços", icone: Tags, admin: true },
  { href: "/configuracoes", nome: "Configurações", icone: Settings, admin: true },
];

export function Menu({ nome, papel, sistema, demo, sair }: { nome: string; papel: string; sistema: string; demo: boolean; sair: () => Promise<void> }) {
  const p = usePathname();
  const [aberto, setAberto] = useState(false);
  const itens = ITENS.filter((i) => !i.admin || papel === "admin");
  return (
    <>
      <button className="fixed left-3 top-3 z-40 rounded-lg bg-tinta p-2 text-white md:hidden print:hidden" onClick={() => setAberto(!aberto)} aria-label="Menu"><MenuIcon size={18} /></button>
      <aside className={clsx("fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-tinta text-slate-300 transition-transform md:translate-x-0 print:hidden", aberto ? "translate-x-0" : "-translate-x-full")}>
        <div className="px-5 pb-4 pt-6">
          <Logo claro produto={sistema.replace(/^Domma\s*/i, "") || "AvatarIA"} />
          {demo && <div className="mt-2 inline-block rounded bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">MODO DEMONSTRAÇÃO</div>}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {itens.map((i) => {
            const ativo = i.href === "/" ? p === "/" : p.startsWith(i.href) || (i.href === "/projetos" && p.startsWith("/videos/") && p !== "/videos/novo");
            return (
              <Link key={i.href} href={i.href} onClick={() => setAberto(false)}
                className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", ativo ? "bg-white/10 font-semibold text-white" : "hover:bg-white/5 hover:text-white")}>
                <i.icone size={17} className={ativo ? "text-marca-500" : ""} />{i.nome}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs">
          <div className="font-medium text-white">{nome}</div>
          <div className="text-slate-400">{papel === "admin" ? "Administrador" : papel === "editor" ? "Editor" : "Cliente"}</div>
          <form action={sair}><button className="mt-2 flex items-center gap-1.5 text-slate-400 hover:text-white"><LogOut size={14} />Sair</button></form>
        </div>
      </aside>
    </>
  );
}
