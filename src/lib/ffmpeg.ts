import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
export const FONTE = process.env.FONT_PATH ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

export function executar(bin: string, args: string[], timeoutMs = 10 * 60_000, comStderr = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`${bin} excedeu o tempo limite`)); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-6000)));
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve(comStderr ? out + err : out);
      else reject(new Error(`${path.basename(bin)} falhou (${code}): ${err.split("\n").slice(-6).join(" ")}`));
    });
  });
}

export const ffmpeg = (args: string[]) => executar(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export async function duracao(arquivo: string): Promise<number> {
  const out = await executar(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", arquivo]);
  const d = parseFloat(out.trim());
  return Number.isFinite(d) ? d : 0;
}

export async function temAudio(arquivo: string): Promise<boolean> {
  const out = await executar(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", arquivo]);
  return out.trim().length > 0;
}

export async function tmp(prefixo = "domma-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefixo));
}

export type Proporcao = "9:16" | "16:9" | "1:1";
/** lado curto: 480 (prévia), 720, 1080 */
export function dimensoes(proporcao: Proporcao, ladoCurto: number) {
  const par = (n: number) => Math.round(n / 2) * 2;
  if (proporcao === "9:16") return { w: ladoCurto, h: par((ladoCurto * 16) / 9) };
  if (proporcao === "16:9") return { w: par((ladoCurto * 16) / 9), h: ladoCurto };
  return { w: ladoCurto, h: ladoCurto };
}

const enquadrar = (w: number, h: number) =>
  `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`;

async function escreverTexto(dir: string, nome: string, texto: string) {
  const f = path.join(dir, nome);
  await fs.writeFile(f, texto, "utf8");
  return f;
}

function quebrarLinhas(texto: string, max = 26) {
  const linhas: string[] = [];
  let atual = "";
  for (const p of texto.split(/\s+/)) {
    if ((atual + " " + p).trim().length > max) { if (atual) linhas.push(atual); atual = p; }
    else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas.join("\n");
}

/** Imagem simples (cenários padrão da biblioteca e placeholders). */
export async function gerarImagem(destino: string, opts: { w: number; h: number; cor1: string; cor2: string; titulo: string }) {
  const dir = await tmp();
  const tf = await escreverTexto(dir, "t.txt", opts.titulo);
  await ffmpeg([
    "-f", "lavfi", "-i", `gradients=s=${opts.w}x${opts.h}:c0=${opts.cor1}:c1=${opts.cor2}:x0=0:y0=0:x1=${opts.w}:y1=${opts.h}:d=1`,
    "-vf", `drawtext=fontfile=${FONTE}:textfile=${tf}:fontcolor=white@0.85:fontsize=${Math.round(opts.w / 16)}:x=(w-text_w)/2:y=h*0.08`,
    "-frames:v", "1", destino,
  ]);
  await fs.rm(dir, { recursive: true, force: true });
}

/** Voz simulada (libflite) — só para o modo demonstração. */
export async function vozSimulada(destino: string, texto: string) {
  const dir = await tmp();
  const tf = await escreverTexto(dir, "fala.txt", texto.replace(/[\[\]]/g, " "));
  await ffmpeg(["-f", "lavfi", "-i", `flite=textfile=${tf}:voice=slt`, "-af", "aresample=44100,apad=pad_dur=0.25", "-ac", "1", "-c:a", "aac", "-b:a", "128k", destino]);
  await fs.rm(dir, { recursive: true, force: true });
}

/** Avatar simulado: foto com movimento leve + onda sonora + selo SIMULAÇÃO. */
export async function avatarSimulado(destino: string, opts: { foto: string | null; audio: string; w: number; h: number; nome: string }) {
  const dir = await tmp();
  const d = await duracao(opts.audio);
  const tf = await escreverTexto(dir, "n.txt", `SIMULAÇÃO · ${opts.nome}`);
  const entradaFoto = opts.foto
    ? ["-loop", "1", "-i", opts.foto]
    : ["-f", "lavfi", "-i", `gradients=s=${opts.w}x${opts.h}:c0=0x1e1238:c1=0x7360fa:d=${d + 1}`];
  const frames = Math.ceil(d * 30) + 30;
  await ffmpeg([
    ...entradaFoto, "-i", opts.audio,
    "-filter_complex",
    `[0:v]${enquadrar(opts.w * 2, opts.h * 2)},zoompan=z='1.04+0.02*sin(on/45)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+4*sin(on/23)':d=${frames}:s=${opts.w}x${opts.h}:fps=30[bg];` +
    `[1:a]showwaves=s=${opts.w}x${Math.round(opts.h / 10)}:mode=cline:colors=white@0.7:rate=30,format=rgba[wv];` +
    `[bg][wv]overlay=0:H-h-${Math.round(opts.h / 7)}:shortest=1,drawtext=fontfile=${FONTE}:textfile=${tf}:fontcolor=white:fontsize=${Math.round(opts.w / 26)}:box=1:boxcolor=black@0.45:boxborderw=10:x=20:y=h*0.08[v]`,
    "-map", "[v]", "-map", "1:a", "-t", String(d), "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-shortest", destino,
  ]);
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Normaliza uma cena para o formato final (WxH, 30fps, AAC) e garante a duração.
 * - visual: vídeo ou imagem (imagem ganha movimento suave tipo Ken Burns)
 * - audio: narração (opcional); sem áudio → silêncio
 * - texto: cartão de texto animado (se não houver visual)
 */
export async function normalizarCena(destino: string, opts: {
  visual: string | null; visualEhImagem: boolean; audio: string | null; texto?: string; duracao: number; w: number; h: number; usarAudioDoVisual?: boolean;
}) {
  const dir = await tmp();
  const d = Math.max(0.8, opts.duracao);
  const args: string[] = [];
  let filtroV: string;
  if (opts.visual && opts.visualEhImagem) {
    args.push("-loop", "1", "-t", String(d), "-i", opts.visual);
    const fr = Math.ceil(d * 30);
    filtroV = `[0:v]${enquadrar(opts.w * 2, opts.h * 2)},zoompan=z='min(1.0+on*0.0009,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=${opts.w}x${opts.h}:fps=30`;
  } else if (opts.visual) {
    args.push("-stream_loop", "-1", "-t", String(d), "-i", opts.visual);
    filtroV = `[0:v]${enquadrar(opts.w, opts.h)}`;
  } else {
    args.push("-f", "lavfi", "-t", String(d), "-i", `gradients=s=${opts.w}x${opts.h}:c0=0x1e1238:c1=0x4c3ac9:speed=0.02:d=${d}`);
    filtroV = `[0:v]fps=30,format=yuv420p`;
  }
  if (opts.texto) {
    const tf = await escreverTexto(dir, "c.txt", quebrarLinhas(opts.texto, opts.w > opts.h ? 40 : 22));
    filtroV += `,drawtext=fontfile=${FONTE}:textfile=${tf}:fontcolor=white:fontsize=${Math.round(Math.min(opts.w, opts.h) / 15)}:line_spacing=12:x=(w-text_w)/2:y=(h-text_h)/2:alpha='min(1,t*2)'`;
  }
  filtroV += "[v]";

  let mapaA: string;
  if (opts.usarAudioDoVisual && opts.visual && !opts.visualEhImagem && (await temAudio(opts.visual))) {
    mapaA = "0:a";
  } else if (opts.audio) {
    args.push("-i", opts.audio);
    mapaA = "1:a";
  } else {
    args.push("-f", "lavfi", "-t", String(d), "-i", "anullsrc=r=44100:cl=stereo");
    mapaA = "1:a";
  }
  await ffmpeg([
    ...args,
    "-filter_complex", `${filtroV};[${mapaA}]aresample=44100,aformat=channel_layouts=stereo,apad[a]`,
    "-map", "[v]", "-map", "[a]", "-t", String(d),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", "30", "-c:a", "aac", "-b:a", "160k", destino,
  ]);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function concatenar(destino: string, clipes: string[]) {
  const dir = await tmp();
  const lista = path.join(dir, "lista.txt");
  await fs.writeFile(lista, clipes.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", destino]);
  await fs.rm(dir, { recursive: true, force: true });
}

export type Legenda = { inicio: number; fim: number; texto: string };

function tempoSrt(s: number) {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
}

export function gerarSrt(legendas: Legenda[]) {
  return legendas.map((l, i) => `${i + 1}\n${tempoSrt(l.inicio)} --> ${tempoSrt(l.fim)}\n${l.texto}\n`).join("\n");
}

/** Etapa final da montagem: legendas, marca d'água "gerado por IA", logotipo e trilha com ducking. */
export async function acabamento(destino: string, opts: {
  entrada: string; w: number; h: number; legendas?: Legenda[]; marcaDagua?: string | null; logo?: string | null; trilha?: string | null; crf?: number;
}) {
  const dir = await tmp();
  const args = ["-i", opts.entrada];
  let v = "[0:v]";
  const filtros: string[] = [];
  let idx = 1;
  if (opts.legendas?.length) {
    const srt = path.join(dir, "leg.srt");
    await fs.writeFile(srt, gerarSrt(opts.legendas), "utf8");
    const tam = Math.round(Math.min(opts.w, opts.h) / 22);
    filtros.push(`${v}subtitles=${srt}:force_style='FontName=DejaVu Sans,Bold=1,FontSize=${Math.round(tam * 0.55)},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=${Math.round(opts.h / 9 / (opts.h / 288))}'[vs]`);
    v = "[vs]";
  }
  if (opts.marcaDagua) {
    const tf = await escreverTexto(dir, "m.txt", opts.marcaDagua);
    filtros.push(`${v}drawtext=fontfile=${FONTE}:textfile=${tf}:fontcolor=white@0.75:fontsize=${Math.round(Math.min(opts.w, opts.h) / 34)}:box=1:boxcolor=black@0.35:boxborderw=8:x=w-text_w-18:y=18[vm]`);
    v = "[vm]";
  }
  if (opts.logo) {
    args.push("-i", opts.logo);
    const lw = Math.round(Math.min(opts.w, opts.h) / 5);
    filtros.push(`[${idx}:v]scale=${lw}:-1[lg];${v}[lg]overlay=18:18[vl]`);
    v = "[vl]";
    idx++;
  }
  let a = "[0:a]";
  if (opts.trilha) {
    args.push("-stream_loop", "-1", "-i", opts.trilha);
    filtros.push(`[${idx}:a]volume=0.22,aformat=channel_layouts=stereo[tr];[tr][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[0:a][duck]amix=inputs=2:duration=first:normalize=0[am]`);
    a = "[am]";
    idx++;
  }
  if (!filtros.length) filtros.push("[0:v]null[vn]"), (v = "[vn]");
  await ffmpeg([
    ...args, "-filter_complex", filtros.join(";"), "-map", v, "-map", a === "[0:a]" ? "0:a" : a,
    "-c:v", "libx264", "-preset", "medium", "-crf", String(opts.crf ?? 21), "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", destino,
  ]);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function redimensionar(destino: string, entrada: string, w: number, h: number) {
  await ffmpeg(["-i", entrada, "-vf", enquadrar(w, h), "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "copy", "-movflags", "+faststart", destino]);
}

/** Extrai N frames (JPEG) igualmente espaçados — usados na revisão do Claude. */
export async function extrairFrames(entrada: string, n: number, largura = 512): Promise<{ tempo: number; arquivo: string }[]> {
  const dir = await tmp("frames-");
  const d = await duracao(entrada);
  const res: { tempo: number; arquivo: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) * d) / n;
    const f = path.join(dir, `f${i}.jpg`);
    await ffmpeg(["-ss", t.toFixed(2), "-i", entrada, "-frames:v", "1", "-vf", `scale=${largura}:-2`, "-q:v", "4", f]);
    res.push({ tempo: t, arquivo: f });
  }
  return res;
}

/** Nível de ruído aproximado (dBFS médio) — medidor de ruído da gravação de voz. */
export async function nivelMedioDb(arquivo: string): Promise<number | null> {
  try {
    const out = await executar(FFMPEG, ["-hide_banner", "-i", arquivo, "-af", "volumedetect", "-f", "null", "-"], 120_000, true);
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(out);
    return m ? parseFloat(m[1]) : null;
  } catch { return null; }
}

export async function converterParaMp4(destino: string, entrada: string) {
  await ffmpeg(["-i", entrada, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", destino]);
}

export async function converterAudio(destino: string, entrada: string) {
  await ffmpeg(["-i", entrada, "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "160k", destino]).catch(() =>
    ffmpeg(["-i", entrada, "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "160k", destino.replace(/\.mp3$/, ".m4a")]));
}

export async function dimensoesMidia(arquivo: string): Promise<{ w: number; h: number } | null> {
  const out = await executar(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", arquivo]).catch(() => "");
  const m = /(\d+)x(\d+)/.exec(out);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** Brilho médio (0–255) amostrado ao longo do vídeo — checklist de luz. */
export async function brilhoMedio(arquivo: string): Promise<number | null> {
  const out = await executar(FFMPEG, ["-hide_banner", "-i", arquivo, "-vf", "fps=1/5,scale=160:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], 300_000, true).catch(() => "");
  const vals = [...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => parseFloat(m[1]));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
