"use client";
import { useEffect, useRef, useState } from "react";
import { Circle, Square, Video, Mic } from "lucide-react";
import { Botao } from "./ui";

function tipoSuportado(opcoes: string[]) {
  return opcoes.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Grava vídeo da câmera (verificação ao vivo). */
export function GravadorCamera({ onPronto, maxSeg = 20 }: { onPronto: (b: Blob) => void; maxSeg?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSeg((s) => { if (s + 1 >= maxSeg) parar(); return s + 1; }), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravando]);

  async function abrir() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: true });
      setStream(s);
      if (ref.current) { ref.current.srcObject = s; ref.current.muted = true; await ref.current.play(); }
    } catch (e) { setErro(`Não foi possível abrir a câmera: ${(e as Error).message}`); }
  }
  function iniciar() {
    if (!stream) return;
    const partes: Blob[] = [];
    const r = new MediaRecorder(stream, { mimeType: tipoSuportado(["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]) || undefined });
    r.ondataavailable = (e) => e.data.size && partes.push(e.data);
    r.onstop = () => { const b = new Blob(partes, { type: r.mimeType }); setUrl(URL.createObjectURL(b)); onPronto(b); };
    r.start(500);
    rec.current = r;
    setSeg(0); setUrl(null); setGravando(true);
  }
  function parar() { rec.current?.state === "recording" && rec.current.stop(); setGravando(false); }

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-xl bg-slate-900">
        {url ? <video src={url} controls className="h-full w-full" /> : <video ref={ref} className="h-full w-full -scale-x-100 object-cover" playsInline />}
        {gravando && <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs text-white"><Circle size={10} fill="white" />{seg}s</span>}
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex gap-2">
        {!stream && <Botao type="button" variante="secundario" onClick={abrir}><Video size={14} />Abrir câmera</Botao>}
        {stream && !gravando && <Botao type="button" onClick={iniciar}><Circle size={14} />{url ? "Gravar de novo" : "Gravar frase de verificação"}</Botao>}
        {gravando && <Botao type="button" variante="perigo" onClick={parar}><Square size={14} />Parar</Botao>}
      </div>
    </div>
  );
}

/** Grava voz com medidor de ruído/nível em tempo real. */
export function GravadorVoz({ onPronto, alvoSeg = 120 }: { onPronto: (b: Blob) => void; alvoSeg?: number }) {
  const rec = useRef<MediaRecorder | null>(null);
  const raf = useRef<number>(0);
  const [nivel, setNivel] = useState(-90);
  const [ruido, setRuido] = useState<number | null>(null);
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const minimo = useRef<number[]>([]);

  useEffect(() => () => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  async function iniciar() {
    try {
      const s = stream.current ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      stream.current = s;
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      minimo.current = [];
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
        const db = 20 * Math.log10(rms || 1e-9);
        setNivel(db);
        minimo.current.push(db);
        if (minimo.current.length > 300) minimo.current.shift();
        // ruído de fundo ≈ percentil 10 do nível (momentos sem fala)
        const ord = [...minimo.current].sort((a, b) => a - b);
        setRuido(ord[Math.floor(ord.length * 0.1)]);
        raf.current = requestAnimationFrame(loop);
      };
      loop();
      const partes: Blob[] = [];
      const r = new MediaRecorder(s, { mimeType: tipoSuportado(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) || undefined });
      r.ondataavailable = (e) => e.data.size && partes.push(e.data);
      r.onstop = () => { const b = new Blob(partes, { type: r.mimeType }); setUrl(URL.createObjectURL(b)); onPronto(b); cancelAnimationFrame(raf.current); ctx.close(); };
      r.start(500);
      rec.current = r;
      setSeg(0); setUrl(null); setGravando(true);
    } catch (e) { setErro(`Não foi possível abrir o microfone: ${(e as Error).message}`); }
  }
  function parar() { rec.current?.state === "recording" && rec.current.stop(); setGravando(false); }

  const pct = Math.max(0, Math.min(100, ((nivel + 60) / 60) * 100));
  const ruidoOk = ruido == null || ruido < -50;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Nível do microfone</span><span>{gravando ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")} / ${Math.floor(alvoSeg / 60)}:00` : ""}</span></div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full transition-all ${pct > 90 ? "bg-red-500" : pct > 40 ? "bg-emerald-500" : "bg-slate-400"}`} style={{ width: `${pct}%` }} /></div>
        {gravando && <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-marca-500" style={{ width: `${Math.min(100, (seg / alvoSeg) * 100)}%` }} /></div>}
        {ruido != null && gravando && <p className={`mt-1 text-xs ${ruidoOk ? "text-emerald-700" : "text-amber-700"}`}>Ruído de fundo: {ruido.toFixed(0)} dB {ruidoOk ? "— ambiente silencioso ✓" : "— ambiente barulhento, procure um lugar mais silencioso"}</p>}
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex items-center gap-2">
        {!gravando ? <Botao type="button" onClick={iniciar}><Mic size={14} />{url ? "Gravar de novo" : "Gravar voz"}</Botao> : <Botao type="button" variante="perigo" onClick={parar}><Square size={14} />Parar</Botao>}
        {url && <audio src={url} controls className="h-9" />}
      </div>
    </div>
  );
}
