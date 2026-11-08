import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { urlRelativa } from "@/lib/storage";
import { Logo } from "@/components/Logo";
import { Aprovar } from "./Aprovar";

export const dynamic = "force-dynamic";

export default async function PaginaAprovacao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const [a] = await db.select().from(schema.aprovacoes).where(eq(schema.aprovacoes.token, token));
  if (!a) notFound();
  const [v] = await db.select().from(schema.videos).where(eq(schema.videos.id, a.videoId));
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-tinta px-6 py-4"><Logo claro /></header>
      <main className="mx-auto max-w-3xl p-4 md:p-8">
        <h1 className="text-2xl font-bold">{v?.titulo}</h1>
        <p className="mb-4 text-sm text-slate-500">Confira o vídeo. Para pedir ajuste, pause no momento exato e comente.</p>
        <Aprovar token={token} video={urlRelativa(a.arquivo ?? v?.previa, 60 * 60 * 24 * 7)} status={a.status} comentarios={a.comentarios} />
        <p className="mt-8 text-center text-xs text-slate-400">Conteúdo gerado por IA · Domma AvatarIA — Domma Tecnologia</p>
      </main>
    </div>
  );
}
