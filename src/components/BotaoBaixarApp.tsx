"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

declare global { interface Window { dommaDesktop?: { plataforma: string } } }

/** Mostra o convite para baixar o app de Windows — some quando já está rodando dentro do aplicativo. */
export function BotaoBaixarApp({ variante }: { variante: "menu" | "login" }) {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => { setMostrar(!window.dommaDesktop && !/Android|iPhone|iPad|Macintosh/i.test(navigator.userAgent)); }, []);
  if (!mostrar) return null;
  if (variante === "login") {
    return (
      <Link href="/baixar" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-tinta transition hover:border-marca-200 hover:bg-marca-50/50">
        <Download size={15} className="text-marca-600" />Baixar o app para Windows
      </Link>
    );
  }
  return (
    <Link href="/baixar" className="group mx-3 mb-1 flex items-center gap-3 rounded-2xl border border-marca-400/25 bg-gradient-to-r from-marca-500/20 to-marca-700/10 px-3 py-2.5 transition hover:from-marca-500/30">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-marca-200"><Download size={16} /></span>
      <span className="leading-tight"><span className="block text-sm font-semibold text-white">Baixar para Windows</span><span className="text-[11px] text-slate-400">App para o computador</span></span>
    </Link>
  );
}
