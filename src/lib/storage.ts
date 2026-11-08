import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { hmac } from "./crypto";

/**
 * Armazenamento de arquivos. Caminhos lógicos tipo "avatares/<id>/voz.webm".
 * - Sem SUPABASE_URL: disco local em ./.data/files
 * - Com SUPABASE_URL: Supabase Storage (bucket privado), URLs assinadas.
 */
const RAIZ = path.join(process.cwd(), ".data", "files");
export const usaSupabase = () => !!(env.supabaseUrl && env.supabaseKey);

function seguro(p: string) {
  const n = path.posix.normalize(p).replace(/^\/+/, "");
  if (n.startsWith("..")) throw new Error("Caminho inválido");
  return n;
}

async function sb(metodo: string, rota: string, corpo?: BodyInit, tipo?: string) {
  const r = await fetch(`${env.supabaseUrl}/storage/v1/${rota}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${env.supabaseKey}`, apikey: env.supabaseKey, ...(tipo ? { "Content-Type": tipo } : {}), "x-upsert": "true" },
    body: corpo,
  });
  if (!r.ok) throw new Error(`Supabase Storage ${r.status}: ${await r.text()}`);
  return r;
}

export async function salvar(caminho: string, dados: Buffer | Uint8Array, tipo = "application/octet-stream") {
  const p = seguro(caminho);
  if (usaSupabase()) {
    await sb("POST", `object/${env.supabaseBucket}/${p}`, new Blob([new Uint8Array(dados)]), tipo);
  } else {
    const f = path.join(RAIZ, p);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, dados);
  }
  return p;
}

export async function ler(caminho: string): Promise<Buffer> {
  const p = seguro(caminho);
  if (usaSupabase()) {
    const r = await sb("GET", `object/${env.supabaseBucket}/${p}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return fs.readFile(path.join(RAIZ, p));
}

export async function existe(caminho: string) {
  try { await ler(caminho); return true; } catch { return false; }
}

export async function apagarPrefixo(prefixo: string) {
  const p = seguro(prefixo);
  if (usaSupabase()) {
    const r = await sb("POST", `object/list/${env.supabaseBucket}`, JSON.stringify({ prefix: p, limit: 1000 }), "application/json");
    const itens = (await r.json()) as { name: string }[];
    if (itens.length) {
      await sb("DELETE", `object/${env.supabaseBucket}`, JSON.stringify({ prefixes: itens.map((i) => `${p}/${i.name}`) }), "application/json");
    }
    return;
  }
  await fs.rm(path.join(RAIZ, p), { recursive: true, force: true });
}

/** Caminho em disco (para FFmpeg). Em Supabase baixa para um temporário. */
export async function arquivoLocal(caminho: string, tmpDir: string): Promise<string> {
  const p = seguro(caminho);
  if (!usaSupabase()) return path.join(RAIZ, p);
  const destino = path.join(tmpDir, p.replace(/\//g, "_"));
  await fs.writeFile(destino, await ler(p));
  return destino;
}

/** URL assinada de leitura — usada pelo navegador e enviada aos provedores (Kling/HeyGen precisam baixar foto/áudio). */
export function urlAssinada(caminho: string, validadeSeg = 60 * 60 * 24) {
  const p = seguro(caminho);
  const exp = Math.floor(Date.now() / 1000) + validadeSeg;
  const sig = hmac(`${p}:${exp}`);
  return `${env.appUrl}/api/arquivos/${p}?exp=${exp}&sig=${sig}`;
}

export function urlRelativa(caminho: string | null | undefined, validadeSeg = 60 * 60 * 6) {
  if (!caminho) return null;
  return urlAssinada(caminho, validadeSeg).replace(env.appUrl, "");
}

export function verificarAssinatura(p: string, exp: string | null, sig: string | null) {
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return hmac(`${p}:${exp}`) === sig;
}

export function tipoPorExtensao(p: string) {
  const ext = path.extname(p).toLowerCase();
  return ({
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".srt": "text/plain", ".vtt": "text/vtt", ".json": "application/json",
  } as Record<string, string>)[ext] ?? "application/octet-stream";
}

/** URL de leitura do Supabase (assinada lá) — usada pelo /api/arquivos para redirecionar sem passar o arquivo pela função. */
export async function urlSupabase(caminho: string, validadeSeg = 60 * 60 * 6, download?: string | null) {
  const p = seguro(caminho);
  const r = await sb("POST", `object/sign/${env.supabaseBucket}/${p}`, JSON.stringify({ expiresIn: validadeSeg }), "application/json");
  const j = (await r.json()) as { signedURL?: string; signedUrl?: string };
  const rel = j.signedURL ?? j.signedUrl ?? "";
  const u = `${env.supabaseUrl}/storage/v1${rel.startsWith("/") ? rel : `/${rel}`}`;
  return download ? `${u}&download=${encodeURIComponent(download)}` : u;
}

/** Upload direto do navegador (não passa pelo servidor web — limite de corpo da Vercel). */
export async function urlUpload(caminho: string): Promise<{ url: string; caminho: string }> {
  const p = seguro(caminho);
  if (usaSupabase()) {
    const r = await sb("POST", `object/upload/sign/${env.supabaseBucket}/${p}`, JSON.stringify({}), "application/json");
    const j = (await r.json()) as { url: string };
    return { url: `${env.supabaseUrl}/storage/v1${j.url.startsWith("/") ? j.url : `/${j.url}`}`, caminho: p };
  }
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return { url: `/api/upload/${p}?exp=${exp}&sig=${hmac(`up:${p}:${exp}`)}`, caminho: p };
}

export function verificarUpload(p: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return hmac(`up:${p}:${exp}`) === sig;
}
