import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cifrar, decifrar } from "./crypto";

export type Credenciais = { apiKey?: string; secretKey?: string; endpoint?: string; extra: Record<string, string> };

/** Única porta de leitura das chaves: decifra no servidor, nunca vai para o navegador. */
export async function credenciais(provedor: string): Promise<Credenciais> {
  const db = await getDb();
  const [i] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.provedor, provedor));
  if (!i) throw new Error(`Integração ${provedor} não existe`);
  const seg = i.chaveCifrada ? (JSON.parse(decifrar(i.chaveCifrada)) as Record<string, string>) : {};
  return { apiKey: seg.apiKey, secretKey: seg.secretKey, endpoint: i.endpoint ?? undefined, extra: (i.extra ?? {}) as Record<string, string> };
}

export async function salvarSegredos(provedor: string, segredos: Record<string, string>) {
  const db = await getDb();
  const limpos = Object.fromEntries(Object.entries(segredos).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()]));
  const final = (limpos.apiKey ?? Object.values(limpos)[0] ?? "").slice(-4);
  await db.update(schema.integracoes).set({ chaveCifrada: Object.keys(limpos).length ? cifrar(JSON.stringify(limpos)) : null, chaveFinal: final || null })
    .where(eq(schema.integracoes.provedor, provedor));
}

export async function registrarChamada(d: {
  provedor: string; modelo?: string | null; videoId?: string | null; etapa?: string | null; acao: string;
  inicio: number; quantidade?: number | null; custo?: number | null; sucesso: boolean; erro?: string | null;
}) {
  const db = await getDb();
  await db.insert(schema.integracaoChamadas).values({
    provedor: d.provedor, modelo: d.modelo ?? null, videoId: d.videoId ?? null, etapa: d.etapa ?? null, acao: d.acao,
    duracaoMs: Date.now() - d.inicio, quantidade: d.quantidade ?? null, custo: d.custo ?? null, sucesso: d.sucesso, erro: d.erro?.slice(0, 2000) ?? null,
  });
  await db.update(schema.integracoes).set(d.sucesso ? { ultimoUso: new Date() } : { ultimoUso: new Date(), ultimoErro: d.erro?.slice(0, 500) ?? null })
    .where(eq(schema.integracoes.provedor, d.provedor));
}

export class ErroProvedor extends Error {
  constructor(msg: string, public status?: number, public semSaldo = false, public retentavel = true) { super(msg); }
}

export async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 60_000) });
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 600);
    const semSaldo = r.status === 402 || /insufficient|quota|balance|credit|saldo/i.test(corpo);
    throw new ErroProvedor(`HTTP ${r.status}: ${corpo}`, r.status, semSaldo, r.status >= 500 || r.status === 429);
  }
  return r;
}

export async function baixar(url: string, headers?: Record<string, string>): Promise<Buffer> {
  const r = await http(url, { headers, timeoutMs: 5 * 60_000 });
  return Buffer.from(await r.arrayBuffer());
}
