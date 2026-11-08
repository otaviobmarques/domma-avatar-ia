import { CheckCircle2 as IcCheckCircle2 } from "lucide-react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { env } from "@/lib/env";
import { Cabecalho, Cartao, Selo, Vazio } from "@/components/ui";
import { dataHora, mmss } from "@/lib/formato";

export default async function Aprovacoes() {
  const s = await exigir();
  const db = await getDb();
  const linhas = await db.select({ a: schema.aprovacoes, v: schema.videos }).from(schema.aprovacoes)
    .innerJoin(schema.videos, eq(schema.videos.id, schema.aprovacoes.videoId)).where(s.papel === "cliente" && s.empresaId ? eq(schema.videos.empresaId, s.empresaId) : undefined)
    .orderBy(desc(schema.aprovacoes.criadoEm)).limit(200);
  return (
    <>
      <Cabecalho titulo="Aprovações" icone={IcCheckCircle2} sub="Links enviados aos clientes — aprovam sem precisar de conta." />
      {linhas.length === 0 ? <Vazio>Nenhum vídeo enviado para aprovação ainda.</Vazio> : (
        <Cartao>
          <table className="tabela">
            <thead><tr><th>Vídeo</th><th>Enviado</th><th>Status</th><th>Comentários</th><th>Link</th></tr></thead>
            <tbody>{linhas.map(({ a, v }) => (
              <tr key={a.id}>
                <td><Link href={`/videos/${v.id}`} className="font-medium text-marca-600 hover:underline">{v.titulo}</Link></td>
                <td>{dataHora(a.criadoEm)}</td>
                <td><Selo cor={a.status === "aprovado" ? "green" : a.status === "ajuste" ? "amber" : "gray"}>{a.status === "pendente" ? "aguardando" : a.status}</Selo>{a.decididoPor && <div className="text-xs text-slate-500">{a.decididoPor}</div>}</td>
                <td className="max-w-sm text-xs text-slate-600">{a.comentarios.map((c, i) => <div key={i}>{mmss(c.tempo)} — {c.texto}</div>)}</td>
                <td><a href={`${env.appUrl}/a/${a.token}`} target="_blank" className="text-xs text-marca-600 hover:underline">abrir</a></td>
              </tr>
            ))}</tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
