import Link from "next/link";
import clsx from "clsx";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export function Cabecalho({ titulo, sub, acoes, icone: Icone }: { titulo: string; sub?: ReactNode; acoes?: ReactNode; icone?: LucideIcon }) {
  return (
    <div className="surgir mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {Icone && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-marca-500 to-marca-700 text-white shadow-marca">
            <Icone size={21} />
          </div>
        )}
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-tinta">{titulo}</h1>
          {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

type Var = "primario" | "secundario" | "perigo" | "fantasma";
const estilos: Record<Var, string> = {
  primario: "bg-gradient-to-b from-marca-500 to-marca-600 text-white shadow-marca hover:from-marca-600 hover:to-marca-700 active:translate-y-px",
  secundario: "bg-white text-tinta border border-slate-200 shadow-[0_1px_2px_rgb(30_18_56/0.05)] hover:border-marca-200 hover:bg-marca-50/50",
  perigo: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  fantasma: "text-slate-600 hover:bg-marca-50 hover:text-marca-700",
};
const baseBotao = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-marca-100 disabled:cursor-not-allowed disabled:opacity-50";

export function Botao({ variante = "primario", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Var }) {
  return <button {...p} className={clsx(baseBotao, estilos[variante], className)} />;
}

export function BotaoLink({ href, variante = "primario", className, children }: { href: string; variante?: Var; className?: string; children: ReactNode }) {
  return <Link href={href} className={clsx(baseBotao, estilos[variante], className)}>{children}</Link>;
}

const cores: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200", blue: "bg-sky-50 text-sky-700 ring-sky-200", violet: "bg-marca-50 text-marca-700 ring-marca-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200", green: "bg-emerald-50 text-emerald-700 ring-emerald-200", red: "bg-red-50 text-red-700 ring-red-200", gray: "bg-slate-50 text-slate-500 ring-slate-200",
};
export function Selo({ cor = "slate", children, className }: { cor?: string; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", cores[cor] ?? cores.slate, className)}>{children}</span>;
}

export function Cartao({ titulo, acoes, children, className, icone: Icone }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; icone?: LucideIcon }) {
  return (
    <section className={clsx("cartao surgir", className)}>
      {(titulo || acoes) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-tinta">
            {Icone && <Icone size={17} className="text-marca-500" />}{titulo}
          </h2>
          {acoes}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const tons: Record<string, { fundo: string; icone: string; barra: string }> = {
  marca: { fundo: "from-marca-50", icone: "bg-marca-100 text-marca-600", barra: "from-marca-400 to-marca-600" },
  verde: { fundo: "from-emerald-50", icone: "bg-emerald-100 text-emerald-600", barra: "from-emerald-400 to-emerald-600" },
  azul: { fundo: "from-sky-50", icone: "bg-sky-100 text-sky-600", barra: "from-sky-400 to-sky-600" },
  ambar: { fundo: "from-amber-50", icone: "bg-amber-100 text-amber-600", barra: "from-amber-400 to-amber-600" },
};

export function Kpi({ rotulo, valor, detalhe, barra, icone: Icone, tom = "marca" }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; barra?: number; icone?: LucideIcon; tom?: keyof typeof tons }) {
  const t = tons[tom];
  const alerta = barra != null && barra >= 80;
  return (
    <div className={clsx("cartao surgir relative overflow-hidden bg-gradient-to-br to-white to-60% p-5", t.fundo)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</div>
        {Icone && <div className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.icone)}><Icone size={18} /></div>}
      </div>
      <div className="mt-1 font-titulo text-[28px] font-extrabold leading-none tracking-tight text-tinta tabular-nums">{valor}</div>
      {barra != null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={clsx("h-full rounded-full bg-gradient-to-r transition-all", barra >= 100 ? "from-red-400 to-red-600" : alerta ? "from-amber-400 to-amber-600" : t.barra)} style={{ width: `${Math.max(2, Math.min(100, barra))}%` }} />
        </div>
      )}
      {detalhe && <div className={clsx("mt-2 text-xs", alerta ? "font-medium text-amber-700" : "text-slate-500")}>{detalhe}</div>}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "aviso" | "erro" | "ok"; children: ReactNode }) {
  const c = {
    info: "border-sky-200 bg-sky-50/80 text-sky-900", aviso: "border-amber-200 bg-amber-50/80 text-amber-900",
    erro: "border-red-200 bg-red-50/80 text-red-900", ok: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
  }[tipo];
  return <div className={clsx("rounded-xl border px-4 py-2.5 text-sm", c)}>{children}</div>;
}

export function Vazio({ children, icone: Icone, titulo, acao }: { children?: ReactNode; icone?: LucideIcon; titulo?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-marca-200 bg-gradient-to-b from-marca-50/60 to-white px-6 py-10 text-center">
      {Icone && <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-marca-500 shadow-suave ring-1 ring-marca-100"><Icone size={26} /></div>}
      {titulo && <div className="font-titulo text-base font-bold text-tinta">{titulo}</div>}
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function Passos({ passos, atual }: { passos: { nome: string; href?: string }[]; atual: number }) {
  return (
    <ol className="surgir mb-7 flex flex-wrap items-center gap-1.5">
      {passos.map((p, i) => {
        const feito = i < atual;
        const cls = clsx("flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-xs font-semibold transition",
          i === atual ? "bg-tinta text-white shadow-suave" : feito ? "bg-white text-marca-700 ring-1 ring-marca-200 hover:bg-marca-50" : "bg-white/70 text-slate-400 ring-1 ring-slate-200");
        const bolinha = clsx("flex h-5 w-5 items-center justify-center rounded-full text-[10px] tabular-nums",
          i === atual ? "bg-marca-500 text-white" : feito ? "bg-marca-500 text-white" : "bg-slate-100 text-slate-500");
        const conteudo = <><span className={bolinha}>{feito ? "✓" : i + 1}</span>{p.nome}</>;
        return (
          <li key={p.nome} className="flex items-center gap-1.5">
            {i > 0 && <span className={clsx("h-px w-4", feito || i === atual ? "bg-marca-300" : "bg-slate-200")} />}
            {p.href && i !== atual ? <Link href={p.href} className={cls}>{conteudo}</Link> : <span className={cls}>{conteudo}</span>}
          </li>
        );
      })}
    </ol>
  );
}
