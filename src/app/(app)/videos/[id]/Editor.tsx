"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Eye, Send, Download, Copy, BookmarkPlus, Film, Trash2, CheckCircle2, AlertTriangle, Info, Clapperboard } from "lucide-react";
import type { Comentario, ItemQualidade } from "@/db/schema";
import { Botao, Cartao, Aviso, Selo, Kpi } from "@/components/ui";
import { brl, mmss, STATUS_VIDEO, dataHora } from "@/lib/formato";
import { nomeEtapa } from "@/lib/catalogo";
import {
  statusVideo, regerarTrecho, custoTrecho, corrigirOlharAcao, salvarAcabamento, remontarPrevia, enviarParaAprovacao, aprovarERenderizar,
  duplicarVideo, salvarComoModelo, salvarTrechoBiblioteca, excluirVideo,
} from "@/app/acoes/videos";

type Status = Awaited<ReturnType<typeof statusVideo>>;
type Props = {
  video: { id: string; status: string; erro: string | null; previa: string | null; custoEstimado: number | null; custoReal: number; qualidade: ItemQualidade[]; legendas: boolean; logoId: string | null; trilhaId: string | null; marcaDagua: boolean; proporcao: string; titulo: string; finais: { rotulo: string; url: string; download: string }[] };
  cenas: { id: string; ordem: number; tipo: string; texto: string; duracao: number | null; motor: string | null; versao: number; temArquivo: boolean }[];
  aprovacoes: { id: string; status: string; link: string; comentarios: Comentario[]; criadoEm: string }[];
  logos: { id: string; nome: string }[]; trilhas: { id: string; nome: string }[]; podeEditar: boolean; admin: boolean; formatos: string[];
};

export function Editor(p: Props) {
  const r = useRouter();
  const player = useRef<HTMLVideoElement>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [props, setProps] = useState<string[]>([p.video.proporcao]);
  const [res, setRes] = useState<720 | 1080>(1080);
  const ocupado = ["gerando", "renderizando"].includes(st?.status ?? p.video.status);

  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      const s = await statusVideo(p.video.id).catch(() => null);
      if (!vivo || !s) return;
      setSt((ant) => {
        if (ant && ["gerando", "renderizando"].includes(ant.status) && !["gerando", "renderizando"].includes(s.status)) r.refresh();
        return s;
      });
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => { vivo = false; clearInterval(t); };
  }, [p.video.id, r]);

  const rodar = (f: () => Promise<{ ok: boolean; mensagem: string }>) => ini(async () => { const x = await f(); setMsg(x); r.refresh(); });
  const status = st?.status ?? p.video.status;
  const sv = STATUS_VIDEO[status] ?? STATUS_VIDEO.rascunho;
  const previa = p.video.previa;
  const inicios = p.cenas.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? 0 : acc[i - 1] + (p.cenas[i - 1].duracao ?? 0)], []);
  const total = p.cenas.reduce((s, c) => s + (c.duracao ?? 0), 0);
  const irPara = (t: number) => { if (player.current) { player.current.currentTime = t; player.current.play(); } };
  const icone = { erro: <AlertTriangle size={14} className="text-red-500" />, aviso: <AlertTriangle size={14} className="text-amber-500" />, info: <Info size={14} className="text-blue-500" /> };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi rotulo="Status" valor={<Selo cor={sv.cor} className="text-sm">{sv.nome}</Selo>} detalhe={ocupado ? `${st?.pct ?? 0}% das etapas` : undefined} barra={ocupado ? st?.pct ?? 0 : undefined} />
        <Kpi rotulo="Estimado" valor={brl(p.video.custoEstimado)} />
        <Kpi rotulo="Gasto até aqui" valor={brl(st?.custoReal ?? p.video.custoReal)} detalhe={p.video.custoEstimado ? `${Math.round(((st?.custoReal ?? p.video.custoReal) / p.video.custoEstimado) * 100)}% do estimado` : undefined} />
        <Kpi rotulo="Duração" valor={total ? mmss(total) : "—"} />
      </div>
      {(st?.erro ?? p.video.erro) && status === "erro" && <Aviso tipo="erro">{st?.erro ?? p.video.erro}</Aviso>}
      {msg && <Aviso tipo={msg.ok ? "ok" : "erro"}>{msg.mensagem}</Aviso>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Cartao titulo="Prévia">
          {previa ? <video ref={player} key={previa} src={previa} controls className="mx-auto max-h-[560px] w-full rounded-lg bg-black" /> :
            <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">{ocupado ? "Gerando prévia…" : "Sem prévia ainda"}</div>}
          {p.video.finais.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="rotulo">Versões finais</div>
              {p.video.finais.map((f) => <a key={f.rotulo} href={f.download} className="flex items-center gap-2 text-sm text-marca-600 hover:underline"><Download size={14} />Baixar MP4 {f.rotulo}</a>)}
            </div>
          )}
        </Cartao>

        <div className="space-y-4">
          <Cartao titulo="Linha do tempo por cena">
            {p.cenas.length === 0 ? <p className="text-sm text-slate-500">As cenas aparecem quando a prévia for gerada.</p> : (
              <>
                <div className="mb-3 flex h-8 overflow-hidden rounded-lg">
                  {p.cenas.map((c, i) => (
                    <button key={c.id} onClick={() => irPara(inicios[i])} title={`Cena ${i + 1}: ${c.texto}`} style={{ flex: Math.max(0.5, c.duracao ?? 1) }}
                      className={`border-r border-white text-[10px] font-semibold text-white ${c.tipo === "avatar" ? "bg-marca-500" : c.tipo === "broll" ? "bg-sky-500" : "bg-slate-500"}`}>{i + 1}</button>
                  ))}
                </div>
                <div className="space-y-2">
                  {p.cenas.map((c, i) => {
                    const jobs = st?.jobs.filter((j) => j.cenaId === c.id) ?? [];
                    return (
                      <div key={c.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => irPara(inicios[i])} className="font-mono text-xs text-marca-600 hover:underline">{mmss(inicios[i])}</button>
                          <Selo cor={c.tipo === "avatar" ? "violet" : c.tipo === "broll" ? "blue" : "slate"}>{c.tipo}</Selo>
                          {c.motor && <span className="text-xs text-slate-500">{c.motor.split("/")[1]}</span>}
                          {c.versao > 1 && <span className="text-xs text-slate-400">v{c.versao}</span>}
                          {jobs.map((j) => <Selo key={j.id} cor={j.status === "ok" ? "green" : j.status === "erro" ? "red" : j.status === "rodando" || j.status === "aguardando" ? "blue" : "gray"}>{nomeEtapa(j.etapa)}{j.provedor === "simulador" ? " (sim.)" : ""}</Selo>)}
                          {p.podeEditar && !ocupado && (
                            <div className="ml-auto flex gap-1">
                              <Botao variante="fantasma" className="px-2 py-1 text-xs" onClick={() => { setEditando(c.id); setTexto(c.texto); }}><RefreshCw size={12} />Regerar trecho</Botao>
                              {c.tipo === "avatar" && <Botao variante="fantasma" className="px-2 py-1 text-xs" onClick={() => rodar(() => corrigirOlharAcao(p.video.id, c.id))}><Eye size={12} />Corrigir olhar</Botao>}
                              {c.temArquivo && <Botao variante="fantasma" className="px-2 py-1 text-xs" onClick={() => rodar(() => salvarTrechoBiblioteca(p.video.id, c.id))}><BookmarkPlus size={12} /></Botao>}
                            </div>
                          )}
                        </div>
                        <p className="mt-1 text-slate-600">{c.texto || <em>cartão de texto</em>}</p>
                        {editando === c.id && (
                          <div className="mt-2 space-y-2">
                            <textarea className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} />
                            <div className="flex gap-2">
                              <Botao className="text-xs" disabled={pend} onClick={() => ini(async () => {
                                const custo = await custoTrecho(p.video.id, c.id);
                                if (!confirm(`Regerar só esta cena. Custo estimado do trecho: ${brl(custo)}. Continuar?`)) return;
                                const x = await regerarTrecho(p.video.id, c.id, texto !== c.texto ? texto : undefined);
                                setMsg(x); setEditando(null); r.refresh();
                              })}>Regerar (custo exibido antes)</Botao>
                              <Botao variante="fantasma" className="text-xs" onClick={() => setEditando(null)}>Cancelar</Botao>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Cartao>

          <Cartao titulo="Relatório de qualidade do Claude">
            {p.video.qualidade.length === 0 ? <p className="text-sm text-slate-500">{ocupado ? "A revisão roda depois da montagem." : "Sem relatório."}</p> : (
              <ul className="space-y-1 text-sm">
                {p.video.qualidade.map((q, i) => {
                  const t = q.tempo.split(":").reduce((a, b) => a * 60 + Number(b), 0);
                  return <li key={i} className="flex items-start gap-2">{icone[q.gravidade]}<span>{q.cena > 0 && <button className="font-mono text-xs text-marca-600 hover:underline" onClick={() => irPara(t)}>cena {q.cena} · {q.tempo}</button>} {q.mensagem}</span></li>;
                })}
              </ul>
            )}
          </Cartao>

          {st && st.jobs.length > 0 && (
            <details className="cartao p-4 text-sm">
              <summary className="cursor-pointer font-semibold">Fila de jobs ({st.jobs.filter((j) => j.status === "ok").length}/{st.jobs.length})</summary>
              <table className="tabela mt-2 text-xs">
                <thead><tr><th>Etapa</th><th>Motor</th><th>Status</th><th>Tent.</th><th>Custo</th><th>Obs.</th></tr></thead>
                <tbody>{st.jobs.map((j) => (
                  <tr key={j.id}><td>{nomeEtapa(j.etapa)}</td><td>{j.provedor}{j.modelo ? `/${j.modelo}` : ""}</td><td>{j.status}</td><td>{j.tentativas}</td><td>{j.custo != null ? brl(j.custo, 3) : "—"}</td>
                    <td className="max-w-xs text-slate-500">{j.fallbackDe ? `fallback de ${j.fallbackDe}` : j.erro ?? ""}</td></tr>
                ))}</tbody>
              </table>
            </details>
          )}
        </div>
      </div>

      {p.podeEditar && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Legendas, trilha, logotipo, marca d'água">
            <form action={(fd) => rodar(() => salvarAcabamento(p.video.id, fd))} className="grid gap-3 sm:grid-cols-2">
              <div><label className="rotulo">Logotipo</label><select name="logoId" className="campo" defaultValue={p.video.logoId ?? ""}><option value="">— nenhum —</option>{p.logos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
              <div><label className="rotulo">Trilha</label><select name="trilhaId" className="campo" defaultValue={p.video.trilhaId ?? ""}><option value="">— nenhuma —</option>{p.trilhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="legendas" defaultChecked={p.video.legendas} />Legendas</label>
              <label className="flex items-center gap-2 text-sm" title={p.admin ? "" : "Só o Administrador pode desligar"}><input type="checkbox" name="marcaDagua" defaultChecked={p.video.marcaDagua} disabled={!p.admin} />Marca d&apos;água “gerado por IA”</label>
              <div className="flex gap-2 sm:col-span-2"><Botao variante="secundario">Salvar</Botao><Botao type="button" variante="secundario" disabled={ocupado || !p.cenas.length} onClick={() => rodar(() => remontarPrevia(p.video.id))}><Clapperboard size={14} />Remontar prévia</Botao></div>
            </form>
          </Cartao>

          <Cartao titulo="Aprovação e versão final">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" disabled={pend || ocupado || !previa} onClick={() => ini(async () => { const x = await enviarParaAprovacao(p.video.id); setMsg(x); if (x.link) setLink(x.link); r.refresh(); })}><Send size={14} />Enviar para aprovação</Botao>
              </div>
              {(link ?? p.aprovacoes[0]?.link) && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                  <code className="flex-1 truncate">{link ?? p.aprovacoes[0].link}</code>
                  <button onClick={() => navigator.clipboard.writeText(link ?? p.aprovacoes[0].link)} className="text-marca-600"><Copy size={14} /></button>
                </div>
              )}
              {p.aprovacoes[0] && (
                <div className="text-sm">
                  <Selo cor={p.aprovacoes[0].status === "aprovado" ? "green" : p.aprovacoes[0].status === "ajuste" ? "amber" : "gray"}>Cliente: {p.aprovacoes[0].status}</Selo>
                  {p.aprovacoes[0].comentarios.map((c, i) => <p key={i} className="mt-1 text-slate-600"><button className="font-mono text-xs text-marca-600" onClick={() => irPara(c.tempo)}>{mmss(c.tempo)}</button> {c.autor}: {c.texto} <span className="text-xs text-slate-400">{dataHora(c.em)}</span></p>)}
                </div>
              )}
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 flex flex-wrap gap-3 text-sm">
                  {["9:16", "16:9", "1:1"].filter((f) => p.formatos.includes(f)).map((f) => <label key={f} className="flex items-center gap-1"><input type="checkbox" checked={props.includes(f)} onChange={(e) => setProps(e.target.checked ? [...props, f] : props.filter((x) => x !== f))} />{f}</label>)}
                  <select className="campo w-auto py-1" value={res} onChange={(e) => setRes(Number(e.target.value) as 720)}><option value={720}>720p</option><option value={1080}>1080p</option></select>
                </div>
                <Botao disabled={pend || ocupado || !previa || !props.length} onClick={() => rodar(() => aprovarERenderizar(p.video.id, res, props))}><CheckCircle2 size={14} />Aprovar e renderizar em alta</Botao>
                <p className="mt-1 text-xs text-slate-500">Reaproveita as cenas já geradas — a versão final não tem novo custo de IA.</p>
              </div>
            </div>
          </Cartao>

          <Cartao titulo="Reaproveitar" className="lg:col-span-2">
            <div className="flex flex-wrap items-end gap-2">
              <form action={duplicarVideo.bind(null, p.video.id)} className="flex flex-wrap items-end gap-2">
                <div><label className="rotulo">Duração da variação (s)</label><input name="duracao" type="number" className="campo w-28" placeholder="igual" /></div>
                <Botao variante="secundario"><Film size={14} />Duplicar vídeo</Botao>
              </form>
              <Botao variante="secundario" disabled={pend} onClick={() => { const n = prompt("Nome do modelo", p.video.titulo); if (n) rodar(() => salvarComoModelo(p.video.id, n)); }}><BookmarkPlus size={14} />Salvar como modelo</Botao>
              <form action={excluirVideo.bind(null, p.video.id)} onSubmit={(e) => !confirm("Excluir este vídeo?") && e.preventDefault()} className="ml-auto"><Botao variante="perigo"><Trash2 size={14} />Excluir</Botao></form>
            </div>
          </Cartao>
        </div>
      )}
    </div>
  );
}
