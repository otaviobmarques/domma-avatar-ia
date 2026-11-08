import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { carregarContexto } from "@/lib/orquestrador";
import { Cabecalho, Kpi, Cartao, Selo, BotaoLink, Aviso, Vazio } from "@/components/ui";
import { brl, dataHora, STATUS_VIDEO, FORMATOS } from "@/lib/formato";
import { provedor } from "@/lib/catalogo";
import { Plus, UserPlus, BarChart3 } from "lucide-react";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ negado?: string }> }) {
  const s = await exigir();
  const db = await getDb();
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const filtroEmp = s.papel === "cliente" && s.empresaId ? eq(schema.videos.empresaId, s.empresaId) : undefined;
  const base = and(eq(schema.videos.isModelo, false), filtroEmp);
  const [m] = await db.select({
    n: sql<number>`count(*) filter (where ${schema.videos.status} <> 'rascunho')::int`,
    gasto: sql<number>`coalesce(sum(${schema.videos.custoReal}),0)::float`,
  }).from(schema.videos).where(and(base, gte(schema.videos.criadoEm, inicioMes)));
  const [pend] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.videos).where(and(base, eq(schema.videos.status, "em_aprovacao")));
  const [orc] = await db.select({ t: sql<number>`coalesce(sum(${schema.empresas.orcamentoMensal}),0)::float` }).from(schema.empresas).where(s.papel === "cliente" && s.empresaId ? eq(schema.empresas.id, s.empresaId) : undefined);
  const ultimos = await db.select().from(schema.videos).where(base).orderBy(desc(schema.videos.atualizadoEm)).limit(10);
  const ctx = await carregarContexto();
  const alertas: { texto: string; href: string }[] = [];
  if (s.papel === "admin") {
    for (const i of ctx.integracoes.values()) {
      const nome = provedor(i.provedor)?.nome ?? i.provedor;
      if (i.status === "erro") alertas.push({ texto: `Integração com erro: ${nome}`, href: "/integracoes" });
      if (i.status === "sem_saldo") alertas.push({ texto: `Saldo baixo/zerado: ${nome}`, href: "/integracoes" });
      const g = ctx.gastoMesPorProvedor.get(i.provedor) ?? 0;
      if (i.limiteMensal && g >= i.limiteMensal * 0.8) alertas.push({ texto: `${nome}: ${Math.round((g / i.limiteMensal) * 100)}% do limite mensal`, href: "/integracoes" });
    }
    const emps = await db.select().from(schema.empresas);
    for (const e of emps) {
      if (!e.orcamentoMensal) continue;
      const [g] = await db.select({ t: sql<number>`coalesce(sum(${schema.videos.custoReal}),0)::float` }).from(schema.videos).where(and(eq(schema.videos.empresaId, e.id), gte(schema.videos.atualizadoEm, inicioMes)));
      if (g.t >= e.orcamentoMensal * 0.8) alertas.push({ texto: `Orçamento de ${e.nome} em ${Math.round((g.t / e.orcamentoMensal) * 100)}%`, href: "/configuracoes" });
    }
    const erros = await db.select({ n: sql<number>`count(*)::int` }).from(schema.videos).where(inArray(schema.videos.status, ["erro"]));
    if (erros[0].n) alertas.push({ texto: `${erros[0].n} vídeo(s) com erro na geração`, href: "/projetos?status=erro" });
  }
  const pctOrc = orc.t ? (m.gasto / orc.t) * 100 : undefined;
  return (
    <>
      <Cabecalho titulo={`Olá, ${s.nome.split(" ")[0]}`} sub="Visão rápida do mês e atalhos." acoes={s.papel !== "cliente" && <>
        <BotaoLink href="/videos/novo"><Plus size={15} />Novo vídeo</BotaoLink>
        <BotaoLink href="/avatares" variante="secundario"><UserPlus size={15} />Novo avatar</BotaoLink>
        {s.papel === "admin" && <BotaoLink href="/custos" variante="secundario"><BarChart3 size={15} />Ver custos</BotaoLink>}
      </>} />
      {(await searchParams).negado && <div className="mb-4"><Aviso tipo="erro">Você não tem permissão para acessar aquela tela.</Aviso></div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Vídeos gerados no mês" valor={m.n} />
        <Kpi rotulo="Gasto do mês × orçamento" valor={brl(m.gasto)} detalhe={orc.t ? `de ${brl(orc.t, 0)}` : "sem orçamento definido"} barra={pctOrc} />
        <Kpi rotulo="Custo médio por vídeo" valor={m.n ? brl(m.gasto / m.n) : "—"} />
        <Kpi rotulo="Aprovações pendentes" valor={pend.n} />
      </div>
      {alertas.length > 0 && (
        <Cartao titulo="Alertas" className="mb-6">
          <ul className="space-y-2">{alertas.map((a) => <li key={a.texto} className="flex items-center justify-between gap-2 text-sm"><span>⚠️ {a.texto}</span><BotaoLink href={a.href} variante="secundario" className="py-1 text-xs">Resolver</BotaoLink></li>)}</ul>
        </Cartao>
      )}
      <Cartao titulo="Últimos vídeos">
        {ultimos.length === 0 ? <Vazio>Nenhum vídeo ainda. <Link href="/videos/novo" className="text-marca-600 underline">Criar o primeiro</Link></Vazio> : (
          <table className="tabela">
            <thead><tr><th>Vídeo</th><th>Formato</th><th>Status</th><th>Custo</th><th>Atualizado</th></tr></thead>
            <tbody>{ultimos.map((v) => {
              const st = STATUS_VIDEO[v.status];
              return (
                <tr key={v.id}>
                  <td><Link href={v.status === "rascunho" ? `/videos/${v.id}/formato` : `/videos/${v.id}`} className="font-medium text-marca-600 hover:underline">{v.titulo}</Link><div className="text-xs text-slate-500">{v.projeto}</div></td>
                  <td>{FORMATOS[v.formato]} · {v.duracaoAlvo}s</td>
                  <td><Selo cor={st.cor}>{st.nome}</Selo></td>
                  <td className="tabular-nums">{brl(v.custoReal)}{v.custoEstimado != null && <div className="text-xs text-slate-500">est. {brl(v.custoEstimado)}</div>}</td>
                  <td className="text-xs">{dataHora(v.atualizadoEm)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Cartao>
    </>
  );
}
