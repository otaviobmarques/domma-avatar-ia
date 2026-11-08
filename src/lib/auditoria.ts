import { getDb, schema } from "@/db";
import type { Sessao } from "./auth";

export async function auditar(s: Pick<Sessao, "id" | "email"> | null, acao: string, alvo?: string, dados?: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(schema.auditoria).values({ usuarioId: s?.id ?? null, usuarioEmail: s?.email ?? null, acao, alvo, dados });
}
