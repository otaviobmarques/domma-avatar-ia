"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { auditar } from "@/lib/auditoria";
import { provedor } from "@/lib/catalogo";
import { conector } from "@/lib/conectores";
import { credenciais, registrarChamada, salvarSegredos } from "@/lib/integracoes";
import type { Etapa } from "@/db/schema";

type R = { ok: boolean; mensagem: string };

export async function conectar(prov: string, fd: FormData): Promise<R> {
  const s = await exigir(["admin"]);
  const info = provedor(prov);
  if (!info) return { ok: false, mensagem: "Provedor desconhecido" };
  const db = await getDb();
  const segredos: Record<string, string> = {};
  let endpoint: string | null | undefined;
  for (const c of info.campos) {
    const v = String(fd.get(c.nome) ?? "").trim();
    if (c.nome === "endpoint") endpoint = v || null;
    else if (v) segredos[c.nome] = v;
  }
  const trocandoChave = Object.keys(segredos).length > 0;
  if (trocandoChave) {
    // Mantém segredos antigos não reenviados (ex.: trocar só a Access Key)
    const antigos = await credenciais(prov).catch(() => null);
    await salvarSegredos(prov, { apiKey: antigos?.apiKey ?? "", secretKey: antigos?.secretKey ?? "", ...segredos });
  }
  await db.update(schema.integracoes).set({ ...(endpoint !== undefined ? { endpoint } : {}), status: "desligado", ultimoErro: null }).where(eq(schema.integracoes.provedor, prov));
  await auditar(s, trocandoChave ? "integracao_chave_alterada" : "integracao_atualizada", prov);
  const t = await testar(prov);
  revalidatePath("/integracoes");
  return t.ok ? { ok: true, mensagem: `Salvo. ${t.mensagem}` } : { ok: false, mensagem: `Salvo, mas o teste falhou: ${t.mensagem}` };
}

export async function testar(prov: string): Promise<R> {
  await exigir(["admin"]);
  const db = await getDb();
  const inicio = Date.now();
  try {
    const r = await conector(prov).testar(await credenciais(prov));
    const [atual] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.provedor, prov));
    const semSaldo = r.saldo && r.saldo.valor <= 0;
    await db.update(schema.integracoes).set({
      status: semSaldo ? "sem_saldo" : atual.ligado ? "conectado" : "desligado", ultimaVerificacao: new Date(), ultimoErro: null,
      ...(r.saldo ? { saldo: r.saldo.valor, saldoUnidade: r.saldo.unidade, saldoManual: false } : {}),
    }).where(eq(schema.integracoes.provedor, prov));
    await registrarChamada({ provedor: prov, acao: "testar_conexao", inicio, sucesso: true, custo: 0 });
    revalidatePath("/integracoes");
    return { ok: true, mensagem: r.mensagem };
  } catch (e) {
    const msg = (e as Error).message;
    await db.update(schema.integracoes).set({ status: "erro", ultimaVerificacao: new Date(), ultimoErro: msg.slice(0, 500) }).where(eq(schema.integracoes.provedor, prov));
    await registrarChamada({ provedor: prov, acao: "testar_conexao", inicio, sucesso: false, erro: msg });
    revalidatePath("/integracoes");
    return { ok: false, mensagem: msg };
  }
}

export async function atualizarSaldo(prov: string): Promise<R> {
  await exigir(["admin"]);
  const c = conector(prov);
  if (!c.saldo) return { ok: false, mensagem: "Este provedor não informa saldo por API — lance manualmente." };
  try {
    const s = await c.saldo(await credenciais(prov));
    const db = await getDb();
    if (s) await db.update(schema.integracoes).set({ saldo: s.valor, saldoUnidade: s.unidade, saldoManual: false, ...(s.valor <= 0 ? { status: "sem_saldo" } : {}) }).where(eq(schema.integracoes.provedor, prov));
    revalidatePath("/integracoes");
    return { ok: true, mensagem: s ? `Saldo: ${s.valor.toLocaleString("pt-BR")} ${s.unidade}` : "Sem informação de saldo" };
  } catch (e) { return { ok: false, mensagem: (e as Error).message }; }
}

export async function salvarOpcoes(prov: string, fd: FormData): Promise<R> {
  const s = await exigir(["admin"]);
  const db = await getDb();
  const [atual] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.provedor, prov));
  const ligado = fd.get("ligado") === "on";
  const saldoManual = String(fd.get("saldoManual") ?? "").trim();
  let extra = atual.extra;
  const extraTxt = String(fd.get("extra") ?? "").trim();
  if (extraTxt) {
    try { extra = JSON.parse(extraTxt); } catch { return { ok: false, mensagem: "Avançado: JSON inválido" }; }
  }
  const padraoDe = fd.getAll("padraoDe").map(String) as Etapa[];
  // Um motor padrão por etapa: remove a etapa dos outros provedores
  if (padraoDe.length) {
    const todas = await db.select().from(schema.integracoes);
    for (const o of todas) {
      if (o.provedor === prov) continue;
      const restantes = o.padraoDe.filter((e) => !padraoDe.includes(e));
      if (restantes.length !== o.padraoDe.length) await db.update(schema.integracoes).set({ padraoDe: restantes }).where(eq(schema.integracoes.id, o.id));
    }
  }
  const temCredencial = !!(atual.chaveCifrada || atual.endpoint);
  await db.update(schema.integracoes).set({
    ligado: ligado && temCredencial,
    status: !temCredencial ? "nao_configurado" : !ligado ? "desligado" : atual.status === "erro" || atual.status === "sem_saldo" ? atual.status : "conectado",
    modelosHabilitados: fd.getAll("modelos").map(String),
    padraoDe,
    fallback: String(fd.get("fallback") ?? "") || null,
    limiteMensal: fd.get("limiteMensal") ? Number(String(fd.get("limiteMensal")).replace(",", ".")) : null,
    extra,
    ...(saldoManual ? { saldo: Number(saldoManual.replace(",", ".")), saldoManual: true, saldoUnidade: String(fd.get("saldoUnidade") || "créditos") } : {}),
  }).where(eq(schema.integracoes.provedor, prov));
  await auditar(s, "integracao_opcoes", prov, { ligado, padraoDe });
  revalidatePath("/integracoes");
  return { ok: true, mensagem: ligado && !temCredencial ? "Cadastre a chave antes de ligar." : "Opções salvas" };
}

export async function alternarLigado(prov: string, ligado: boolean): Promise<R> {
  const s = await exigir(["admin"]);
  const db = await getDb();
  const [atual] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.provedor, prov));
  if (ligado && !atual.chaveCifrada && !atual.endpoint) return { ok: false, mensagem: "Conecte (cadastre a chave) antes de ligar" };
  await db.update(schema.integracoes).set({ ligado, status: ligado ? (atual.status === "erro" || atual.status === "sem_saldo" ? atual.status : "conectado") : "desligado" }).where(eq(schema.integracoes.provedor, prov));
  await auditar(s, ligado ? "integracao_ligada" : "integracao_desligada", prov);
  revalidatePath("/integracoes");
  return { ok: true, mensagem: ligado ? "Ligado" : "Desligado" };
}

export async function remover(prov: string): Promise<R> {
  const s = await exigir(["admin"]);
  const db = await getDb();
  await db.update(schema.integracoes).set({ chaveCifrada: null, chaveFinal: null, endpoint: null, ligado: false, status: "nao_configurado", saldo: null, ultimoErro: null })
    .where(eq(schema.integracoes.provedor, prov));
  await auditar(s, "integracao_removida", prov);
  revalidatePath("/integracoes");
  return { ok: true, mensagem: "Chave removida" };
}

export async function servidor(prov: string, acao: "ligar" | "desligar" | "status"): Promise<R> {
  const s = await exigir(["admin"]);
  try {
    const c = conector(prov);
    if (!c.servidor) return { ok: false, mensagem: "Sem controle de servidor" };
    const r = await c.servidor(await credenciais(prov), acao);
    await auditar(s, `servidor_${acao}`, prov);
    return { ok: true, mensagem: r };
  } catch (e) { return { ok: false, mensagem: (e as Error).message }; }
}
