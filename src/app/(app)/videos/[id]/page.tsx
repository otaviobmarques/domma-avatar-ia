import { notFound } from "next/navigation";
import { asc, desc, eq, or, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { urlRelativa } from "@/lib/storage";
import { lerConfig } from "@/lib/config";
import { Cabecalho } from "@/components/ui";
import { PassosVideo } from "../PassosVideo";
import { Editor } from "./Editor";
import { env } from "@/lib/env";

export default async function VideoPagina({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigir();
  const { id } = await params;
  const db = await getDb();
  const [v] = await db.select().from(schema.videos).where(eq(schema.videos.id, id));
  if (!v || (s.papel === "cliente" && v.empresaId !== s.empresaId)) notFound();
  const cenas = await db.select().from(schema.cenas).where(eq(schema.cenas.videoId, id)).orderBy(asc(schema.cenas.ordem));
  const aprov = await db.select().from(schema.aprovacoes).where(eq(schema.aprovacoes.videoId, id)).orderBy(desc(schema.aprovacoes.criadoEm));
  const bib = await db.select().from(schema.biblioteca).where(v.empresaId ? or(eq(schema.biblioteca.empresaId, v.empresaId), isNull(schema.biblioteca.empresaId)) : undefined);
  const cfg = await lerConfig();
  return (
    <>
      <Cabecalho titulo={v.titulo} sub={`${v.projeto ?? "Sem projeto"} · ${v.formato} · ${v.proporcao} · ${v.duracaoAlvo}s`} />
      <PassosVideo id={id} atual={4} />
      <Editor
        video={{
          id: v.id, status: v.status, erro: v.erro, previa: urlRelativa(v.previa), custoEstimado: v.custoEstimado, custoReal: v.custoReal, qualidade: v.qualidade,
          legendas: v.legendas, logoId: v.logoId, trilhaId: v.trilhaId, marcaDagua: v.marcaDagua, proporcao: v.proporcao, titulo: v.titulo,
          finais: Object.entries(v.finais).map(([k, p]) => ({ rotulo: k, url: urlRelativa(p, 86400)!, download: `${urlRelativa(p, 86400)}&download=${encodeURIComponent(`${v.titulo}-${k}.mp4`)}` })),
        }}
        cenas={cenas.map((c) => ({ id: c.id, ordem: c.ordem, tipo: c.tipo, texto: c.texto, duracao: c.duracao, motor: c.motor, versao: c.versao, temArquivo: !!c.arquivo }))}
        aprovacoes={aprov.map((a) => ({ id: a.id, status: a.status, link: `${env.appUrl}/a/${a.token}`, comentarios: a.comentarios, criadoEm: a.criadoEm.toISOString() }))}
        logos={bib.filter((b) => b.tipo === "logotipo").map((b) => ({ id: b.id, nome: b.nome }))}
        trilhas={bib.filter((b) => b.tipo === "trilha").map((b) => ({ id: b.id, nome: b.nome }))}
        podeEditar={s.papel !== "cliente"} admin={s.papel === "admin"} formatos={cfg.formatosExportacao}
      />
    </>
  );
}
