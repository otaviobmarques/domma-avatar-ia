"use server";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { TipoBiblioteca } from "@/db/schema";
import { exigir } from "@/lib/auth";
import { salvar } from "@/lib/storage";

export async function adicionarItem(fd: FormData) {
  const s = await exigir(["admin", "editor"]);
  const db = await getDb();
  const tipo = String(fd.get("tipo")) as TipoBiblioteca;
  const f = fd.get("arquivo") as File | null;
  let arquivo: string | null = null;
  if (f && f.size) arquivo = await salvar(`biblioteca/${tipo}/${Date.now()}${path.extname(f.name).toLowerCase()}`, Buffer.from(await f.arrayBuffer()), f.type);
  await db.insert(schema.biblioteca).values({
    tipo, nome: String(fd.get("nome") || f?.name || tipo), arquivo, texto: String(fd.get("texto") || "") || null,
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
