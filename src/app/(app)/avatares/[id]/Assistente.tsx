"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, RefreshCw, Upload, Check, X, Star, Play, Trash2, Shuffle } from "lucide-react";
import { Botao, Cartao, Aviso, Selo } from "@/components/ui";
import { GravadorCamera, GravadorVoz } from "@/components/Gravadores";
import type { Consentimento, Verificacao } from "@/db/schema";
import { data } from "@/lib/formato";
import {
  aceitarConsentimento, enviarVerificacao, novaFrase, enviarRosto, definirFotoPrincipal, verificarRosto, aprovarVerificacaoManual,
  enviarVoz, treinarVoz, salvarModelos, compararVozes, concluirAvatar, testarAvatar, excluirClone,
} from "@/app/acoes/avatares";

type Props = {
  passo: number; admin: boolean; demo: boolean; motores: { id: string; ok: boolean }[]; termoModelo: string; empresa: string; textoLeitura: string;
  avatar: {
    id: string; nome: string; status: string; consentimento: Consentimento | null; validade: string | null; verificacao: (Verificacao & { video?: string }) | null;
    foto: string | null; fotos: { caminho: string; url: string }[]; video: string | null; videoDuracao: number | null; voz: string | null; vozDuracao: number | null; vozRuidoDb: number | null;
    checklist: Record<string, boolean>; modelos: Record<string, string>; motorVoz: string | null; motorAvatar: string | null;
  };
};

type Msg = { ok: boolean; mensagem: string } | null;

export function Assistente(p: Props) {
  const r = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pend, ini] = useTransition();
  const a = p.avatar;
  const ir = (n: number) => r.push(`/avatares/${a.id}?passo=${n + 1}`);
  const rodar = (f: () => Promise<{ ok: boolean; mensagem: string }>, proximo?: number) => ini(async () => {
    const res = await f();
    setMsg(res);
    if (res.ok && proximo != null) { setMsg(null); ir(proximo); } else r.refresh();
  });
  const Mensagem = () => msg && <div className="mt-3"><Aviso tipo={msg.ok ? "ok" : "erro"}>{msg.mensagem}</Aviso></div>;

  /* ---------- Passo 1: consentimento ---------- */
  if (p.passo === 0) {
    const [termo, setTermo] = [p.termoModelo, null];
    void setTermo;
    return (
      <Cartao titulo="Passo 1 — Consentimento (dado biométrico)">
        {a.consentimento && <div className="mb-4"><Aviso tipo="ok">Consentimento v{a.consentimento.termoVersao} aceito por {a.consentimento.nome} em {data(a.consentimento.aceitoEm)} · válido até {data(a.validade)} · hash {a.consentimento.hashTermo.slice(0, 12)}…</Aviso></div>}
        <form action={(fd) => rodar(() => aceitarConsentimento(a.id, fd), 1)} className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div><label className="rotulo">Nome completo da pessoa clonada</label><input name="nome" required className="campo" defaultValue={a.consentimento?.nome} /></div>
            <div><label className="rotulo">CPF da própria pessoa</label><input name="cpf" required className="campo" inputMode="numeric" placeholder="000.000.000-00" /></div>
            <div><label className="rotulo">Finalidade</label><input name="finalidade" required className="campo" defaultValue={a.consentimento?.finalidade ?? `Vídeos publicitários e institucionais${p.empresa ? ` da ${p.empresa}` : ""}`} /></div>
            <div><label className="rotulo">Prazo (meses)</label><input name="prazoMeses" type="number" min={1} max={60} className="campo w-32" defaultValue={a.consentimento?.prazoMeses ?? 12} /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="propriaPessoa" required className="mt-1" />Sou a própria pessoa retratada (é proibido clonar terceiros ou figuras públicas).</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="aceite" required className="mt-1" />Li e aceito o termo ao lado, incluindo o uso de rosto e voz como dado biométrico, a finalidade, o prazo e o direito de exclusão.</label>
            <Botao disabled={pend}><ShieldCheck size={15} />{a.consentimento ? "Renovar consentimento" : "Aceitar e continuar"}</Botao>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{termo}</pre>
        </form>
        <Mensagem />
      </Cartao>
    );
  }

  /* ---------- Passo 2: verificação ao vivo ---------- */
  if (p.passo === 1) {
    return <Passo2 {...p} rodar={rodar} pend={pend} Mensagem={Mensagem} ir={ir} />;
  }

  /* ---------- Passo 3: rosto ---------- */
  if (p.passo === 2) {
    const ck = a.checklist;
    const v = a.verificacao;
    return (
      <div className="space-y-4">
        <Cartao titulo="Passo 3 — Rosto: vídeo de 2 a 5 minutos + 5 a 10 fotos">
          <ul className="mb-4 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
            <li>• Falando para a câmera, luz frontal, fundo limpo</li><li>• Sem óculos escuros, boné ou mão no rosto</li>
            <li>• Fotos: frente, ¾ esquerda, ¾ direita, sorrindo, sério</li><li>• Mínimo 720p</li>
          </ul>
          <form action={(fd) => rodar(async () => { const res = await enviarRosto(a.id, fd); return { ok: res.ok, mensagem: `${res.mensagem}. ${res.detalhes?.join(" · ") ?? ""}` }; })} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="rotulo">Vídeo (2–5 min)</label><input type="file" name="video" accept="video/*" className="campo" /></div>
              <div><label className="rotulo">Fotos (5–10)</label><input type="file" name="fotos" accept="image/*" multiple className="campo" /></div>
            </div>
            <Botao disabled={pend}><Upload size={14} />{pend ? "Enviando e checando…" : "Enviar vídeo / Enviar fotos"}</Botao>
          </form>
          <Mensagem />
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {[["duracao", "Duração"], ["resolucao", "Resolução"], ["luz", "Luz"], ["fotos", "Fotos"]].map(([k, n]) => (
              <Selo key={k} cor={ck[k] == null ? "gray" : ck[k] ? "green" : "amber"}>{ck[k] ? <Check size={11} /> : ck[k] === false ? <X size={11} /> : null}{n}</Selo>
            ))}
          </div>
          {a.video && <video src={a.video} controls className="mt-4 max-h-64 rounded-lg" />}
          {a.fotos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {a.fotos.map((f) => (
                <button key={f.caminho} type="button" onClick={() => rodar(() => definirFotoPrincipal(a.id, f.caminho))} title="Definir como foto principal (usada pelo Kling)"
                  className={`relative h-24 w-20 overflow-hidden rounded-lg border-2 ${a.foto === f.caminho ? "border-marca-500" : "border-transparent"}`}>
                  <img src={f.url} alt="" className="h-full w-full object-cover" />
                  {a.foto === f.caminho && <Star size={14} className="absolute right-1 top-1 fill-marca-500 text-marca-500" />}
                </button>
              ))}
            </div>
          )}
        </Cartao>
        <Cartao titulo="Comparação com a verificação ao vivo">
          <p className="mb-2 text-sm text-slate-600">O sistema compara o rosto da gravação feita na hora (passo 2) com as fotos enviadas.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Selo cor={v?.status === "aprovada" ? "green" : v?.status === "reprovada" ? "red" : "gray"}>{v?.status ?? "pendente"}</Selo>
            {v?.observacao && <span className="text-xs text-slate-500">{v.observacao}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao variante="secundario" disabled={pend || !a.fotos.length} onClick={() => rodar(() => verificarRosto(a.id))}><ShieldCheck size={14} />Comparar rosto</Botao>
            {p.admin && v?.video && v.status !== "aprovada" && (
              <form action={(fd) => rodar(() => aprovarVerificacaoManual(a.id, fd))} className="flex gap-2">
                <input name="observacao" className="campo w-64" placeholder="Observação da conferência manual" />
                <Botao variante="secundario">Aprovar manualmente</Botao>
              </form>
            )}
            <Botao onClick={() => ir(3)} disabled={!a.fotos.length}>Próximo: voz</Botao>
          </div>
        </Cartao>
      </div>
    );
  }

  /* ---------- Passo 4: voz ---------- */
  if (p.passo === 3) return <Passo4 {...p} rodar={rodar} pend={pend} Mensagem={Mensagem} ir={ir} />;

  /* ---------- Passo 5: motores e teste ---------- */
  return <Passo5 {...p} rodar={rodar} pend={pend} Mensagem={Mensagem} setMsg={setMsg} ini={ini} />;
}

type Sub = Props & { rodar: (f: () => Promise<{ ok: boolean; mensagem: string }>, proximo?: number) => void; pend: boolean; Mensagem: () => React.ReactNode };

function Passo2({ avatar: a, rodar, pend, Mensagem, ir }: Sub & { ir: (n: number) => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  return (
    <Cartao titulo="Passo 2 — Verificação ao vivo">
      <p className="text-sm text-slate-600">Grave agora, pela câmera, a frase abaixo (gerada na hora, não dá para usar gravação antiga):</p>
      <div className="my-3 rounded-lg border-2 border-dashed border-marca-500 bg-marca-50 p-4 text-center text-lg font-semibold text-marca-700">“{a.verificacao?.frase}”</div>
      <div className="mb-3"><Botao variante="fantasma" disabled={pend} onClick={() => rodar(() => novaFrase(a.id))}><RefreshCw size={14} />Gerar outra frase</Botao></div>
      <GravadorCamera onPronto={setBlob} />
      <div className="mt-3 flex gap-2">
        <Botao disabled={!blob || pend} onClick={() => { const fd = new FormData(); fd.append("video", new File([blob!], `verificacao.${blob!.type.includes("mp4") ? "mp4" : "webm"}`, { type: blob!.type })); rodar(() => enviarVerificacao(a.id, fd), 2); }}>
          {pend ? "Enviando…" : "Enviar verificação e continuar"}
        </Botao>
        {a.verificacao?.video && <Botao variante="secundario" onClick={() => ir(2)}>Já gravei — próximo</Botao>}
      </div>
      {a.verificacao?.video && <div className="mt-4"><p className="mb-1 text-xs text-slate-500">Gravação salva:</p><video src={a.verificacao.video} controls className="max-h-48 rounded-lg" /></div>}
      <Mensagem />
    </Cartao>
  );
}

function Passo4({ avatar: a, rodar, pend, Mensagem, ir, textoLeitura }: Sub & { ir: (n: number) => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  return (
    <Cartao titulo="Passo 4 — Voz: 2 minutos de leitura guiada em ambiente silencioso">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-4 text-[15px] leading-relaxed">{textoLeitura.split("\n").map((l, i) => <p key={i} className="mb-3">{l}</p>)}</div>
        <div className="space-y-4">
          <GravadorVoz onPronto={setBlob} />
          <Botao disabled={!blob || pend} onClick={() => { const fd = new FormData(); fd.append("audio", new File([blob!], `voz.${blob!.type.includes("mp4") ? "m4a" : "webm"}`, { type: blob!.type })); rodar(() => enviarVoz(a.id, fd)); }}>
            {pend ? "Enviando…" : "Enviar gravação"}
          </Botao>
          <form action={(fd) => rodar(() => enviarVoz(a.id, fd))} className="flex items-end gap-2 border-t border-slate-100 pt-3">
            <div className="flex-1"><label className="rotulo">…ou envie um arquivo de áudio</label><input type="file" name="audio" accept="audio/*" className="campo" /></div>
            <Botao variante="secundario" disabled={pend}><Upload size={14} />Enviar</Botao>
          </form>
          {a.voz && <div className="text-sm"><audio src={a.voz} controls className="w-full" /><p className="mt-1 text-xs text-slate-500">{Math.round(a.vozDuracao ?? 0)}s · nível médio {a.vozRuidoDb?.toFixed(0) ?? "?"} dB</p></div>}
          <Botao variante={a.voz ? "primario" : "secundario"} disabled={!a.voz} onClick={() => ir(4)}>Próximo: motores e teste</Botao>
        </div>
      </div>
      <Mensagem />
    </Cartao>
  );
}

function Passo5({ avatar: a, rodar, pend, Mensagem, motores, demo, setMsg, ini }: Sub & { setMsg: (m: Msg) => void; ini: React.TransitionStartFunction }) {
  const r = useRouter();
  const [ab, setAb] = useState<{ rotulo: string; url: string; motor: string }[] | null>(null);
  const [revelar, setRevelar] = useState(false);
  const ok = (id: string) => motores.find((m) => m.id === id)?.ok;
  return (
    <div className="space-y-4">
      <Cartao titulo="Passo 5 — Onde treinar">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Voz</h3>
            {[["voicestudio", "VoiceStudio (econômico)"], ["elevenlabs", "ElevenLabs (premium)"]].map(([id, nome]) => (
              <div key={id} className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                <div>{nome} {a.modelos[id] ? <Selo cor="green">treinada{a.modelos[id].startsWith("demo-") ? " (simulada)" : ""}</Selo> : !ok(id) && <Selo cor="gray">{demo ? "simulado" : "desligado"}</Selo>}</div>
                <Botao variante="secundario" disabled={pend || (!ok(id) && !demo)} onClick={() => rodar(() => treinarVoz(a.id, id))}>{a.modelos[id] ? "Treinar de novo" : "Treinar"}</Botao>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Rosto</h3>
            <div className="mb-2 rounded-lg border border-slate-200 p-2 text-sm">Kling Avatar (Standard/Pro) — usa a foto principal, sem treino. {a.foto ? <Selo cor="green">pronto</Selo> : <Selo cor="amber">sem foto</Selo>}</div>
            <form action={(fd) => rodar(() => salvarModelos(a.id, fd))} className="rounded-lg border border-slate-200 p-2 text-sm">
              <label className="rotulo">ID do gêmeo digital no HeyGen</label>
              <div className="flex gap-2"><input name="heygen" className="campo font-mono" defaultValue={a.modelos.heygen ?? ""} placeholder="treine no painel do HeyGen com o vídeo do passo 3 e cole o ID" /><Botao variante="secundario">Salvar</Botao></div>
            </form>
          </div>
        </div>
        <Mensagem />
      </Cartao>

      <Cartao titulo="Comparar vozes (A/B)">
        <p className="mb-2 text-sm text-slate-600">Toca o mesmo texto em dois motores sem dizer qual é qual. Escolha pelo ouvido.</p>
        <Botao variante="secundario" disabled={pend} onClick={() => ini(async () => { const res = await compararVozes(a.id, "Oi! Sabia que dá pra fazer sua vistoria em poucos minutos? Acesse e confira."); setMsg(res.ok ? null : res); setAb(res.amostras ?? null); setRevelar(false); })}><Shuffle size={14} />Comparar vozes (A/B)</Botao>
        {ab && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ab.map((x) => <div key={x.rotulo} className="rounded-lg border border-slate-200 p-3"><div className="mb-1 font-semibold">Voz {x.rotulo} {revelar && <span className="text-xs font-normal text-slate-500">= {x.motor}</span>}</div><audio src={x.url} controls className="w-full" /></div>)}
            <Botao variante="fantasma" onClick={() => setRevelar(true)}>Revelar motores</Botao>
          </div>
        )}
      </Cartao>

      <Cartao titulo="Concluir">
        <div className="flex flex-wrap gap-2">
          <Botao disabled={pend} onClick={() => rodar(() => concluirAvatar(a.id))}><Check size={14} />Concluir avatar</Botao>
          <Botao variante="secundario" disabled={pend || a.status !== "pronto"} onClick={() => ini(async () => { const res = await testarAvatar(a.id); setMsg(res); if (res.videoId) r.push(`/videos/${res.videoId}`); })}><Play size={14} />Testar</Botao>
          <Botao variante="perigo" disabled={pend} onClick={() => confirm("Excluir o clone apaga rosto, voz e modelos em todos os provedores. Continuar?") && ini(async () => { const res = await excluirClone(a.id); alert(res.mensagem); r.push("/avatares"); })}><Trash2 size={14} />Excluir clone</Botao>
        </div>
        {a.status === "pronto" && <p className="mt-2 text-sm text-emerald-700">Avatar pronto — consentimento válido até {data(a.validade)}.</p>}
      </Cartao>
    </div>
  );
}
