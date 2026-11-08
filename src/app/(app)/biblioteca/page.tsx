import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { urlRelativa } from "@/lib/storage";
import { Cabecalho, Cartao, Botao, Selo, Vazio } from "@/components/ui";
import { adicionarItem, removerItem } from "@/app/acoes/biblioteca";
import { Trash2 } from "lucide-react";
import { FormBiblioteca } from "./FormBiblioteca";

const TIPOS: Record<string, string> = { cenario: "Cenários", vinheta: "Vinhetas", chamada: "Chamadas prontas", trilha: "Trilhas", logotipo: "Logotipos", trecho: "Trechos salvos" };

export default async function Biblioteca({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const s = await exigir();
  const { tipo } = await searchParams;
  const db = await getDb();
  const empresas = await db.select().from(schema.empresas);
  const itens = await db.select().from(schema.biblioteca).where(tipo ? eq(schema.biblioteca.tipo, tipo as "cenario") : undefined).orderBy(desc(schema.biblioteca.criadoEm));
  const midia = (i: (typeof itens)[number]) => {
    const u = urlRelativa(i.arquivo);
    if (!u) return <div className="flex h-full items-center justify-center p-2 text-center text-sm font-medium text-slate-600">{i.texto ?? i.nome}</div>;
    if (/\.(mp4|webm|mov)$/i.test(i.arquivo!)) return <video src={u} className="h-full w-full object-cover" muted controls />;
    if (/\.(mp3|wav|m4a|ogg)$/i.test(i.arquivo!)) return <div className="flex h-full items-center p-2"><audio src={u} controls className="w-full" /></div>;
    return <img src={u} alt="" className="h-full w-full object-cover" />;
  };
  return (
    <>
      <Cabecalho titulo="Biblioteca" sub="Cenários, vinhetas, chamadas prontas, trilhas e logotipos — tudo reaproveitável sem custo de nova geração." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/biblioteca" className={`rounded-full border px-3 py-1 ${!tipo ? "border-marca-500 bg-marca-50" : "border-slate-200 bg-white"}`}>Tudo</Link>
        {Object.entries(TIPOS).map(([k, v]) => <Link key={k} href={`/biblioteca?tipo=${k}`} className={`rounded-full border px-3 py-1 ${tipo === k ? "border-marca-500 bg-marca-50" : "border-slate-200 bg-white"}`}>{v}</Link>)}
      </div>
      {s.papel !== "cliente" && (
        <Cartao titulo="+ Adicionar" className="mb-6">
          <FormBiblioteca acao={adicionarItem}>
            <div><label className="rotulo">Tipo</label><select name="tipo" className="campo" defaultValue={tipo ?? "cenario"}>{Object.entries(TIPOS).filter(([k]) => k !== "trecho").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="rotulo">Nome</label><input name="nome" className="campo" /></div>
            <div className="sm:col-span-2"><label className="rotulo">Arquivo</label><input type="file" name="arquivo" className="campo" /></div>
            <div><label className="rotulo">Cliente</label><select name="empresaId" className="campo"><option value="">Todos</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
            <div><label className="rotulo">Tags</label><input name="tags" className="campo" placeholder="separe por vírgula" /></div>
            <div className="sm:col-span-5"><label className="rotulo">Texto (para chamadas prontas)</label><input name="texto" className="campo" placeholder="ex.: Acesse masterlaudo.com.br" /></div>
            <div className="flex items-end"><Botao>Salvar</Botao></div>
          </FormBiblioteca>
        </Cartao>
      )}
      {itens.length === 0 ? <Vazio>Nada aqui ainda.</Vazio> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {itens.map((i) => (
            <div key={i.id} className="cartao overflow-hidden">
              <div className={`${i.tipo === "cenario" ? "aspect-[9/16]" : "aspect-video"} bg-slate-100`}>{midia(i)}</div>
              <div className="flex items-start justify-between gap-1 p-2 text-xs">
                <div className="min-w-0"><div className="truncate font-medium">{i.nome}</div><div className="flex flex-wrap gap-1"><Selo>{TIPOS[i.tipo]}</Selo>{i.tags.map((t) => <Selo key={t} cor="gray">{t}</Selo>)}</div>
                  <div className="text-slate-500">{empresas.find((e) => e.id === i.empresaId)?.nome ?? "Todos os clientes"}</div></div>
                {s.papel !== "cliente" && <form action={removerItem.bind(null, i.id)}><button className="text-red-500" title="Remover"><Trash2 size={13} /></button></form>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
