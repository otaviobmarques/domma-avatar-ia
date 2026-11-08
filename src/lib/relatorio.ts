import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type Filtro = { de: Date; ate: Date; empresaId?: string; provedor?: string };

export function filtroDe(sp: { de?: string; ate?: string; empresa?: string; motor?: string }): Filtro {
  const hoje = new Date();
  return {
    de: sp.de ? new Date(`${sp.de}T00:00:00`) : new Date(hoje.getFullYear(), hoje.getMonth(), 1),
    ate: sp.ate ? new Date(`${sp.ate}T23:59:59`) : hoje,
    empresaId: sp.empresa || undefined, provedor: sp.motor || undefined,
  };
}

/** Gasto por mês, motor, cliente e formato; estimado × real por vídeo. */
export async function relatorio(f: Filtro) {
  const db = await getDb();
  const condJob = and(gte(schema.jobs.criadoEm, f.de), lte(schema.jobs.criadoEm, f.ate), eq(schema.jobs.status, "ok"), f.provedor ? eq(schema.jobs.provedor, f.provedor) : undefined, f.empresaId ? eq(schema.videos.empresaId, f.empresaId) : undefined);
  const porMotor = await db.select({ provedor: schema.jobs.provedor, modelo: schema.jobs.modelo, total: sql<number>`coalesce(sum(${schema.jobs.custo}),0)::float`, n: sql<number>`count(*)::int` })
    .from(schema.jobs).innerJoin(schema.videos, eq(schema.videos.id, schema.jobs.videoId)).where(condJob).groupBy(schema.jobs.provedor, schema.jobs.modelo);
  // chamadas fora de jobs (roteiro, revisão de rosto, prévias de voz)
  const avulsas = await db.select({ provedor: schema.integracaoChamadas.provedor, total: sql<number>`coalesce(sum(${schema.integracaoChamadas.custo}),0)::float` })
    .from(schema.integracaoChamadas).where(and(gte(schema.integracaoChamadas.criadoEm, f.de), lte(schema.integracaoChamadas.criadoEm, f.ate), sql`${schema.integracaoChamadas.etapa} = 'roteiro' or ${schema.integracaoChamadas.acao} in ('previa_voz','verificar_rosto','teste_ab')`, f.provedor ? eq(schema.integracaoChamadas.provedor, f.provedor) : undefined))
    .groupBy(schema.integracaoChamadas.provedor);
  const condV = and(eq(schema.videos.isModelo, false), gte(schema.videos.criadoEm, f.de), lte(schema.videos.criadoEm, f.ate), f.empresaId ? eq(schema.videos.empresaId, f.empresaId) : undefined);
  const videos = await db.select({ v: schema.videos, empresa: schema.empresas.nome }).from(schema.videos).leftJoin(schema.empresas, eq(schema.empresas.id, schema.videos.empresaId)).where(condV);
  const porMes = new Map<string, number>(), porCliente = new Map<string, number>(), porFormato = new Map<string, number>();
  let segundos = 0;
  const duracoes = await db.select({ videoId: schema.cenas.videoId, d: sql<number>`coalesce(sum(${schema.cenas.duracao}),0)::float` }).from(schema.cenas).groupBy(schema.cenas.videoId);
  const dur = new Map(duracoes.map((d) => [d.videoId, d.d]));
  for (const { v, empresa } of videos) {
    const mes = v.criadoEm.toISOString().slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + v.custoReal);
    porCliente.set(empresa ?? "Sem cliente", (porCliente.get(empresa ?? "Sem cliente") ?? 0) + v.custoReal);
    porFormato.set(v.formato, (porFormato.get(v.formato) ?? 0) + v.custoReal);
    segundos += dur.get(v.id) ?? 0;
  }
  const gerados = videos.filter(({ v }) => v.status !== "rascunho");
  const total = videos.reduce((s, { v }) => s + v.custoReal, 0);
  return {
    total, n: gerados.length, medioVideo: gerados.length ? total / gerados.length : 0, medioMinuto: segundos ? total / (segundos / 60) : 0,
    porMotor: [...porMotor, ...avulsas.map((a) => ({ provedor: a.provedor, modelo: "roteiro/revisão/testes", total: a.total, n: 0 }))].sort((a, b) => b.total - a.total),
    porMes: [...porMes.entries()].sort(), porCliente: [...porCliente.entries()].sort((a, b) => b[1] - a[1]), porFormato: [...porFormato.entries()],
    videos: videos.map(({ v, empresa }) => ({ id: v.id, titulo: v.titulo, empresa: empresa ?? "—", formato: v.formato, modo: v.modo, status: v.status, estimado: v.custoEstimado, real: v.custoReal, criadoEm: v.criadoEm, duracao: dur.get(v.id) ?? 0 })),
  };
}
