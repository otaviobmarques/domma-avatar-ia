"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { enviarArquivo } from "@/components/enviarArquivo";

/** Envia o arquivo direto ao Storage e só depois chama a ação (corpo pequeno — compatível com a Vercel). */
export function FormBiblioteca({ acao, children }: { acao: (fd: FormData) => Promise<void>; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  return (
    <form ref={ref} className="grid gap-3 sm:grid-cols-6" action={(fd) => ini(async () => {
      try {
        setErro(null);
        const f = fd.get("arquivo") as File | null;
        const envio = new FormData();
        for (const [k, v] of fd.entries()) if (k !== "arquivo") envio.append(k, v);
        if (f && f.size) {
          envio.append("caminho", await enviarArquivo(f, `biblioteca/${String(fd.get("tipo"))}`));
          envio.append("nomeArquivo", f.name);
        }
        await acao(envio);
        ref.current?.reset();
      } catch (e) { setErro((e as Error).message); }
    })}>
      {children}
      {pend && <p className="text-xs text-slate-500 sm:col-span-6">Enviando…</p>}
      {erro && <p className="text-xs text-red-600 sm:col-span-6">{erro}</p>}
    </form>
  );
}
