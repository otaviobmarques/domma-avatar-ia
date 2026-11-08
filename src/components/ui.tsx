import Link from "next/link";
import clsx from "clsx";
import type { ReactNode, ButtonHTMLAttributes } from "react";

export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-tinta">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

type Var = "primario" | "secundario" | "perigo" | "fantasma";
const estilos: Record<Var, string> = {
  primario: "bg-marca-600 text-white hover:bg-marca-700 shadow-sm",
  secundario: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50",
  perigo: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  fantasma: "text-slate-600 hover:bg-slate-100",
};
const baseBotao = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export function Botao({ variante = "primario", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Var }) {
  return <button {...p} className={clsx(baseBotao, estilos[variante], className)} />;
}

export function BotaoLink({ href, variante = "primario", className, children }: { href: string; variante?: Var; className?: string; children: ReactNode }) {
  return <Link href={href} className={clsx(baseBotao, estilos[variante], className)}>{children}</Link>;
}

const cores: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700", blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  amber: "bg-amber-100 text-amber-800", green: "bg-emerald-100 text-emerald-800", red: "bg-red-100 text-red-800", gray: "bg-slate-100 text-slate-500",
};
export function Selo({ cor = "slate", children, className }: { cor?: string; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cores[cor] ?? cores.slate, className)}>{children}</span>;
}

export function Cartao({ titulo, acoes, children, className }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("cartao", className)}>
      {(titulo || acoes) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
          {acoes}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ rotulo, valor, detalhe, barra }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; barra?: number }) {
  return (
    <div className="cartao p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-1 text-2xl font-bold text-tinta tabular-nums">{valor}</div>
      {barra != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={clsx("h-full rounded-full", barra >= 100 ? "bg-red-500" : barra >= 80 ? "bg-amber-500" : "bg-marca-500")} style={{ width: `${Math.min(100, barra)}%` }} />
        </div>
      )}
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "aviso" | "erro" | "ok"; children: ReactNode }) {
  const c = { info: "border-blue-200 bg-blue-50 text-blue-900", aviso: "border-amber-200 bg-amber-50 text-amber-900", erro: "border-red-200 bg-red-50 text-red-900", ok: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tipo];
  return <div className={clsx("rounded-lg border px-3 py-2 text-sm", c)}>{children}</div>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Passos({ passos, atual }: { passos: { nome: string; href?: string }[]; atual: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-2">
      {passos.map((p, i) => {
        const cls = clsx("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
          i === atual ? "border-marca-500 bg-marca-50 text-marca-700" : i < atual ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500");
        const conteudo = <><span className="tabular-nums">{i + 1}</span>{p.nome}</>;
        return <li key={p.nome}>{p.href && i !== atual ? <Link href={p.href} className={cls}>{conteudo}</Link> : <span className={cls}>{conteudo}</span>}</li>;
      })}
    </ol>
  );
}
