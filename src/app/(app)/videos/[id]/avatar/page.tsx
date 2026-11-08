import { and, eq, ne, or, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { carregarVideo } from "@/lib/pipeline";
import { urlRelativa } from "@/lib/storage";
import { segundosFala } from "@/lib/fala";
import { Cabecalho, Cartao, Botao, Aviso, BotaoLink } from "@/components/ui";
import { PassosVideo } from "../../PassosVideo";
import { salvarAvatarCenario } from "@/app/acoes/videos";
import { data } from "@/lib/formato";

export default async function AvatarCenario({ params }: { params: Promise<{ id: string }> }) {
  await exigir(["admin", "editor"]);
  const { id } = await params;
  const { video: v } = await carregarVideo(id);
  const db = await getDb();
  const avatares = await db.select().from(schema.avatares).where(ne(schema.avatares.status, "excluido"));
  const filtroEmp = v.empresaId ? or(eq(schema.biblioteca.empresaId, v.empresaId), isNull(schema.biblioteca.empresaId)) : undefined;
  const bib = await db.select().from(schema.biblioteca).where(filtroEmp);
  const cenarios = bib.filter((b) => b.tipo === "cenario");
  const logos = bib.filter((b) => b.tipo === "logotipo");
  const trilhas = bib.filter((b) => b.tipo === "trilha");
  const prontos = avatares.filter((a) => a.status === "pronto" && a.consentimentoValidade && a.consentimentoValidade > new Date());
  // Sugestão de cenas de apoio: avatar só onde fala para a câmera; trechos longos do meio viram b-roll (reduz custo)
  const sugestao = (i: number) => {
    const b = v.roteiro[i];
    if (b.tipo !== "avatar") return b.tipo;
    const meio = i > 0 && i < v.roteiro.length - 1;
    return meio && segundosFala(b) > 7 && !b.marcacoes.includes("olha_camera") ? "broll" : "avatar";
  };
  void and;
  return (
    <>
      <Cabecalho titulo="Novo vídeo — Avatar e cenário" sub="Escolher quem fala e onde." />
      <PassosVideo id={id} atual={2} />
      <form action={salvarAvatarCenario.bind(null, id)} className="space-y-4">
        <Cartao titulo="Avatar">
          {prontos.length === 0 ? <Aviso tipo="aviso">Nenhum avatar pronto com consentimento válido. <a className="underline" href="/avatares">Criar avatar</a></Aviso> : (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {prontos.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-2 has-[:checked]:border-marca-500 has-[:checked]:bg-marca-50">
                  <input type="radio" name="avatarId" value={a.id} defaultChecked={v.avatarId === a.id || (!v.avatarId && prontos[0].id === a.id)} className="sr-only" />
                  <div className="h-14 w-11 shrink-0 overflow-hidden rounded bg-slate-100">{a.foto && <img src={urlRelativa(a.foto)!} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="text-sm"><div className="font-semibold">{a.nome}</div><div className="text-xs text-slate-500">{Object.keys(a.modelos).join(", ")} · até {data(a.consentimentoValidade)}</div></div>
                </label>
              ))}
            </div>
          )}
        </Cartao>

        <Cartao titulo="Cenário" acoes={<BotaoLink href="/biblioteca" variante="fantasma">Biblioteca</BotaoLink>}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {cenarios.map((c) => (
              <label key={c.id} className="cursor-pointer overflow-hidden rounded-xl border-2 border-transparent has-[:checked]:border-marca-500">
                <input type="radio" name="cenarioId" value={c.id} defaultChecked={v.cenarioId === c.id || (!v.cenarioId && cenarios[0]?.id === c.id)} className="sr-only" />
                <div className="aspect-[9/16] bg-slate-200">{c.arquivo && <img src={urlRelativa(c.arquivo)!} alt="" className="h-full w-full object-cover" />}</div>
                <div className="truncate p-1 text-center text-xs">{c.nome}<div className="text-[10px] text-emerald-700">reaproveita sem custo</div></div>
              </label>
            ))}
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-2 text-center text-xs has-[:checked]:border-marca-500">
              <input type="radio" name="cenarioId" value="novo" defaultChecked={false} className="sr-only" />
              <span className="text-2xl">+</span>Gerar cenário novo<span className="text-[10px] text-slate-500">Kolors · salva na biblioteca</span>
            </label>
          </div>
        </Cartao>

        <div className="grid gap-4 md:grid-cols-2">
          <Cartao titulo="Enquadramento e olhar">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="rotulo">Enquadramento padrão</label>
                <select name="enquadramento" className="campo" defaultValue={v.enquadramento}><option value="rosto">Rosto (close)</option><option value="meio_corpo">Meio corpo</option></select></div>
              <div><label className="rotulo">Comportamento do olhar</label>
                <select name="olhar" className="campo" defaultValue={v.olhar}><option value="camera">Câmera (piscadas no ritmo da fala)</option><option value="alternado">Alternado</option></select></div>
            </div>
          </Cartao>
          <Cartao titulo="Acabamento">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="rotulo">Logotipo</label><select name="logoId" className="campo" defaultValue={v.logoId ?? ""}><option value="">— nenhum —</option>{logos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
              <div><label className="rotulo">Trilha</label><select name="trilhaId" className="campo" defaultValue={v.trilhaId ?? ""}><option value="">— nenhuma —</option>{trilhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="legendas" defaultChecked={v.legendas} />Legendas</label>
            </div>
          </Cartao>
        </div>

        <Cartao titulo="Cenas de apoio — onde o avatar sai e entra b-roll (reduz custo)">
          <table className="tabela">
            <thead><tr><th>#</th><th>Fala</th><th>Tempo</th><th>Mostrar</th></tr></thead>
            <tbody>{v.roteiro.map((b, i) => (
              <tr key={b.id}>
                <td>{i + 1}</td><td className="max-w-md text-slate-600">{b.texto || <em>cartão de texto</em>}</td><td className="tabular-nums">{segundosFala(b).toFixed(0)}s</td>
                <td>
                  <select name={`tipo_${b.id}`} className="campo w-auto py-1 text-xs" defaultValue={b.tipo}>
                    <option value="avatar">Avatar{sugestao(i) === "avatar" && b.tipo === "avatar" ? " ✓" : ""}</option>
                    <option value="broll">B-roll{sugestao(i) === "broll" && b.tipo !== "broll" ? " (sugerido)" : ""}</option>
                    <option value="texto">Texto animado</option>
                  </select>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </Cartao>
        <div className="flex gap-2"><BotaoLink href={`/videos/${id}/roteiro`} variante="secundario">Voltar</BotaoLink><Botao>Próximo: motores e custo</Botao></div>
      </form>
    </>
  );
}
