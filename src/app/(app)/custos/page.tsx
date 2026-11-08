import Link from "next/link";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { relatorio, filtroDe } from "@/lib/relatorio";
import { PROVEDORES } from "@/lib/catalogo";
import { Cabecalho, Kpi, Cartao, Botao, BotaoLink } from "@/components/ui";
import { brl, data, FORMATOS, MODOS } from "@/lib/formato";
import { Download, Printer, Wallet } from "lucide-react";

function Barras({ dados }: { dados: [string, number][] }) {
  const max = Math.max(1, ...dados.map((d) => d[1]));
  if (!dados.length) return <p className="text-sm text-slate-500">Sem dados no período.</p>;
  return (
    <ul className="space-y-2">{dados.map(([k, v]) => (
      <li key={k} className="text-sm">
        <div className="flex justify-between"><span>{k}</span><span className="tabular-nums font-medium">{brl(v)}</span></div>
        <div className="mt-0.5 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-marca-500" style={{ width: `${(v / max) * 100}%` }} /></div>
      </li>
    ))}</ul>
  );
}

export default async function Custos({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await exigir(["admin"]);
  const sp = await searchParams;
  const f = filtroDe(sp);
  const r = await relatorio(f);
  const db = await getDb();
  const empresas = await db.select().from(schema.empresas);
  const qs = new URLSearchParams(sp).toString();
  const calibr = r.videos.filter((v) => v.estimado && v.real);
  const desvio = calibr.length ? calibr.reduce((s, v) => s + (v.real - v.estimado!) / v.estimado!, 0) / calibr.length : null;
  return (
    <>
      <Cabecalho titulo="Custos e Relatórios" sub="Saber para onde vai o dinheiro." acoes={<>
        <a href={`/api/custos/csv?${qs}`}><Botao variante="secundario"><Download size={14} />Exportar CSV</Botao></a>
        <BotaoLink href={`/custos/imprimir?${qs}`} variante="secundario"><Printer size={14} />Exportar PDF</BotaoLink>
        <BotaoLink href="/configuracoes#clientes" variante="secundario"><Wallet size={14} />Definir orçamento</BotaoLink>
      </>} />
      <form className="cartao mb-6 flex flex-wrap items-end gap-3 p-4">
        <div><label className="rotulo">De</label><input type="date" name="de" className="campo" defaultValue={f.de.toISOString().slice(0, 10)} /></div>
        <div><label className="rotulo">Até</label><input type="date" name="ate" className="campo" defaultValue={f.ate.toISOString().slice(0, 10)} /></div>
        <div><label className="rotulo">Cliente</label><select name="empresa" className="campo" defaultValue={sp.empresa ?? ""}><option value="">Todos</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
        <div><label className="rotulo">Motor</label><select name="motor" className="campo" defaultValue={sp.motor ?? ""}><option value="">Todos</option>{PROVEDORES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
        <Botao>Filtrar</Botao>
      </form>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Kpi rotulo="Gasto no período" valor={brl(r.total)} />
        <Kpi rotulo="Vídeos" valor={r.n} />
        <Kpi rotulo="Custo médio por vídeo" valor={brl(r.medioVideo)} />
        <Kpi rotulo="Custo médio por minuto" valor={brl(r.medioMinuto)} detalhe={desvio != null ? `Real vs estimado: ${desvio >= 0 ? "+" : ""}${(desvio * 100).toFixed(0)}%` : undefined} />
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Por mês"><Barras dados={r.porMes} /></Cartao>
        <Cartao titulo="Por motor"><Barras dados={r.porMotor.map((m) => [`${PROVEDORES.find((p) => p.id === m.provedor)?.nome ?? m.provedor}${m.modelo ? ` · ${m.modelo}` : ""}`, m.total])} /></Cartao>
        <Cartao titulo="Por cliente"><Barras dados={r.porCliente} /></Cartao>
        <Cartao titulo="Por formato"><Barras dados={r.porFormato.map(([k, v]) => [FORMATOS[k] ?? k, v])} /></Cartao>
      </div>
      <Cartao titulo="Estimado × real por vídeo (para calibrar as estimativas)">
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Vídeo</th><th>Cliente</th><th>Modo</th><th>Estimado</th><th>Real</th><th>Diferença</th></tr></thead>
            <tbody>{r.videos.map((v) => {
              const d = v.estimado ? v.real - v.estimado : null;
              return (
                <tr key={v.id}>
                  <td>{data(v.criadoEm)}</td><td><Link href={`/videos/${v.id}`} className="text-marca-600 hover:underline">{v.titulo}</Link></td><td>{v.empresa}</td><td>{MODOS[v.modo]}</td>
                  <td className="tabular-nums">{brl(v.estimado)}</td><td className="tabular-nums">{brl(v.real)}</td>
                  <td className={`tabular-nums ${d != null && d > 0 ? "text-red-600" : "text-emerald-700"}`}>{d == null ? "—" : `${d >= 0 ? "+" : ""}${brl(d)}`}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Cartao>
    </>
  );
}
