import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { urlRelativa } from "@/lib/storage";
import { Cabecalho, Selo, Vazio, Cartao, Botao } from "@/components/ui";
import { data } from "@/lib/formato";
import { criarAvatar } from "@/app/acoes/avatares";
import { UserRound } from "lucide-react";

const ST: Record<string, { n: string; c: string }> = {
  rascunho: { n: "Sem consentimento", c: "red" }, consentido: { n: "Falta verificação", c: "amber" }, verificado: { n: "Falta material", c: "amber" },
  amostras: { n: "Falta treinar", c: "amber" }, pronto: { n: "Pronto", c: "green" },
};

export default async function Avatares({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const s = await exigir();
  const { empresa } = await searchParams;
  const db = await getDb();
  const empresas = await db.select().from(schema.empresas);
  const filtroEmpresa = s.papel === "cliente" ? s.empresaId : empresa;
  const lista = await db.select().from(schema.avatares)
    .where(and(ne(schema.avatares.status, "excluido"), filtroEmpresa ? eq(schema.avatares.empresaId, filtroEmpresa) : undefined)).orderBy(desc(schema.avatares.criadoEm));
  return (
    <>
      <Cabecalho titulo="Avatares" sub="Gêmeos digitais — só com consentimento verificado da própria pessoa." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/avatares" className={`rounded-full border px-3 py-1 ${!empresa ? "border-marca-500 bg-marca-50" : "border-slate-200 bg-white"}`}>Todas</Link>
        {empresas.map((e) => <Link key={e.id} href={`/avatares?empresa=${e.id}`} className={`rounded-full border px-3 py-1 ${empresa === e.id ? "border-marca-500 bg-marca-50" : "border-slate-200 bg-white"}`}>{e.nome}</Link>)}
      </div>
      {s.papel !== "cliente" && (
        <Cartao titulo="+ Criar avatar" className="mb-6">
          <form action={criarAvatar} className="flex flex-wrap items-end gap-3">
            <div><label className="rotulo">Nome do avatar</label><input name="nome" required className="campo w-64" placeholder="ex.: Otávio — Master Laudo" /></div>
            <div><label className="rotulo">Cliente / empresa</label>
              <select name="empresaId" className="campo w-56" defaultValue={s.empresaId ?? ""}>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
            <Botao>Começar (consentimento primeiro)</Botao>
          </form>
        </Cartao>
      )}
      {lista.length === 0 ? <Vazio>Nenhum avatar ainda.</Vazio> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((a) => {
            const st = ST[a.status] ?? ST.rascunho;
            const vencido = a.consentimentoValidade && a.consentimentoValidade < new Date();
            return (
              <Link key={a.id} href={`/avatares/${a.id}`} className="cartao flex gap-3 p-4 transition hover:border-marca-500">
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {a.foto ? <img src={urlRelativa(a.foto)!} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><UserRound /></div>}
                </div>
                <div className="min-w-0 text-sm">
                  <div className="truncate font-semibold">{a.nome}</div>
                  <div className="text-xs text-slate-500">{empresas.find((e) => e.id === a.empresaId)?.nome ?? "—"}</div>
                  <div className="mt-1 flex flex-wrap gap-1"><Selo cor={vencido ? "red" : st.c}>{vencido ? "Consentimento vencido" : st.n}</Selo></div>
                  <div className="mt-1 text-xs text-slate-500">Treinado: {Object.keys(a.modelos).join(", ") || "—"}</div>
                  <div className="text-xs text-slate-500">Consentimento até {data(a.consentimentoValidade)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
