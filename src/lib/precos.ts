import { getDb, schema } from "@/db";

export type PrecoInfo = {
  id: string;
  provedor: string;
  modelo: string;
  unidade: string;
  moeda: "USD" | "BRL";
  /** preço efetivo por unidade, na moeda original (null = a confirmar) */
  unitario: number | null;
  confirmado: boolean;
  multiplicador: number;
  qualidade: number;
};

export type Cambio = { cotacao: number; colchao: number };

export function precoEfetivo(p: { preco: number | null; planoValor: number | null; planoUnidades: number | null }) {
  if (p.planoValor != null && p.planoUnidades) return p.planoValor / p.planoUnidades;
  return p.preco;
}

export async function tabelaPrecos(): Promise<Map<string, PrecoInfo>> {
  const db = await getDb();
  const linhas = await db.select().from(schema.precos);
  const m = new Map<string, PrecoInfo>();
  for (const l of linhas) {
    m.set(`${l.provedor}/${l.modelo}`, {
      id: l.id, provedor: l.provedor, modelo: l.modelo, unidade: l.unidade, moeda: l.moeda,
      unitario: precoEfetivo(l), confirmado: l.confirmado, multiplicador: l.multiplicadorCredito, qualidade: l.qualidade,
    });
  }
  return m;
}

/** Custo = quantidade × preço unitário × cotação × (1 + colchão). Em BRL não aplica câmbio nem colchão. */
export function custoBrl(p: PrecoInfo | undefined, quantidade: number, c: Cambio): number | null {
  if (!p || p.unitario == null) return null;
  const base = quantidade * p.unitario;
  return p.moeda === "USD" ? base * c.cotacao * (1 + c.colchao) : base;
}

export const fatorCambio = (c: Cambio) => c.cotacao * (1 + c.colchao);
