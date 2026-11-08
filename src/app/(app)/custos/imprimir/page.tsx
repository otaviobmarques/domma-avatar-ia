import { exigir } from "@/lib/auth";
import { relatorio, filtroDe } from "@/lib/relatorio";
import { PROVEDORES } from "@/lib/catalogo";
import { brl, data } from "@/lib/formato";
import { Logo } from "@/components/Logo";
import { Imprimir } from "./Imprimir";

export default async function RelatorioPdf({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await exigir(["admin"]);
  const f = filtroDe(await searchParams);
  const r = await relatorio(f);
  return (
    <div className="bg-white p-6 print:p-0">
      <Imprimir />
      <div className="mb-6 flex items-center justify-between"><Logo /><div className="text-right text-sm"><div className="font-semibold">Relatório de custos</div><div>{data(f.de)} a {data(f.ate)}</div></div></div>
      <p className="mb-4 text-sm">Total: <strong>{brl(r.total)}</strong> · {r.n} vídeos · média {brl(r.medioVideo)}/vídeo · {brl(r.medioMinuto)}/min</p>
      <h2 className="mb-1 font-semibold">Por motor</h2>
      <table className="tabela mb-4"><tbody>{r.porMotor.map((m, i) => <tr key={i}><td>{PROVEDORES.find((p) => p.id === m.provedor)?.nome ?? m.provedor} {m.modelo}</td><td className="text-right">{brl(m.total)}</td></tr>)}</tbody></table>
      <h2 className="mb-1 font-semibold">Por cliente</h2>
      <table className="tabela mb-4"><tbody>{r.porCliente.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right">{brl(v)}</td></tr>)}</tbody></table>
      <h2 className="mb-1 font-semibold">Vídeos</h2>
      <table className="tabela"><thead><tr><th>Data</th><th>Vídeo</th><th>Cliente</th><th>Estimado</th><th>Real</th></tr></thead>
        <tbody>{r.videos.map((v) => <tr key={v.id}><td>{data(v.criadoEm)}</td><td>{v.titulo}</td><td>{v.empresa}</td><td>{brl(v.estimado)}</td><td>{brl(v.real)}</td></tr>)}</tbody></table>
    </div>
  );
}
