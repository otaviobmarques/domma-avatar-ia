import { Clapperboard as IcClapperboard } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { Cabecalho, Cartao, Botao } from "@/components/ui";
import { novoVideo } from "@/app/acoes/videos";
import { FORMATOS } from "@/lib/formato";

export default async function NovoVideo() {
  await exigir(["admin", "editor"]);
  const db = await getDb();
  const modelos = await db.select().from(schema.videos).where(eq(schema.videos.isModelo, true)).orderBy(desc(schema.videos.criadoEm));
  return (
    <>
      <Cabecalho titulo="Novo vídeo" icone={IcClapperboard} sub="Formato → Roteiro → Avatar e cenário → Motores e custo → Revisão" />
      <div className="grid gap-4 md:grid-cols-2">
        <Cartao titulo="Começar do zero">
          <p className="mb-4 text-sm text-slate-600">Carro-chefe do MVP: propaganda de 15 a 60 segundos.</p>
          <form action={novoVideo}><Botao>Criar vídeo</Botao></form>
        </Cartao>
        <Cartao titulo="Usar modelo">
          {modelos.length === 0 ? <p className="text-sm text-slate-500">Nenhum modelo salvo. Na revisão de um vídeo, use “Salvar como modelo”.</p> : (
            <form action={novoVideo} className="flex flex-wrap gap-2">
              <select name="modeloId" className="campo flex-1">{modelos.map((m) => <option key={m.id} value={m.id}>{m.modeloNome ?? m.titulo} · {FORMATOS[m.formato]} {m.duracaoAlvo}s</option>)}</select>
              <Botao>Usar modelo</Botao>
            </form>
          )}
        </Cartao>
      </div>
    </>
  );
}
