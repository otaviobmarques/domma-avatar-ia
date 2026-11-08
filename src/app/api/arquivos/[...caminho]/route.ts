import { NextRequest } from "next/server";
import { ler, tipoPorExtensao, verificarAssinatura } from "@/lib/storage";

/** Serve arquivos com URL assinada (navegador e provedores externos). Suporta Range para o player de vídeo. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await params;
  const p = caminho.map(decodeURIComponent).join("/");
  const u = req.nextUrl;
  if (!verificarAssinatura(p, u.searchParams.get("exp"), u.searchParams.get("sig"))) return new Response("Link expirado ou inválido", { status: 403 });
  let buf: Buffer;
  try { buf = await ler(p); } catch { return new Response("Não encontrado", { status: 404 }); }
  const tipo = tipoPorExtensao(p);
  const download = u.searchParams.get("download");
  const base: Record<string, string> = { "Content-Type": tipo, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  if (download) base["Content-Disposition"] = `attachment; filename="${download.replace(/[^\w.\-]/g, "_")}"`;
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const ini = m?.[1] ? parseInt(m[1]) : 0;
    const fim = m?.[2] ? Math.min(parseInt(m[2]), buf.length - 1) : buf.length - 1;
    return new Response(new Uint8Array(buf.subarray(ini, fim + 1)), { status: 206, headers: { ...base, "Content-Range": `bytes ${ini}-${fim}/${buf.length}`, "Content-Length": String(fim - ini + 1) } });
  }
  return new Response(new Uint8Array(buf), { headers: { ...base, "Content-Length": String(buf.length) } });
}
