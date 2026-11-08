import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { carregarVideo } from "@/lib/pipeline";
import { Cabecalho, Cartao, Botao, BotaoLink } from "@/components/ui";
import { PassosVideo } from "../../PassosVideo";
import { salvarFormato } from "@/app/acoes/videos";

const FORMATOS = [
  { id: "propaganda", nome: "Propaganda", desc: "Oferta + chamada para ação" },
  { id: "depoimento", nome: "Depoimento", desc: "Experiência em primeira pessoa" },
  { id: "apresentacao", nome: "Apresentação", desc: "Institucional, explicativo" },
  { id: "ugc", nome: "UGC", desc: "Estilo criador de conteúdo" },
  { id: "podcast", nome: "Podcast", desc: "Fase 2", desabilitado: true },
];

export default async function Formato({ params }: { params: Promise<{ id: string }> }) {
  await exigir(["admin", "editor"]);
  const { id } = await params;
  const { video: v } = await carregarVideo(id);
  const db = await getDb();
  const empresas = await db.select().from(schema.empresas);
  const padrao = [15, 30, 60].includes(v.duracaoAlvo);
  return (
    <>
      <Cabecalho titulo="Novo vídeo — Formato" sub="Definir o tipo de vídeo." />
      <PassosVideo id={id} atual={0} />
      <form action={salvarFormato.bind(null, id)}>
        <Cartao>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div><label className="rotulo">Título</label><input name="titulo" className="campo" defaultValue={v.titulo} required /></div>
            <div><label className="rotulo">Projeto / campanha</label><input name="projeto" className="campo" defaultValue={v.projeto ?? ""} placeholder="ex.: Black Friday 2026" /></div>
          </div>
          <span className="rotulo">Formato</span>
          <div className="mb-5 grid gap-2 sm:grid-cols-5">
            {FORMATOS.map((f) => (
              <label key={f.id} className={`cursor-pointer rounded-xl border p-3 text-sm has-[:checked]:border-marca-500 has-[:checked]:bg-marca-50 ${f.desabilitado ? "cursor-not-allowed opacity-50" : ""}`}>
                <input type="radio" name="formato" value={f.id} defaultChecked={v.formato === f.id} disabled={f.desabilitado} className="sr-only" />
                <div className="font-semibold">{f.nome}</div><div className="text-xs text-slate-500">{f.desc}</div>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <span className="rotulo">Duração alvo</span>
              <div className="flex flex-wrap gap-2">
                {[15, 30, 60].map((d) => <label key={d} className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm has-[:checked]:border-marca-500 has-[:checked]:bg-marca-50"><input type="radio" name="duracao" value={d} defaultChecked={v.duracaoAlvo === d} className="sr-only" />{d}s</label>)}
                <input name="duracaoPersonalizada" type="number" min={5} max={300} className="campo w-28" placeholder="outra (s)" defaultValue={padrao ? "" : v.duracaoAlvo} />
              </div>
            </div>
            <div>
              <span className="rotulo">Proporção</span>
              <div className="flex gap-2">
                {["9:16", "16:9", "1:1"].map((p) => <label key={p} className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm has-[:checked]:border-marca-500 has-[:checked]:bg-marca-50"><input type="radio" name="proporcao" value={p} defaultChecked={v.proporcao === p} className="sr-only" />{p}</label>)}
              </div>
            </div>
            <div><label className="rotulo">Cliente / empresa</label>
              <select name="empresaId" className="campo" defaultValue={v.empresaId ?? ""}>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
          </div>
          <div className="mt-6 flex gap-2"><Botao>Próximo</Botao><BotaoLink href="/videos/novo" variante="secundario">Usar modelo</BotaoLink></div>
        </Cartao>
      </form>
    </>
  );
}
