"use server";
import path from "node:path";
import { exigir } from "@/lib/auth";
import { urlUpload } from "@/lib/storage";

const PERMITIDOS = /^(avatares\/[0-9a-f-]{36}\/(bruto|fotos)|biblioteca\/[a-z]+)$/;

/** Gera um destino e uma URL de upload direto (navegador → Storage). */
export async function pedirUpload(pasta: string, nomeArquivo: string) {
  await exigir(["admin", "editor"]);
  if (!PERMITIDOS.test(pasta)) throw new Error("Pasta não permitida");
  const ext = (path.extname(nomeArquivo) || ".bin").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);
  return urlUpload(`${pasta}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
}
