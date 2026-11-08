import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Etapa, Formato, Modo } from "@/db/schema";

export type Configuracoes = {
  cotacaoUsd: number;
  cotacaoAtualizadaEm: string | null;
  cotacaoFonte: string;
  colchao: number; // 0.10 = 10% para IOF/spread
  modoDemo: boolean;
  marcaDagua: boolean;
  textoMarcaDagua: string;
  idioma: string;
  formatosExportacao: string[];
  modoPadrao: Modo;
  modeloClaude: string;
  preferenciasPorFormato: Partial<Record<Formato, Partial<Record<Etapa, string>>>>;
  revisaoAutomatica: boolean;
  limpezaPreviasDias: number;
  nomeSistema: string;
};

export const CONFIG_PADRAO: Configuracoes = {
  cotacaoUsd: 5.2,
  cotacaoAtualizadaEm: null,
  cotacaoFonte: "Referência out–nov/2026 (escopo)",
  colchao: 0.1,
  modoDemo: true,
  marcaDagua: true,
  textoMarcaDagua: "Conteúdo gerado por IA",
  idioma: "pt-BR",
  formatosExportacao: ["9:16", "16:9", "1:1"],
  modoPadrao: "equilibrado",
  modeloClaude: "claude-opus-5-5",
  preferenciasPorFormato: {},
  revisaoAutomatica: true,
  limpezaPreviasDias: 30,
  nomeSistema: "Domma AvatarIA",
};

export async function lerConfig(): Promise<Configuracoes> {
  const db = await getDb();
  const linhas = await db.select().from(schema.configuracoes);
  const c: Record<string, unknown> = { ...CONFIG_PADRAO };
  for (const l of linhas) c[l.chave] = l.valor;
  return c as Configuracoes;
}

export async function salvarConfig(parcial: Partial<Configuracoes>) {
  const db = await getDb();
  for (const [chave, valor] of Object.entries(parcial)) {
    if (valor === undefined) continue;
    await db.insert(schema.configuracoes).values({ chave, valor: valor as object })
      .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: valor as object, atualizadoEm: new Date() } });
  }
}

export async function configValor<K extends keyof Configuracoes>(k: K): Promise<Configuracoes[K]> {
  const db = await getDb();
  const [l] = await db.select().from(schema.configuracoes).where(eq(schema.configuracoes.chave, k));
  return (l?.valor as Configuracoes[K]) ?? CONFIG_PADRAO[k];
}

/** Busca a cotação comercial do dia (AwesomeAPI). Mantém a anterior se falhar. */
export async function atualizarCotacao(): Promise<{ ok: boolean; valor: number; erro?: string }> {
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { USDBRL?: { bid?: string; ask?: string } };
    const v = parseFloat(j.USDBRL?.ask ?? j.USDBRL?.bid ?? "");
    if (!Number.isFinite(v) || v <= 0) throw new Error("Resposta sem cotação");
    await salvarConfig({ cotacaoUsd: Math.round(v * 10000) / 10000, cotacaoAtualizadaEm: new Date().toISOString(), cotacaoFonte: "AwesomeAPI (USD-BRL comercial, venda)" });
    return { ok: true, valor: v };
  } catch (e) {
    return { ok: false, valor: await configValor("cotacaoUsd"), erro: (e as Error).message };
  }
}
