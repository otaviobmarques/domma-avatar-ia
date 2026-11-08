import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import type { DB } from "./index";
import * as schema from "./schema";
import { PROVEDORES, PRECOS_INICIAIS } from "@/lib/catalogo";
import { env } from "@/lib/env";

const CENARIOS = [
  { nome: "Estúdio", c1: "0x0f172a", c2: "0x334155" },
  { nome: "Escritório", c1: "0x1e3a8a", c2: "0x93c5fd" },
  { nome: "Loja", c1: "0x7c2d12", c2: "0xfdba74" },
  { nome: "Carro", c1: "0x111827", c2: "0x6b7280" },
  { nome: "Pátio de vistoria", c1: "0x14532d", c2: "0xbef264" },
];

/** Dados iniciais idempotentes: admin, empresas, integrações, preços e cenários padrão. */
export async function seed(db: DB) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.usuarios);
  if (n === 0) {
    const [ml] = await db.insert(schema.empresas).values([
      { nome: "Master Laudo", orcamentoMensal: 1000 },
      { nome: "RedBox", orcamentoMensal: 2000 },
    ]).returning();
    await db.insert(schema.usuarios).values({
      nome: env.adminEmail.includes("@") ? "Administrador" : env.adminEmail.charAt(0).toUpperCase() + env.adminEmail.slice(1),
      email: env.adminEmail.toLowerCase(),
      senhaHash: await bcrypt.hash(env.adminPassword, 10),
      papel: "admin",
      empresaId: ml.id,
    });
  }

  for (const p of PROVEDORES) {
    await db.insert(schema.integracoes).values({
      provedor: p.id,
      modelosHabilitados: p.modelos.map((m) => m.id),
      padraoDe: [],
      extra: p.extraPadrao ?? {},
      endpoint: null,
    }).onConflictDoNothing();
  }

  for (const pr of PRECOS_INICIAIS) {
    await db.insert(schema.precos).values({
      provedor: pr.provedor, modelo: pr.modelo, etapa: pr.etapa, unidade: pr.unidade,
      preco: pr.preco, moeda: pr.moeda, qualidade: pr.qualidade, fonte: pr.fonte, confirmado: pr.confirmado,
      multiplicadorCredito: "multiplicadorCredito" in pr ? pr.multiplicadorCredito : 1,
      conferidoEm: pr.confirmado ? new Date("2026-11-08") : null,
    }).onConflictDoNothing();
  }

  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(schema.biblioteca);
  // Os cenários padrão são gerados com FFmpeg: sem FFmpeg (ex.: Vercel), o worker faz isso quando subir.
  const temFfmpeg = await import("@/lib/ffmpeg").then((f) => f.executar(process.env.FFMPEG_PATH ?? "ffmpeg", ["-version"], 10_000)).then(() => true, () => false);
  const { usaSupabase } = await import("@/lib/storage");
  const storageOk = usaSupabase() || !(process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT);
  if (c === 0 && temFfmpeg && storageOk) {
    const { gerarImagem } = await import("@/lib/ffmpeg");
    const { salvar } = await import("@/lib/storage");
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    for (const cen of CENARIOS) {
      let arquivo: string | null = null;
      try {
        const tmp = path.join(os.tmpdir(), `cen-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
        await gerarImagem(tmp, { w: 1080, h: 1920, cor1: cen.c1, cor2: cen.c2, titulo: cen.nome });
        arquivo = await salvar(`biblioteca/cenarios/${cen.nome.toLowerCase().replace(/\s+/g, "-")}.png`, await fs.readFile(tmp), "image/png");
        await fs.rm(tmp, { force: true });
      } catch (e) {
        console.warn("[seed] não foi possível gerar imagem do cenário", cen.nome, (e as Error).message);
      }
      await db.insert(schema.biblioteca).values({ tipo: "cenario", nome: cen.nome, arquivo, tags: ["padrão"], origem: "padrao" });
    }
    await db.insert(schema.biblioteca).values([
      { tipo: "chamada", nome: "Acesse masterlaudo.com.br", texto: "Acesse masterlaudo.com.br", tags: ["Master Laudo"], origem: "padrao" },
      { tipo: "chamada", nome: "Fale com a gente no WhatsApp", texto: "Fale com a gente no WhatsApp", tags: ["genérica"], origem: "padrao" },
    ]);
  }
}
