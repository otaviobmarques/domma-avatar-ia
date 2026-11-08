import Link from "next/link";
import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { carregarContexto, disponibilidade } from "@/lib/orquestrador";
import { Kpi, Cartao, Selo, BotaoLink, Aviso, Vazio } from "@/components/ui";
import { brl, dataHora, STATUS_VIDEO, FORMATOS } from "@/lib/formato";
import { provedor } from "@/lib/catalogo";
import {
  Plus, UserPlus, BarChart3, Film, Wallet, Receipt, Clock, Sparkles, Plug, UserRound, Tags, FlaskConical,
  CheckCircle2, Circle, ArrowRight, AlertTriangle, Clapperboard,
} from "lucide-react";

function saudacao() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function Inicio({ searchParams }: { searchParams: Promise<{ negado?: string }> }) {
  const s = await exigir();
  const db = await getDb();
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const filtroEmp = s.papel === "cliente" && s.empresaId ? eq(schema.videos.empresaId, s.empresaId) : undefined;
  const base = and(eq(schema.videos.isModelo, false), filtroEmp);
  const [m] = await db.select({
    n: sql<number>`count(*) filter (where ${schema.videos.status} <> 'rascunho')::int`,
    gasto: sql<number>`coalesce(sum(${schema.videos.custoReal}),0)::float`,
  }).from(schema.videos).where(and(base, gte(schema.videos.criadoEm, inicioMes)));
  const [pend] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.videos).where(and(base, eq(schema.videos.status, "em_aprovacao")));
  const [orc] = await db.select({ t: sql<number>`coalesce(sum(${schema.empresas.orcamentoMensal}),0)::float` }).from(schema.empresas).where(s.papel === "cliente" && s.empresaId ? eq(schema.empresas.id, s.empresaId) : undefined);
  const ultimos = await db.select().from(schema.videos).where(base).orderBy(desc(schema.videos.atualizadoEm)).limit(8);
  const ctx = await carregarContexto();

  /* Alertas (seção 4.1) */
  const alertas: { texto: string; href: string }[] = [];
  if (s.papel === "admin") {
    for (const i of ctx.integracoes.values()) {
      const nome = provedor(i.provedor)?.nome ?? i.provedor;
      if (i.status === "erro") alertas.push({ texto: `Integração com erro: ${nome}`, href: "/integracoes" });
      if (i.status === "sem_saldo") alertas.push({ texto: `Saldo baixo ou zerado: ${nome}`, href: "/integracoes" });
      const g = ctx.gastoMesPorProvedor.get(i.provedor) ?? 0;
      if (i.limiteMensal && g >= i.limiteMensal * 0.8) alertas.push({ texto: `${nome}: ${Math.round((g / i.limiteMensal) * 100)}% do limite mensal`, href: "/integracoes" });
    }
    for (const e of await db.select().from(schema.empresas)) {
      if (!e.orcamentoMensal) continue;
      const [g] = await db.select({ t: sql<number>`coalesce(sum(${schema.videos.custoReal}),0)::float` }).from(schema.videos).where(and(eq(schema.videos.empresaId, e.id), gte(schema.videos.atualizadoEm, inicioMes)));
      if (g.t >= e.orcamentoMensal * 0.8) alertas.push({ texto: `Orçamento de ${e.nome} em ${Math.round((g.t / e.orcamentoMensal) * 100)}%`, href: "/configuracoes#clientes" });
    }
    const [erros] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.videos).where(inArray(schema.videos.status, ["erro"]));
    if (erros.n) alertas.push({ texto: `${erros.n} vídeo(s) com erro na geração`, href: "/projetos?status=erro" });
  }

  /* Primeiros passos (só para o Administrador, até concluir) */
  const [avProntos] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.avatares).where(eq(schema.avatares.status, "pronto"));
  const [precosAbertos] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.precos).where(isNull(schema.precos.preco));
  const motorVideo = ["kling", "heygen"].some((p) => disponibilidade(ctx, p).ok);
  const motorVoz = ["elevenlabs", "voicestudio"].some((p) => disponibilidade(ctx, p).ok);
  const [algumVideo] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.videos).where(and(eq(schema.videos.isModelo, false), ne(schema.videos.status, "rascunho")));
  const passos = [
    { feito: disponibilidade(ctx, "anthropic").ok, titulo: "Conectar o Claude", desc: "Escreve os roteiros e revisa a qualidade dos vídeos.", href: "/integracoes", icone: Sparkles },
    { feito: motorVoz && motorVideo, titulo: "Conectar voz e avatar", desc: "ElevenLabs ou VoiceStudio + Kling ou HeyGen.", href: "/integracoes", icone: Plug },
    { feito: precosAbertos.n === 0, titulo: "Completar a Tabela de Preços", desc: precosAbertos.n ? `${precosAbertos.n} preço(s) ainda “a confirmar”.` : "Todos os preços cadastrados.", href: "/precos", icone: Tags },
    { feito: avProntos.n > 0, titulo: "Criar o primeiro avatar", desc: "Consentimento, verificação ao vivo, rosto e voz.", href: "/avatares", icone: UserRound },
    { feito: algumVideo.n > 0, titulo: "Gerar o primeiro vídeo", desc: "Uma propaganda de 30 segundos é um ótimo começo.", href: "/videos/novo", icone: Clapperboard },
    { feito: !ctx.config.modoDemo, titulo: "Desligar o modo demonstração", desc: "Quando os motores estiverem ligados.", href: "/configuracoes", icone: FlaskConical },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  const mostrarPassos = s.papel === "admin" && feitos < passos.length;

  const pctOrc = orc.t ? (m.gasto / orc.t) * 100 : undefined;
  const primeiroNome = s.nome.split(" ")[0];
  return (
    <div className="space-y-6">
      {/* Boas-vindas */}
      <section className="surgir relative overflow-hidden rounded-3xl bg-tinta px-6 py-7 text-white shadow-suave md:px-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-marca-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-marca-700/40 blur-3xl" />
        <svg className="pointer-events-none absolute -right-6 bottom-0 h-40 w-[420px] opacity-[0.15]" viewBox="0 0 120 74" fill="none" aria-hidden>
          <path d="M8 50 C 20 30, 26 20, 34 20 C 44 20, 48 60, 60 60 C 72 60, 76 20, 86 20 C 94 20, 100 30, 112 50" stroke="#B3A7FF" strokeWidth="10" strokeLinecap="round" />
        </svg>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-sm font-medium text-marca-200">{saudacao()}, {primeiroNome} 👋</div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-[34px]">Seu estúdio de gêmeos digitais</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">Crie propagandas, depoimentos e apresentações com o avatar de uma pessoa real — e veja quanto cada vídeo custa antes de gerar.</p>
          </div>
          {s.papel !== "cliente" && (
            <div className="flex flex-wrap gap-2">
              <Link href="/videos/novo" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-tinta shadow-suave transition hover:bg-marca-50"><Plus size={16} />Novo vídeo</Link>
              <Link href="/avatares" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"><UserPlus size={16} />Novo avatar</Link>
              {s.papel === "admin" && <Link href="/custos" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"><BarChart3 size={16} />Ver custos</Link>}
            </div>
          )}
        </div>
      </section>

      {(await searchParams).negado && <Aviso tipo="erro">Você não tem permissão para acessar aquela tela.</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Vídeos no mês" valor={m.n} icone={Film} tom="marca" detalhe={m.n ? "gerados desde o dia 1º" : "nenhum ainda este mês"} />
        <Kpi rotulo="Gasto × orçamento" valor={brl(m.gasto)} icone={Wallet} tom="verde" barra={pctOrc}
          detalhe={orc.t ? `${Math.round(pctOrc ?? 0)}% de ${brl(orc.t, 0)}` : "sem orçamento definido"} />
        <Kpi rotulo="Custo médio por vídeo" valor={m.n ? brl(m.gasto / m.n) : "—"} icone={Receipt} tom="azul" detalhe="voz + avatar + cenas + roteiro" />
        <Kpi rotulo="Aprovações pendentes" valor={pend.n} icone={Clock} tom="ambar" detalhe={pend.n ? <Link href="/aprovacoes" className="font-semibold text-amber-700 hover:underline">ver aprovações →</Link> : "tudo em dia"} />
      </div>

      {alertas.length > 0 && (
        <Cartao titulo="Alertas" icone={AlertTriangle}>
          <ul className="divide-y divide-slate-100">
            {alertas.map((a) => (
              <li key={a.texto} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="flex items-center gap-2.5 text-sm"><span className="h-2 w-2 rounded-full bg-amber-500" />{a.texto}</span>
                <BotaoLink href={a.href} variante="secundario" className="px-3 py-1.5 text-xs">Resolver</BotaoLink>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <div className={mostrarPassos ? "grid gap-6 xl:grid-cols-[1fr_380px]" : ""}>
        <Cartao titulo="Últimos vídeos" icone={Film} acoes={ultimos.length > 0 && <Link href="/projetos" className="text-xs font-semibold text-marca-600 hover:underline">Ver todos</Link>}>
          {ultimos.length === 0 ? (
            <Vazio icone={Clapperboard} titulo="Nenhum vídeo ainda"
              acao={s.papel !== "cliente" && <BotaoLink href="/videos/novo"><Plus size={15} />Criar o primeiro vídeo</BotaoLink>}>
              Escolha o formato, gere o roteiro com IA, confira o custo e receba a prévia em poucos minutos.
            </Vazio>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {ultimos.map((v) => {
                const st = STATUS_VIDEO[v.status];
                return (
                  <li key={v.id}>
                    <Link href={v.status === "rascunho" ? `/videos/${v.id}/formato` : `/videos/${v.id}`} className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-marca-50/50">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600 ring-1 ring-marca-100"><Film size={18} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-tinta group-hover:text-marca-700">{v.titulo}</div>
                        <div className="truncate text-xs text-slate-500">{FORMATOS[v.formato]} · {v.duracaoAlvo}s · {v.proporcao}{v.projeto ? ` · ${v.projeto}` : ""} · {dataHora(v.atualizadoEm)}</div>
                      </div>
                      <div className="hidden text-right sm:block">
                        <div className="text-sm font-semibold tabular-nums text-tinta">{brl(v.custoReal)}</div>
                        {v.custoEstimado != null && <div className="text-[11px] text-slate-400">est. {brl(v.custoEstimado)}</div>}
                      </div>
                      <Selo cor={st.cor}>{st.nome}</Selo>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        {mostrarPassos && (
          <Cartao titulo="Primeiros passos" icone={Sparkles} acoes={<span className="text-xs font-semibold text-slate-500 tabular-nums">{feitos}/{passos.length}</span>}>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-marca-400 to-marca-600" style={{ width: `${(feitos / passos.length) * 100}%` }} />
            </div>
            <ol className="space-y-1">
              {passos.map((p) => (
                <li key={p.titulo}>
                  <Link href={p.href} className={`group flex items-start gap-3 rounded-xl p-2.5 transition ${p.feito ? "opacity-60" : "hover:bg-marca-50/60"}`}>
                    {p.feito ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" /> : <Circle size={20} className="mt-0.5 shrink-0 text-slate-300 group-hover:text-marca-400" />}
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${p.feito ? "text-slate-500 line-through decoration-slate-300" : "text-tinta"}`}>{p.titulo}</div>
                      <div className="text-xs text-slate-500">{p.desc}</div>
                    </div>
                    {!p.feito && <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-marca-500" />}
                  </Link>
                </li>
              ))}
            </ol>
          </Cartao>
        )}
      </div>
    </div>
  );
}
