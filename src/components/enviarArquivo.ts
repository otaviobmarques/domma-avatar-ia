"use client";
import { pedirUpload } from "@/app/acoes/upload";

/** Envia o arquivo direto ao Storage (Supabase em produção) e devolve o caminho salvo. */
export async function enviarArquivo(arquivo: Blob & { name?: string }, pasta: string, nome?: string): Promise<string> {
  const { url, caminho } = await pedirUpload(pasta, nome ?? arquivo.name ?? "arquivo.bin");
  const r = await fetch(url, { method: "PUT", body: arquivo, headers: { "Content-Type": arquivo.type || "application/octet-stream", "x-upsert": "true" } });
  if (!r.ok) throw new Error(`Falha no upload (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return caminho;
}
