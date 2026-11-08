"use client";
import { useState, useTransition, type ReactNode } from "react";
import { RefreshCw, Calculator, Pencil, Trash2 } from "lucide-react";
import { Botao } from "@/components/ui";
import { atualizarCotacao, recalcularEstimativas } from "@/app/acoes/precos";

export function AcoesPrecos() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Botao variante="secundario" disabled={pend} onClick={() => ini(async () => setMsg((await atualizarCotacao()).mensagem))}><RefreshCw size={14} />Atualizar cotação</Botao>
        <Botao variante="secundario" disabled={pend} onClick={() => ini(async () => setMsg((await recalcularEstimativas()).mensagem))}><Calculator size={14} />Recalcular estimativas</Botao>
      </div>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </div>
  );
}

export function LinhaPreco({ children, editar, excluir }: { id: string; children: ReactNode; editar: ReactNode; excluir: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [pend, ini] = useTransition();
  return (
    <>
      <tr>
        {children}
        <td className="whitespace-nowrap">
          <button className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar" onClick={() => setAberto(!aberto)}><Pencil size={14} /></button>
          <button className="rounded p-1 text-red-500 hover:bg-red-50" title="Excluir" disabled={pend} onClick={() => confirm("Excluir este preço?") && ini(() => excluir())}><Trash2 size={14} /></button>
        </td>
      </tr>
      {aberto && <tr><td colSpan={8} className="bg-slate-50 p-0">{editar}</td></tr>}
    </>
  );
}
