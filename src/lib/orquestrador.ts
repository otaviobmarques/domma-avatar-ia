import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { BlocoRoteiro, Etapa, Estimativa, LinhaEstimativa, Modo, Formato } from "@/db/schema";
import { lerConfig, type Configuracoes } from "./config";
import { tabelaPrecos, custoBrl, type PrecoInfo, type Cambio } from "./precos";
import { SIMULADOR } from "./catalogo";

import { textoFalado, segundosFala } from "./fala";
export { textoFalado, contarPalavras, segundosFala } from "./fala";

/* ---------- Regras por modo (seção 5) ---------- */
type Candidatos = { voz: string[]; avatarClose: string[]; avatar: string[]; cenas: string[]; cenario: string[] };
const AV_STD = "kling/kling-avatar-std", AV_PRO = "kling/kling-avatar-pro", HEYGEN = "heygen/heygen-avatar";
const VS = "voicestudio/voicestudio-tts", EL = "elevenlabs/eleven_multilingual_v2", EL_FLASH = "elevenlabs/eleven_flash_v2_5";
const LOCAL = "local/imagem";

export const REGRAS: Record<Exclude<Modo, "manual">, Candidatos & { descricao: string }> = {
  economico: {
    descricao: "Motor mais barato que atende o mínimo de qualidade: VoiceStudio + Kling Standard + cenário reaproveitado.",
    voz: [VS, EL_FLASH, EL], avatarClose: [AV_STD, AV_PRO, HEYGEN], avatar: [AV_STD, AV_PRO, HEYGEN], cenas: [LOCAL], cenario: ["kling/kolors"],
  },
  equilibrado: {
    descricao: "Kling Pro nas cenas com rosto em close; Standard nas demais; voz VoiceStudio.",
    voz: [VS, EL, EL_FLASH], avatarClose: [AV_PRO, AV_STD, HEYGEN], avatar: [AV_STD, AV_PRO, HEYGEN], cenas: [LOCAL, "seedance/seedance-2-0-mini"], cenario: ["kling/kolors"],
  },
  premium: {
    descricao: "ElevenLabs + HeyGen; Veo/Seedance nas cenas especiais.",
    voz: [EL, VS, EL_FLASH], avatarClose: [HEYGEN, AV_PRO, AV_STD], avatar: [HEYGEN, AV_PRO, AV_STD],
    cenas: ["google_veo/veo-3.0-generate-001", "seedance/seedance-2-5", "seedance/seedance-2-0-mini", "kling/kling-v2-1", LOCAL], cenario: ["kling/kolors"],
  },
};

export type Integ = typeof schema.integracoes.$inferSelect;

export type Contexto = {
  config: Configuracoes;
  integracoes: Map<string, Integ>;
  gastoMesPorProvedor: Map<string, number>;
  precos: Map<string, PrecoInfo>;
  cambio: Cambio;
};

export async function carregarContexto(): Promise<Contexto> {
  const db = await getDb();
  const config = await lerConfig();
  const ints = await db.select().from(schema.integracoes);
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const gastos = await db.select({ p: schema.integracaoChamadas.provedor, total: sql<number>`coalesce(sum(${schema.integracaoChamadas.custo}),0)::float` })
    .from(schema.integracaoChamadas).where(gte(schema.integracaoChamadas.criadoEm, inicioMes)).groupBy(schema.integracaoChamadas.provedor);
  return {
    config,
    integracoes: new Map(ints.map((i) => [i.provedor, i])),
    gastoMesPorProvedor: new Map(gastos.map((g) => [g.p, Number(g.total)])),
    precos: await tabelaPrecos(),
    cambio: { cotacao: config.cotacaoUsd, colchao: config.colchao },
  };
}

/** Disponível = ligado, sem erro/sem saldo e abaixo de 100% do limite mensal. */
export function disponibilidade(ctx: Contexto, provedor: string): { ok: boolean; motivo?: string } {
  if (provedor === "local") return { ok: true };
  const i = ctx.integracoes.get(provedor);
  if (!i || !i.chaveCifrada && !i.endpoint) return { ok: false, motivo: "não configurado" };
  if (!i.ligado) return { ok: false, motivo: "desligado" };
  if (i.status === "erro") return { ok: false, motivo: "integração com erro" };
  if (i.status === "sem_saldo") return { ok: false, motivo: "sem saldo" };
  if (i.limiteMensal && (ctx.gastoMesPorProvedor.get(provedor) ?? 0) >= i.limiteMensal) return { ok: false, motivo: "limite mensal atingido" };
  return { ok: true };
}

export type AvatarLite = { id: string; nome: string; modelos: Record<string, string>; foto: string | null } | null;

function precisaTreino(motor: string, avatar: AvatarLite): string | null {
  const prov = motor.split("/")[0];
  if (prov === "heygen" && !avatar?.modelos?.heygen) return "avatar não treinado no HeyGen";
  if (prov === "elevenlabs" && !avatar?.modelos?.elevenlabs) return "voz não clonada no ElevenLabs";
  if (prov === "voicestudio" && !avatar?.modelos?.voicestudio) return "voz não clonada no VoiceStudio";
  if (prov === "kling" && motor.includes("avatar") && !avatar?.foto) return "avatar sem foto";
  return null;
}

export type Escolha = { motor: string; provedor: string; modelo: string; simulado: boolean; motivo: string };

/** Escolhe o motor de uma etapa: preferência manual/formato → regras do modo → fallback → simulador (modo demo). */
export function escolher(ctx: Contexto, candidatos: string[], avatar: AvatarLite, preferido?: string): Escolha | null {
  const lista = [...new Set([...(preferido ? [preferido] : []), ...candidatos])];
  const pulados: string[] = [];
  for (const m of lista) {
    const [provedor, modelo] = m.split("/");
    const d = disponibilidade(ctx, provedor);
    const t = precisaTreino(m, avatar);
    const habilitado = provedor === "local" || (ctx.integracoes.get(provedor)?.modelosHabilitados ?? []).includes(modelo);
    if (d.ok && !t && habilitado) {
      return { motor: m, provedor, modelo, simulado: false, motivo: pulados.length ? `fallback (${pulados.join("; ")})` : m === preferido ? "escolha manual" : "regra do modo" };
    }
    pulados.push(`${m.split("/")[1]}: ${t ?? (habilitado ? d.motivo : "modelo desabilitado")}`);
  }
  if (ctx.config.modoDemo && lista.length) {
    const [provedor, modelo] = lista[0].split("/");
    return { motor: lista[0], provedor, modelo, simulado: true, motivo: "modo demonstração — gerado pelo simulador local" };
  }
  return null;
}

export type PlanoVideo = {
  roteiro: Escolha | null;
  voz: Escolha | null;
  cenario: Escolha | null;
  revisao: Escolha | null;
  olhar: Escolha | null;
  porBloco: { blocoId: string; tipo: BlocoRoteiro["tipo"]; segundos: number; avatar?: Escolha | null; cena?: Escolha | null }[];
};

export type EntradaPlano = {
  modo: Modo;
  formato: Formato;
  blocos: BlocoRoteiro[];
  avatar: AvatarLite;
  motoresManuais: Partial<Record<Etapa, string>>;
  usarCenarioBiblioteca: boolean;
  enquadramento: string;
};

export function planejar(ctx: Contexto, e: EntradaPlano): PlanoVideo {
  const regra = REGRAS[e.modo === "manual" ? ctx.config.modoPadrao === "manual" ? "equilibrado" : ctx.config.modoPadrao : e.modo];
  const prefFormato = ctx.config.preferenciasPorFormato[e.formato] ?? {};
  const pref = (et: Etapa) => (e.modo === "manual" ? e.motoresManuais[et] : undefined) ?? prefFormato[et];
  const modeloClaude = `anthropic/${ctx.config.modeloClaude}`;
  const claude = escolher(ctx, [modeloClaude], null, pref("roteiro"));
  const porBloco = e.blocos.map((b) => {
    const segundos = segundosFala(b);
    if (b.tipo === "avatar") {
      const close = (b.enquadramento ?? e.enquadramento) === "rosto";
      return { blocoId: b.id, tipo: b.tipo, segundos, avatar: escolher(ctx, close ? regra.avatarClose : regra.avatar, e.avatar, pref("avatar")) };
    }
    if (b.tipo === "broll") {
      return { blocoId: b.id, tipo: b.tipo, segundos, cena: escolher(ctx, regra.cenas, e.avatar, pref("cenas")) };
    }
    return { blocoId: b.id, tipo: b.tipo, segundos };
  });
  const olharLigado = disponibilidade(ctx, "olhar_gpu").ok;
  return {
    roteiro: claude,
    revisao: ctx.config.revisaoAutomatica ? claude : null,
    voz: escolher(ctx, regra.voz, e.avatar, pref("voz")),
    cenario: e.usarCenarioBiblioteca ? null : escolher(ctx, regra.cenario, e.avatar, pref("cenario")),
    olhar: olharLigado ? escolher(ctx, ["olhar_gpu/olhar-padrao"], e.avatar) : null,
    porBloco,
  };
}

/* ---------- Estimativa (seção 6) ---------- */
export function estimar(ctx: Contexto, e: EntradaPlano, opts: { roteiroJaGerado?: boolean; custoRoteiroReal?: number } = {}): Estimativa & { plano: PlanoVideo } {
  const plano = planejar(ctx, e);
  const linhas: LinhaEstimativa[] = [];
  const avisos: string[] = [];
  const c = (motor: string, q: number) => custoBrl(ctx.precos.get(motor), q, ctx.cambio);
  const unidade = (motor: string) => ctx.precos.get(motor)?.unidade ?? "—";
  const sufixo = (x: Escolha) => (x.simulado ? " (simulado)" : "");

  // Roteiro (Claude)
  if (plano.roteiro) {
    const m = plano.roteiro.motor;
    if (opts.roteiroJaGerado) {
      linhas.push({ etapa: "roteiro", provedor: "anthropic", modelo: plano.roteiro.modelo, quantidade: 0, unidade: "mil_tokens", custoBrl: opts.custoRoteiroReal ?? 0, observacao: "já gerado — custo real" });
    } else {
      const ent = 1.2, sai = 2.0;
      const ce = c(`${m}:entrada`, ent), cs = c(`${m}:saida`, sai);
      linhas.push({ etapa: "roteiro", provedor: "anthropic", modelo: plano.roteiro.modelo, quantidade: ent + sai, unidade: "mil_tokens", custoBrl: ce == null || cs == null ? null : ce + cs, observacao: "~3 mil tokens" + sufixo(plano.roteiro) });
    }
  } else avisos.push("Nenhum motor de roteiro disponível (cadastre a Anthropic em Integrações).");

  // Voz
  const falados = e.blocos.filter((b) => textoFalado(b.texto).length);
  const chars = falados.reduce((s, b) => s + textoFalado(b.texto).length, 0);
  const segVoz = falados.reduce((s, b) => s + segundosFala(b), 0);
  if (plano.voz) {
    const u = unidade(plano.voz.motor);
    const q = u === "mil_caracteres" ? chars / 1000 : u === "minuto_gpu" ? (segVoz / 60) * 1.5 + 0.5 : segVoz;
    linhas.push({ etapa: "voz", provedor: plano.voz.provedor, modelo: plano.voz.modelo, quantidade: q, unidade: u, custoBrl: c(plano.voz.motor, q), observacao: `${Math.round(segVoz)}s de áudio · ${chars} caracteres${sufixo(plano.voz)}` });
  } else if (falados.length) avisos.push("Nenhum motor de voz disponível.");

  // Avatar (agrupado por motor) — só os segundos com rosto
  const porMotor = new Map<string, { seg: number; esc: Escolha }>();
  for (const b of plano.porBloco) {
    if (b.tipo !== "avatar") continue;
    if (!b.avatar) { avisos.push("Bloco com avatar sem motor disponível."); continue; }
    const cur = porMotor.get(b.avatar.motor) ?? { seg: 0, esc: b.avatar };
    cur.seg += b.segundos;
    porMotor.set(b.avatar.motor, cur);
  }
  for (const [m, { seg, esc }] of porMotor) {
    linhas.push({ etapa: "avatar", provedor: esc.provedor, modelo: esc.modelo, quantidade: seg, unidade: unidade(m), custoBrl: c(m, seg), observacao: `${Math.round(seg)}s com rosto${sufixo(esc)}` });
  }
  const segAvatar = [...porMotor.values()].reduce((s, x) => s + x.seg, 0);

  if (plano.olhar && segAvatar) {
    const q = (segAvatar / 60) * 3;
    linhas.push({ etapa: "olhar", provedor: "olhar_gpu", modelo: "olhar-padrao", quantidade: q, unidade: "minuto_gpu", custoBrl: c(plano.olhar.motor, q), observacao: "pós-produção" });
  }

  // Cenário
  if (e.usarCenarioBiblioteca) {
    linhas.push({ etapa: "cenario", provedor: "biblioteca", modelo: "reaproveitado", quantidade: 1, unidade: "imagem", custoBrl: 0, observacao: "biblioteca (sem custo)" });
  } else if (plano.cenario) {
    linhas.push({ etapa: "cenario", provedor: plano.cenario.provedor, modelo: plano.cenario.modelo, quantidade: 1, unidade: "imagem", custoBrl: c(plano.cenario.motor, 1), observacao: "gerar 1 vez, depois reaproveitar" + sufixo(plano.cenario) });
  }

  // Cenas (b-roll)
  const cenasMotor = new Map<string, { seg: number; esc: Escolha }>();
  for (const b of plano.porBloco) {
    if (b.tipo !== "broll" || !b.cena) continue;
    const cur = cenasMotor.get(b.cena.motor) ?? { seg: 0, esc: b.cena };
    cur.seg += b.segundos;
    cenasMotor.set(b.cena.motor, cur);
  }
  for (const [m, { seg, esc }] of cenasMotor) {
    const local = esc.provedor === "local";
    linhas.push({ etapa: "cenas", provedor: esc.provedor, modelo: local ? "imagem + movimento" : esc.modelo, quantidade: seg, unidade: local ? "segundo" : unidade(m), custoBrl: local ? 0 : c(m, seg), observacao: local ? "b-roll montado localmente (sem custo)" : `${Math.round(seg)}s${sufixo(esc)}` });
  }

  // Revisão (Claude com ~8 frames)
  if (plano.revisao) {
    const m = plano.revisao.motor;
    const ce = c(`${m}:entrada`, 8), cs = c(`${m}:saida`, 1.5);
    linhas.push({ etapa: "revisao", provedor: "anthropic", modelo: plano.revisao.modelo, quantidade: 9.5, unidade: "mil_tokens", custoBrl: ce == null || cs == null ? null : ce + cs, observacao: "8 frames da prévia" + sufixo(plano.revisao) });
  }

  linhas.push({ etapa: "montagem", provedor: "local", modelo: "FFmpeg", quantidade: 1, unidade: "geracao", custoBrl: 0, observacao: "cortes, legendas, trilha, marca d'água" });

  // Simulados não custam de verdade, mas a estimativa mostra o preço do motor real.
  const totalBrl = linhas.reduce((s, l) => s + (l.custoBrl ?? 0), 0);
  const aConfirmar = linhas.filter((l) => l.custoBrl == null).length;
  if (aConfirmar) avisos.push(`${aConfirmar} item(ns) "a confirmar": cadastre os preços na Tabela de Preços.`);
  const simulados = [plano.roteiro, plano.voz, plano.cenario, plano.revisao, ...plano.porBloco.flatMap((b) => [b.avatar, b.cena])].filter((x) => x?.simulado);
  if (simulados.length) avisos.push("Modo demonstração: motores sem chave serão simulados localmente (custo real R$ 0).");
  for (const b of plano.porBloco) {
    for (const x of [b.avatar, b.cena]) if (x && x.motivo.startsWith("fallback")) avisos.push(`${x.modelo}: ${x.motivo}`);
  }
  return {
    modo: e.modo, linhas, totalBrl, aConfirmar, cotacao: ctx.cambio.cotacao, colchao: ctx.cambio.colchao,
    avisos: [...new Set(avisos)], calculadaEm: new Date().toISOString(), plano,
  };
}

/** Saldo do orçamento mensal do cliente (seção 5.1: nada começa se ultrapassar). */
export async function saldoOrcamento(empresaId: string | null) {
  if (!empresaId) return { orcamento: 0, gasto: 0, reservado: 0, restante: Infinity };
  const db = await getDb();
  const [emp] = await db.select().from(schema.empresas).where(eq(schema.empresas.id, empresaId));
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [g] = await db.select({ t: sql<number>`coalesce(sum(${schema.videos.custoReal}),0)::float` }).from(schema.videos)
    .where(and(eq(schema.videos.empresaId, empresaId), gte(schema.videos.atualizadoEm, inicioMes)));
  const [r] = await db.select({ t: sql<number>`coalesce(sum(${schema.videos.custoEstimado} - ${schema.videos.custoReal}),0)::float` }).from(schema.videos)
    .where(and(eq(schema.videos.empresaId, empresaId), inArray(schema.videos.status, ["gerando", "renderizando"])));
  const orcamento = emp?.orcamentoMensal ?? 0;
  const gasto = Number(g?.t ?? 0), reservado = Math.max(0, Number(r?.t ?? 0));
  return { orcamento, gasto, reservado, restante: orcamento > 0 ? orcamento - gasto - reservado : Infinity };
}

export { SIMULADOR };
