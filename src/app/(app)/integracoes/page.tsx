import { Plug as IcPlug } from "lucide-react";
import { desc, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { PROVEDORES } from "@/lib/catalogo";
import { Cabecalho, Aviso } from "@/components/ui";
import { CartaoIntegracao } from "./CartaoIntegracao";
import { lerConfig } from "@/lib/config";

export default async function Integracoes() {
  await exigir(["admin"]);
  const db = await getDb();
  const cfg = await lerConfig();
  const ints = await db.select().from(schema.integracoes);
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const gastos = await db.select({ p: schema.integracaoChamadas.provedor, t: sql<number>`coalesce(sum(${schema.integracaoChamadas.custo}),0)::float` })
    .from(schema.integracaoChamadas).where(gte(schema.integracaoChamadas.criadoEm, inicioMes)).groupBy(schema.integracaoChamadas.provedor);
  const chamadas = await db.select().from(schema.integracaoChamadas).orderBy(desc(schema.integracaoChamadas.criadoEm)).limit(400);
  const porProv = new Map(ints.map((i) => [i.provedor, i]));
  const configurados = PROVEDORES.filter((p) => porProv.get(p.id)?.status !== "nao_configurado");
  const disponiveis = PROVEDORES.filter((p) => porProv.get(p.id)?.status === "nao_configurado");
  const nomes = PROVEDORES.map((p) => ({ id: p.id, nome: p.nome }));
  const item = (p: (typeof PROVEDORES)[number]) => {
    const i = porProv.get(p.id)!;
    const { chaveCifrada: _c, ...seguro } = i;
    void _c;
    return (
      <CartaoIntegracao key={p.id} info={p} integ={{ ...seguro, temChave: !!i.chaveCifrada }} gastoMes={gastos.find((g) => g.p === p.id)?.t ?? 0}
        chamadas={chamadas.filter((c) => c.provedor === p.id).slice(0, 25).map((c) => ({ ...c, criadoEm: c.criadoEm.toISOString() }))} outros={nomes.filter((n) => n.id !== p.id)} />
    );
  };
  return (
    <>
      <Cabecalho titulo="Integrações" icone={IcPlug} sub="Cada provedor é um cartão: status, chave, saldo, teste e liga/desliga. Só o Administrador acessa." />
      <div className="mb-4 space-y-2">
        <Aviso tipo="aviso">Assinatura no site não é o mesmo que acesso por API. Antes de integrar, confirme para cada conta: existe API? qual plano? permite uso comercial e revenda (necessário na fase SaaS)? Evite serviços que operam sua conta pessoal por trás de um endpoint não oficial — risco de bloqueio.</Aviso>
        {cfg.modoDemo && <Aviso>Modo demonstração ativo: etapas sem motor ligado são geradas pelo simulador local (custo real R$ 0). Desative em Configurações quando as chaves estiverem cadastradas.</Aviso>}
      </div>
      {configurados.length > 0 && <div className="mb-8 grid gap-4 lg:grid-cols-2">{configurados.map(item)}</div>}
      <h2 id="adicionar" className="mb-3 mt-2 font-titulo text-lg font-bold text-tinta">Adicionar integração <span className="ml-1 text-sm font-medium text-slate-400">— provedores disponíveis para conectar</span></h2>
      <div className="grid gap-4 lg:grid-cols-2">{disponiveis.map(item)}</div>
    </>
  );
}
