"use client";
import { useState, useTransition, type ReactNode } from "react";
import { Botao } from "@/components/ui";

export function FormAcao({ acao, rotulo, inline, children }: { acao: (fd: FormData) => Promise<{ ok: boolean; mensagem: string }>; rotulo: string; inline?: boolean; children: ReactNode }) {
  const [msg, setMsg] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [pend, ini] = useTransition();
  return (
    <form action={(fd) => ini(async () => setMsg(await acao(fd)))} className={inline ? "flex flex-wrap items-center gap-2" : ""}>
      {children}
      <div className={inline ? "flex items-center gap-2" : "mt-4 flex items-center gap-3"}>
        <Botao variante={inline ? "secundario" : "primario"} disabled={pend}>{pend ? "…" : rotulo}</Botao>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.mensagem}</span>}
      </div>
    </form>
  );
}
