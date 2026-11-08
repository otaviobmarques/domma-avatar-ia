import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { lerConfig } from "@/lib/config";
import { PROVEDORES, ETAPAS, UNIDADES, nomeEtapa } from "@/lib/catalogo";
import { precoEfetivo, fatorCambio } from "@/lib/precos";
import { Cabecalho, Cartao, Selo, Aviso } from "@/components/ui";
import { brl, dataHora, usd, data } from "@/lib/formato";
import { salvarPreco, excluirPreco, salvarCambio } from "@/app/acoes/precos";
import { AcoesPrecos, LinhaPreco } from "./Cliente";

export default async function Precos() {
  await exigir(["admin"]);
  const db = await getDb();
  const cfg = await lerConfig();
  const precos = await db.select().from(schema.precos).orderBy(asc(schema.precos.etapa), asc(schema.precos.provedor), asc(schema.precos.modelo));
  const hist = await db.select({ h: schema.precosHistorico, p: schema.precos }).from(schema.precosHistorico)
    .innerJoin(schema.precos, eq(schema.precos.id, schema.precosHistorico.precoId)).orderBy(desc(schema.precosHistorico.criadoEm)).limit(50);
  const fator = fatorCambio({ cotacao: cfg.cotacaoUsd, colchao: cfg.colchao });
  return (
    <>
      <Cabecalho titulo="Tabela de Preços" sub="Mantenha o preço de cada motor atualizado — é daqui que sai toda estimativa. Nada é inventado: sem preço, a linha fica “a confirmar”." acoes={<AcoesPrecos />} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Cartao titulo="Cotação do dólar" className="md:col-span-2">
          <form action={salvarCambio} className="flex flex-wrap items-end gap-3">
            <div><label className="rotulo">US$ 1 =</label><input name="cotacao" className="campo w-32" defaultValue={cfg.cotacaoUsd} inputMode="decimal" /></div>
            <div><label className="rotulo">Colchão IOF/spread (%)</label><input name="colchao" className="campo w-32" defaultValue={Math.round(cfg.colchao * 1000) / 10} inputMode="decimal" /></div>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">Salvar</button>
            <div className="text-sm text-slate-600">= <strong>R$ {fator.toFixed(2)}</strong> por dólar nas contas</div>
          </form>
          <p className="mt-2 text-xs text-slate-500">Fonte: {cfg.cotacaoFonte} · atualizada {dataHora(cfg.cotacaoAtualizadaEm)}</p>
        </Cartao>
        <Cartao titulo="Fórmula">
          <p className="text-sm">Custo = Σ (quantidade × preço unitário) × cotação × colchão.</p>
          <p className="mt-1 text-xs text-slate-500">Planos por créditos: informe o valor pago e as unidades incluídas — o sistema calcula o custo efetivo por unidade.</p>
        </Cartao>
      </div>

      <Cartao titulo="Preços por motor/modelo">
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Etapa</th><th>Motor / modelo</th><th>Unidade</th><th>Preço</th><th>Efetivo (R$)</th><th>Mult. crédito</th><th>Fonte · conferido</th><th></th></tr></thead>
            <tbody>
              {precos.map((p) => {
                const ef = precoEfetivo(p);
                const emBrl = ef == null ? null : p.moeda === "USD" ? ef * fator : ef;
                return (
                  <LinhaPreco key={p.id} id={p.id} excluir={excluirPreco.bind(null, p.id)} editar={
                    <form action={salvarPreco} className="grid gap-2 p-3 sm:grid-cols-4">
                      <input type="hidden" name="id" value={p.id} />
                      <CamposPreco p={p} />
                      <div className="flex items-end"><button className="rounded-lg bg-marca-600 px-3 py-2 text-sm text-white">Salvar</button></div>
                    </form>
                  }>
                    <td>{nomeEtapa(p.etapa)}</td>
                    <td><div className="font-medium">{PROVEDORES.find((x) => x.id === p.provedor)?.nome ?? p.provedor}</div><div className="font-mono text-xs text-slate-500">{p.modelo}</div></td>
                    <td className="text-xs">{UNIDADES[p.unidade] ?? p.unidade}</td>
                    <td className="whitespace-nowrap tabular-nums">{p.preco == null ? <Selo cor="amber">a confirmar</Selo> : p.moeda === "USD" ? usd(p.preco, 4) : brl(p.preco, 4)}
                      {p.planoValor != null && <div className="text-[11px] text-slate-500">plano {p.moeda === "USD" ? usd(p.planoValor, 2) : brl(p.planoValor)} / {p.planoUnidades} un.</div>}</td>
                    <td className="tabular-nums">{emBrl == null ? "—" : brl(emBrl, 4)}</td>
                    <td className="tabular-nums">{p.multiplicadorCredito}×</td>
                    <td className="text-xs text-slate-500">{p.confirmado ? <Selo cor="green">confirmado</Selo> : <Selo>a validar</Selo>}<div className="mt-0.5 max-w-56">{p.fonte}</div><div>{data(p.conferidoEm)}</div></td>
                  </LinhaPreco>
                );
              })}
            </tbody>
          </table>
        </div>
      </Cartao>

      <Cartao titulo="+ Adicionar preço" className="mt-6">
        <form action={salvarPreco} className="grid gap-3 sm:grid-cols-4">
          <CamposPreco />
          <div className="flex items-end"><button className="rounded-lg bg-marca-600 px-3 py-2 text-sm text-white">Cadastrar modelo</button></div>
        </form>
      </Cartao>

      <Cartao titulo="Histórico de preços" className="mt-6">
        {hist.length === 0 ? <p className="text-sm text-slate-500">Nenhuma alteração registrada ainda.</p> : (
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Modelo</th><th>De</th><th>Para</th></tr></thead>
            <tbody>{hist.map(({ h, p }) => (
              <tr key={h.id}><td>{dataHora(h.criadoEm)}</td><td>{p.provedor}/{p.modelo}</td><td>{h.precoAnterior ?? "—"}</td><td>{h.precoNovo ?? "—"} {h.moeda}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Cartao>
      <div className="mt-4"><Aviso>Seedance 2.5 varia de US$ 0,23 a 0,60/s conforme o intermediário — confirme o valor do seu provedor e marque “confirmado”.</Aviso></div>
    </>
  );
}

function CamposPreco({ p }: { p?: typeof schema.precos.$inferSelect }) {
  return (
    <>
      <div><label className="rotulo">Provedor</label>
        <select name="provedor" className="campo" defaultValue={p?.provedor}>{PROVEDORES.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
      <div><label className="rotulo">Modelo</label><input name="modelo" required className="campo font-mono" defaultValue={p?.modelo} placeholder="ex.: kling-avatar-pro" /></div>
      <div><label className="rotulo">Etapa</label>
        <select name="etapa" className="campo" defaultValue={p?.etapa}>{ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
      <div><label className="rotulo">Unidade</label>
        <select name="unidade" className="campo" defaultValue={p?.unidade}>{Object.entries(UNIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="rotulo">Preço por unidade</label><input name="preco" className="campo" inputMode="decimal" defaultValue={p?.preco ?? ""} placeholder="vazio = a confirmar" /></div>
      <div><label className="rotulo">Moeda</label><select name="moeda" className="campo" defaultValue={p?.moeda ?? "USD"}><option>USD</option><option>BRL</option></select></div>
      <div><label className="rotulo">Plano: valor pago</label><input name="planoValor" className="campo" inputMode="decimal" defaultValue={p?.planoValor ?? ""} /></div>
      <div><label className="rotulo">Plano: unidades incluídas</label><input name="planoUnidades" className="campo" inputMode="decimal" defaultValue={p?.planoUnidades ?? ""} /></div>
      <div><label className="rotulo">Multiplicador de crédito</label><input name="multiplicadorCredito" className="campo" inputMode="decimal" defaultValue={p?.multiplicadorCredito ?? 1} /></div>
      <div><label className="rotulo">Qualidade (1–3)</label><input name="qualidade" className="campo" inputMode="numeric" defaultValue={p?.qualidade ?? 2} /></div>
      <div className="sm:col-span-2"><label className="rotulo">Fonte</label><input name="fonte" className="campo" defaultValue={p?.fonte ?? ""} placeholder="ex.: página de preços do provedor, fatura" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmado" defaultChecked={p?.confirmado} />Preço confirmado</label>
    </>
  );
}
