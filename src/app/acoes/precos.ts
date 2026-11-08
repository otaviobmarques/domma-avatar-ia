"use server";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { auditar } from "@/lib/auditoria";
import { atualizarCotacao as buscarCotacao, salvarConfig } from "@/lib/config";
import { estimarVideo } from "@/lib/pipeline";
import type { Etapa } from "@/db/schema";

const n = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

export async function salvarPreco(fd: FormData) {
  const s = await exigir(["admin"]);
  const db = await getDb();
  const id = String(fd.get("id") ?? "");
  const dados = {
    provedor: String(fd.get("provedor")), modelo: String(fd.get("modelo")), etapa: String(fd.get("etapa")) as Etapa, unidade: String(fd.get("unidade")),
    preco: n(fd.get("preco")), moeda: (String(fd.get("moeda")) === "BRL" ? "BRL" : "USD") as "USD" | "BRL",
    planoValor: n(fd.get("planoValor")), planoUnidades: n(fd.get("planoUnidades")), multiplicadorCredito: n(fd.get("multiplicadorCredito")) ?? 1,
    qualidade: n(fd.get("qualidade")) ?? 2, fonte: String(fd.get("fonte") ?? "") || null, confirmado: fd.get("confirmado") === "on", conferidoEm: new Date(),
  };
  if (id) {
    const [antes] = await db.select().from(schema.precos).where(eq(schema.precos.id, id));
    await db.update(schema.precos).set(dados).where(eq(schema.precos.id, id));
    if (antes && (antes.preco !== dados.preco || antes.planoValor !== dados.planoValor)) {
      await db.insert(schema.precosHistorico).values({ precoId: id, precoAnterior: antes.preco, precoNovo: dados.preco, moeda: dados.moeda, alteradoPor: s.id });
    }
  } else {
    const [novo] = await db.insert(schema.precos).values(dados).returning();
    await db.insert(schema.precosHistorico).values({ precoId: novo.id, precoAnterior: null, precoNovo: dados.preco, moeda: dados.moeda, alteradoPor: s.id });
  }
  await auditar(s, "preco_salvo", `${dados.provedor}/${dados.modelo}`, { preco: dados.preco });
  revalidatePath("/precos");
}

export async function excluirPreco(id: string) {
  const s = await exigir(["admin"]);
  const db = await getDb();
  await db.delete(schema.precos).where(eq(schema.precos.id, id));
  await auditar(s, "preco_excluido", id);
  revalidatePath("/precos");
}

export async function atualizarCotacao() {
  await exigir(["admin"]);
  const r = await buscarCotacao();
  revalidatePath("/precos");
  return r.ok ? { ok: true, mensagem: `Cotação do dia: R$ ${r.valor.toFixed(4)}` } : { ok: false, mensagem: `Não foi possível buscar (${r.erro}). Mantida R$ ${r.valor}` };
}

export async function salvarCambio(fd: FormData) {
  const s = await exigir(["admin"]);
  const cot = n(fd.get("cotacao")), col = n(fd.get("colchao"));
  await salvarConfig({ ...(cot ? { cotacaoUsd: cot, cotacaoFonte: "Manual", cotacaoAtualizadaEm: new Date().toISOString() } : {}), ...(col != null ? { colchao: col / 100 } : {}) });
  await auditar(s, "cambio_salvo", undefined, { cot, col });
  revalidatePath("/precos");
}

/** Aplica os novos preços a todos os orçamentos abertos. */
export async function recalcularEstimativas() {
  await exigir(["admin"]);
  const db = await getDb();
  const abertos = await db.select().from(schema.videos).where(inArray(schema.videos.status, ["rascunho", "previa_pronta", "em_aprovacao", "erro"]));
  let n = 0;
  for (const v of abertos) {
    const [a] = v.avatarId ? await db.select().from(schema.avatares).where(eq(schema.avatares.id, v.avatarId)) : [];
    if (!v.roteiro.length) continue;
    const est = await estimarVideo(v, a ?? null);
    await db.update(schema.videos).set({ estimativa: { ...est, plano: undefined } as never, ...(v.status === "rascunho" ? { custoEstimado: est.totalBrl } : {}) }).where(eq(schema.videos.id, v.id));
    n++;
  }
  revalidatePath("/precos");
  return { ok: true, mensagem: `${n} orçamento(s) recalculado(s)` };
}
