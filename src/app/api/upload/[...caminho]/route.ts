import { NextRequest } from "next/server";
import { salvar, verificarUpload, tipoPorExtensao, usaSupabase } from "@/lib/storage";

/** Upload direto em modo local (sem Supabase). Em produção o navegador envia direto ao Supabase Storage. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ caminho: string[] }> }) {
  if (usaSupabase()) return new Response("Use o Supabase Storage", { status: 400 });
  const p = (await params).caminho.map(decodeURIComponent).join("/");
  if (!verificarUpload(p, req.nextUrl.searchParams.get("exp"), req.nextUrl.searchParams.get("sig"))) return new Response("Assinatura inválida", { status: 403 });
  await salvar(p, Buffer.from(await req.arrayBuffer()), tipoPorExtensao(p));
  return Response.json({ ok: true, caminho: p });
}
