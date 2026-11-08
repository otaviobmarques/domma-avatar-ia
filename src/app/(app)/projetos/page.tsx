import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { Cabecalho, Cartao, Selo, Vazio, BotaoLink } from "@/components/ui";
import { brl, data, STATUS_VIDEO, FORMATOS } from "@/lib/formato";

export default async function Projetos({ searchParams }: { searchParams: Promise<{ empresa?: string; status?: string }> }) {
  const s = await exigir();
  const sp = await searchParams;
  const db = await getDb();
  const empresas = await db.select().from(schema.empresas);
  const emp = s.papel === "cliente" ? s.empresaId ?? undefined : sp.empresa;
  const videos = await db.select().from(schema.videos)
    .where(and(eq(schema.videos.isModelo, false), emp ? eq(schema.videos.empresaId, emp) : undefined, sp.status ? eq(schema.videos.status, sp.status as "erro") : undefined))
    .orderBy(desc(schema.videos.criadoEm));
  const modelos = await db.select().from(schema.videos).where(eq(schema.videos.isModelo, true));
  // Agrupa por cliente → campanha
  const grupos = new Map<string, typeof videos>();
  for (const v of videos) {
    const k = `${empresas.find((e) => e.id === v.empresaId)?.nome ?? "Sem cliente"} · ${v.projeto ?? "Sem campanha"}`;
    grupos.set(k, [...(grupos.get(k) ?? []), v]);
  }
  return (
    <>
      <Cabecalho titulo="Projetos" sub="Vídeos por cliente e campanha." acoes={s.papel !== "cliente" && <BotaoLink href="/videos/novo">Novo vídeo</BotaoLink>} />
      {s.papel !== "cliente" && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link href="/projetos" className={`rounded-full border px-3 py-1 ${!sp.empresa ? "border-marca-500 bg-marca-50" : "border-slate-200 bg-white"}`}>Todos</Link>
          {empresas.map((e) => <Link key={e.id} href={`/projetos?empresa=${e.id}`} className={`rounded-full border px-3 py-1 ${sp.empresa === e.id ? "border-marca-500 bg-marca-50" : "border-slate-200 bg-white"}`}>{e.nome}</Link>)}
        </div>
      )}
      {grupos.size === 0 ? <Vazio>Nenhum vídeo.</Vazio> : (
        <div className="space-y-4">
          {[...grupos.entries()].map(([g, vs]) => (
            <Cartao key={g} titulo={g} acoes={<span className="text-xs text-slate-500">{vs.length} vídeo(s) · {brl(vs.reduce((a, v) => a + v.custoReal, 0))}</span>}>
              <table className="tabela">
                <tbody>{vs.map((v) => (
                  <tr key={v.id}>
                    <td><Link href={v.status === "rascunho" ? `/videos/${v.id}/formato` : `/videos/${v.id}`} className="font-medium text-marca-600 hover:underline">{v.titulo}</Link></td>
                    <td>{FORMATOS[v.formato]} · {v.duracaoAlvo}s · {v.proporcao}</td>
                    <td><Selo cor={STATUS_VIDEO[v.status].cor}>{STATUS_VIDEO[v.status].nome}</Selo></td>
                    <td className="tabular-nums">{brl(v.custoReal)}</td>
                    <td className="text-xs">{data(v.criadoEm)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Cartao>
          ))}
        </div>
      )}
      {modelos.length > 0 && (
        <Cartao titulo="Modelos salvos" className="mt-6">
          <ul className="text-sm">{modelos.map((m) => <li key={m.id}>• {m.modeloNome} — {FORMATOS[m.formato]} {m.duracaoAlvo}s</li>)}</ul>
        </Cartao>
      )}
    </>
  );
}
