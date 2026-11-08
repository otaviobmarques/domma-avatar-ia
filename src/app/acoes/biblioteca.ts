"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { TipoBiblioteca } from "@/db/schema";
import { exigir } from "@/lib/auth";

export async function adicionarItem(fd: FormData) {
  const s = await exigir(["admin", "editor"]);
  const db = await getDb();
  const tipo = String(fd.get("tipo")) as TipoBiblioteca;
  // O arquivo já foi enviado direto ao Storage pelo navegador
  const arquivo = String(fd.get("caminho") || "") || null;
  if (arquivo && !arquivo.startsWith("biblioteca/")) throw new Error("Arquivo inválido");
  await db.insert(schema.biblioteca).values({
    tipo, nome: String(fd.get("nome") || fd.get("nomeArquivo") || tipo), arquivo, texto: String(fd.get("texto") || "") || null,
    empresaId: String(fd.get("empresaId") || "") || null, tags: String(fd.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean), origem: "upload",
  });
  void s;
  revalidatePath("/biblioteca");
}

export async function removerItem(id: string) {
  await exigir(["admin", "editor"]);
  const db = await getDb();
  await db.delete(schema.biblioteca).where(eq(schema.biblioteca.id, id));
  revalidatePath("/biblioteca");
}
