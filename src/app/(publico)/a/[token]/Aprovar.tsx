"use client";
import { useRef, useState, useTransition } from "react";
import type { Comentario } from "@/db/schema";
import { Botao, Aviso } from "@/components/ui";
import { mmss } from "@/lib/formato";
import { aprovarCliente, pedirAjuste } from "@/app/acoes/aprovacao";

export function Aprovar({ token, video, status, comentarios }: { token: string; video: string | null; status: string; comentarios: Comentario[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [tempo, setTempo] = useState(0);
  const [lista, setLista] = useState(comentarios);
  const [st, setSt] = useState(status);
  const [msg, setMsg] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [pend, ini] = useTransition();
  return (
    <div className="space-y-4">
      {video ? <video ref={ref} src={video} controls className="mx-auto max-h-[70vh] w-full rounded-xl bg-black" onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)} /> : <Aviso tipo="erro">Vídeo indisponível</Aviso>}
      {st === "aprovado" ? <Aviso tipo="ok">Vídeo aprovado. Obrigado!</Aviso> : (
        <div className="cartao space-y-3 p-4">
          <div><label className="rotulo">Seu nome</label><input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div>
            <label className="rotulo">Comentário em {mmss(tempo)}</label>
            <textarea className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: trocar a palavra “barato” por “acessível”" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao disabled={pend} onClick={() => ini(async () => { const r = await aprovarCliente(token, nome); setMsg(r); setSt("aprovado"); })}>Aprovar</Botao>
            <Botao variante="secundario" disabled={pend || !texto.trim()} onClick={() => ini(async () => {
              const r = await pedirAjuste(token, nome, tempo, texto); setMsg(r);
              if (r.ok) { setLista([...lista, { tempo, texto, autor: nome || "Cliente", em: new Date().toISOString() }]); setTexto(""); setSt("ajuste"); }
            })}>Pedir ajuste</Botao>
          </div>
          {msg && <Aviso tipo={msg.ok ? "ok" : "erro"}>{msg.mensagem}</Aviso>}
        </div>
      )}
      {lista.length > 0 && (
        <ul className="cartao divide-y divide-slate-100 text-sm">
          {lista.map((c, i) => <li key={i} className="p-3"><button className="font-mono text-xs text-marca-600" onClick={() => { if (ref.current) ref.current.currentTime = c.tempo; }}>{mmss(c.tempo)}</button> <strong>{c.autor}</strong>: {c.texto}</li>)}
        </ul>
      )}
    </div>
  );
}
