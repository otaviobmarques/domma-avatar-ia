"use client";
import { useMemo, useState, useTransition } from "react";
import { Sparkles, Layers, Wand2, Volume2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { BlocoRoteiro, Briefing } from "@/db/schema";
import { Botao, Cartao, Aviso, Selo } from "@/components/ui";
import { segundosFala } from "@/lib/fala";
import { brl } from "@/lib/formato";
import { gerarRoteiroIA, salvarRoteiro, custoPreviaVoz, ouvirPreviaVoz } from "@/app/acoes/videos";
import { statusTarefa } from "@/app/acoes/avatares";

const MARCAS: { id: string; nome: string }[] = [
  { id: "animado", nome: "animado" }, { id: "pausa", nome: "pausa" }, { id: "olha_camera", nome: "olha p/ câmera" },
  { id: "enfase", nome: "ênfase" }, { id: "pensar", nome: "pensar" }, { id: "sorriso", nome: "sorriso" }, { id: "serio", nome: "sério" },
];
const TIPOS = { avatar: "Avatar falando", broll: "B-roll (narração)", texto: "Texto animado" };
const AJUSTES = ["Mais curto", "Mais formal", "Mais animado", "Mais direto na oferta", "Mais emocional"];

let n = 0;
const novoId = () => `n${Date.now().toString(36)}${n++}`;

export function EditorRoteiro({ id, duracaoAlvo, briefingInicial, roteiroInicial }: { id: string; duracaoAlvo: number; briefingInicial: Briefing; roteiroInicial: BlocoRoteiro[] }) {
  const [briefing, setBriefing] = useState<Briefing>(briefingInicial);
  const [blocos, setBlocos] = useState<BlocoRoteiro[]>(roteiroInicial);
  const [versoes, setVersoes] = useState<{ abordagem: string; blocos: BlocoRoteiro[] }[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const total = useMemo(() => blocos.reduce((s, b) => s + (b.tipo === "texto" && !b.texto ? 2.5 : segundosFala(b)), 0), [blocos]);
  const seg = (b: BlocoRoteiro) => segundosFala(b);

  const atualizar = (i: number, d: Partial<BlocoRoteiro>) => setBlocos(blocos.map((b, k) => (k === i ? { ...b, ...d } : b)));
  const mover = (i: number, d: number) => { const c = [...blocos]; const [x] = c.splice(i, 1); c.splice(i + d, 0, x); setBlocos(c); };
  const gerar = (qtd: 1 | 3, ajuste?: string) => ini(async () => {
    const r = await gerarRoteiroIA(id, briefing, qtd, ajuste, ajuste ? blocos : undefined);
    setMsg({ ok: r.ok, mensagem: r.mensagem });
    if (!r.ok) return;
    if (qtd === 3) setVersoes(r.versoes);
    else if (r.versoes[0]) { setBlocos(r.versoes[0].blocos); setVersoes(null); }
  });

  const campo = (k: keyof Briefing, rotulo: string, ph: string) => (
    <div><label className="rotulo">{rotulo}</label><input className="campo" value={briefing[k] ?? ""} placeholder={ph} onChange={(e) => setBriefing({ ...briefing, [k]: e.target.value })} /></div>
  );

  return (
    <div className="space-y-4">
      <Cartao titulo="Briefing">
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("produto", "Produto", "ex.: Laudo cautelar Master Laudo")}
          {campo("publico", "Público", "ex.: lojistas de veículos seminovos")}
          {campo("oferta", "Oferta", "ex.: primeiro laudo com 20% de desconto")}
          {campo("cta", "Chamada para ação", "ex.: acesse masterlaudo.com.br")}
          <div className="sm:col-span-2">{campo("observacoes", "Observações (opcional)", "tom, palavras proibidas, diferenciais…")}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Botao disabled={pend || !briefing.produto} onClick={() => gerar(1)}><Sparkles size={14} />{pend ? "Escrevendo…" : "Gerar roteiro com IA"}</Botao>
          <Botao variante="secundario" disabled={pend || !briefing.produto} onClick={() => gerar(3)}><Layers size={14} />Gerar 3 versões</Botao>
          {blocos.length > 0 && (
            <select className="campo w-auto" value="" disabled={pend} onChange={(e) => e.target.value && gerar(1, e.target.value)}>
              <option value="">Ajustar tom…</option>{AJUSTES.map((a) => <option key={a}>{a}</option>)}
            </select>
          )}
        </div>
        {msg && <div className="mt-3"><Aviso tipo={msg.ok ? "ok" : "erro"}>{msg.mensagem}</Aviso></div>}
      </Cartao>

      {versoes && (
        <div className="grid gap-3 md:grid-cols-3">
          {versoes.map((v, i) => (
            <div key={i} className="cartao flex flex-col p-4">
              <div className="mb-2 font-semibold">{i + 1}. {v.abordagem}</div>
              <div className="flex-1 space-y-1 text-sm text-slate-600">{v.blocos.map((b) => <p key={b.id}><Selo>{b.tipo}</Selo> {b.texto}</p>)}</div>
              <Botao className="mt-3" variante="secundario" onClick={() => { setBlocos(v.blocos); setVersoes(null); }}>Escolher esta</Botao>
            </div>
          ))}
        </div>
      )}

      <Cartao titulo="Roteiro cena a cena" acoes={
        <div className={`text-sm font-semibold tabular-nums ${total > duracaoAlvo * 1.15 ? "text-red-600" : total < duracaoAlvo * 0.7 ? "text-amber-600" : "text-emerald-700"}`}>
          ⏱ {total.toFixed(0)}s de fala estimada / alvo {duracaoAlvo}s
        </div>
      }>
        <div className="space-y-3">
          {blocos.map((b, i) => (
            <div key={b.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400">CENA {i + 1}</span>
                <select className="campo w-auto py-1 text-xs" value={b.tipo} onChange={(e) => atualizar(i, { tipo: e.target.value as BlocoRoteiro["tipo"] })}>
                  {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {b.tipo === "avatar" && (
                  <select className="campo w-auto py-1 text-xs" value={b.enquadramento ?? "meio_corpo"} onChange={(e) => atualizar(i, { enquadramento: e.target.value as "rosto" })}>
                    <option value="rosto">close no rosto</option><option value="meio_corpo">meio corpo</option>
                  </select>
                )}
                <span className="ml-auto text-xs text-slate-500 tabular-nums">~{seg(b).toFixed(1)}s</span>
                <button className="rounded p-1 hover:bg-slate-100" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={14} /></button>
                <button className="rounded p-1 hover:bg-slate-100" disabled={i === blocos.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={14} /></button>
                <button className="rounded p-1 text-red-500 hover:bg-red-50" onClick={() => setBlocos(blocos.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
              </div>
              <textarea className="campo min-h-16" value={b.texto} onChange={(e) => atualizar(i, { texto: e.target.value })} placeholder="Fala exata. Use [pausa] no meio do texto." />
              {b.tipo === "broll" && <input className="campo mt-2 text-sm" value={b.broll ?? ""} onChange={(e) => atualizar(i, { broll: e.target.value })} placeholder="[b-roll: o que aparece na tela — ex.: tela do sistema]" />}
              <div className="mt-2 flex flex-wrap gap-1">
                {MARCAS.map((m) => {
                  const on = b.marcacoes.includes(m.id);
                  return <button key={m.id} type="button" onClick={() => atualizar(i, { marcacoes: on ? b.marcacoes.filter((x) => x !== m.id) : [...b.marcacoes, m.id] })}
                    className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-marca-500 bg-marca-50 text-marca-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>[{m.nome}]</button>;
                })}
              </div>
            </div>
          ))}
          <Botao variante="secundario" onClick={() => setBlocos([...blocos, { id: novoId(), tipo: "avatar", texto: "", marcacoes: ["olha_camera"], enquadramento: "meio_corpo" }])}><Plus size={14} />Adicionar cena</Botao>
        </div>
      </Cartao>

      <div className="flex flex-wrap items-center gap-2">
        <Botao variante="secundario" disabled={pend || !blocos.length} onClick={() => ini(async () => {
          const c = await custoPreviaVoz(id, blocos);
          if (!confirm(`Ouvir prévia da voz em ${c.motor ?? "?"}${c.simulado ? " (simulado)" : ""}.\nCusto estimado: ${c.simulado ? "R$ 0,00" : brl(c.custo)}. Continuar?`)) return;
          const r = await ouvirPreviaVoz(id, blocos);
          if (!r.ok || !r.tarefa) return setMsg(r);
          setMsg(r);
          for (let k = 0; k < 200; k++) {
            await new Promise((ok) => setTimeout(ok, 1500));
            const st = await statusTarefa(r.tarefa);
            if (st.status === "rodando") continue;
            setMsg(st); if (st.url) setAudio(st.url);
            break;
          }
        })}><Volume2 size={14} />Ouvir prévia da voz</Botao>
        {audio && <audio src={audio} controls autoPlay className="h-9" />}
        <Botao variante="fantasma" disabled={pend} onClick={() => ini(async () => setMsg(await salvarRoteiro(id, briefing, blocos)))}>Salvar</Botao>
        <Botao disabled={pend || !blocos.length || blocos.some((b) => b.tipo !== "texto" && !b.texto.trim())} onClick={() => ini(async () => { await salvarRoteiro(id, briefing, blocos, true); })}><Wand2 size={14} />Próximo: avatar e cenário</Botao>
      </div>
    </div>
  );
}
