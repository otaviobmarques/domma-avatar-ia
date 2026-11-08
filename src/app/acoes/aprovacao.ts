"use server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { auditar } from "@/lib/auditoria";

async function porToken(token: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.aprovacoes).where(eq(schema.aprovacoes.token, token));
  if (!a) throw new Error("Link inválido");
  return { db, a };
}

/** Cliente aprova sem precisar de conta (link com token). */
export async function aprovarCliente(token: string, nome: string) {
  const { db, a } = await porToken(token);
  await db.update(schema.aprovacoes).set({ status: "aprovado", decididoEm: new Date(), decididoPor: nome || "Cliente" }).where(eq(schema.aprovacoes.id, a.id));
  await db.update(schema.videos).set({ status: "aprovado", atualizadoEm: new Date() }).where(eq(schema.videos.id, a.videoId));
  await auditar(null, "cliente_aprovou", a.videoId, { nome });
  return { ok: true, mensagem: "Vídeo aprovado. A equipe foi avisada." };
}

export async function pedirAjuste(token: string, nome: string, tempo: number, texto: string) {
  if (!texto.trim()) return { ok: false, mensagem: "Escreva o comentário" };
  const { db, a } = await porToken(token);
  const c = { tempo, texto: texto.trim().slice(0, 1000), autor: nome || "Cliente", em: new Date().toISOString() };
  await db.update(schema.aprovacoes).set({ status: "ajuste", comentarios: [...a.comentarios, c] }).where(eq(schema.aprovacoes.id, a.id));
  await db.update(schema.videos).set({ status: "previa_pronta", atualizadoEm: new Date() }).where(eq(schema.videos.id, a.videoId));
  await auditar(null, "cliente_pediu_ajuste", a.videoId, c);
  return { ok: true, mensagem: "Comentário enviado com o tempo do vídeo." };
}
