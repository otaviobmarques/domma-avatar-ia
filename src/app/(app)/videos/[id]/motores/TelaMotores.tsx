"use client";
import { useEffect, useState, useTransition } from "react";
import { Play, ArrowLeft, Scale } from "lucide-react";
import type { Estimativa, Modo, Etapa } from "@/db/schema";
import { Botao, BotaoLink, Cartao, Aviso, Selo } from "@/components/ui";
import { brl, num, MODOS } from "@/lib/formato";
import { nomeEtapa, UNIDADES } from "@/lib/catalogo";
import { calcularEstimativa, gerarPreviaAcao, aprovarExcedente } from "@/app/acoes/videos";

type Comp = { modo: Modo; total: number; aConfirmar: number }[];

export function TelaMotores(p: {
  id: string; admin: boolean; modoInicial: Modo; motoresIniciais: Partial<Record<Etapa, string>>; opcoes: Record<string, { motor: string; nome: string; preco: string }[]>;
  regras: Record<string, string>; orcamento: { orcamento: number; gasto: number; restante: number | null }; aprovadoExcedente: boolean;
}) {
  const [modo, setModo] = useState<Modo>(p.modoInicial);
  const [motores, setMotores] = useState(p.motoresIniciais);
  const [est, setEst] = useState<Estimativa | null>(null);
  const [comp, setComp] = useState<Comp>([]);
  const [lado, setLado] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; mensagem: string; bloqueio?: boolean } | null>(null);
  const [excedenteOk, setExcedenteOk] = useState(p.aprovadoExcedente);
  const [pend, ini] = useTransition();

  useEffect(() => { ini(async () => { const r = await calcularEstimativa(p.id, modo, motores); setEst(r.atual); setComp(r.comparacao); }); }, [modo, motores, p.id]);

  const trocar = (etapa: string, motor: string) => { setModo("manual"); setMotores({ ...motores, [etapa]: motor }); setTrocando(null); };
  const atual = comp.find((c) => c.modo === modo)?.total ?? 0;
  const excede = p.orcamento.restante != null && est != null && est.totalBrl > p.orcamento.restante;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["economico", "equilibrado", "premium", "manual"] as Modo[]).map((m) => (
          <button key={m} onClick={() => setModo(m)} className={`rounded-xl border px-4 py-2 text-left text-sm ${modo === m ? "border-marca-500 bg-marca-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
            <div className="font-semibold">{MODOS[m]}{m === "equilibrado" ? " (padrão)" : ""}</div>
            <div className="text-xs tabular-nums text-slate-500">{comp.find((c) => c.modo === m) ? brl(comp.find((c) => c.modo === m)!.total) : "…"}</div>
          </button>
        ))}
        <Botao variante="fantasma" onClick={() => setLado(!lado)}><Scale size={14} />Comparar modos</Botao>
      </div>
      {modo !== "manual" && <p className="text-sm text-slate-500">{p.regras[modo]}</p>}

      {lado && (
        <div className="grid gap-2 sm:grid-cols-4">
          {comp.map((c) => (
            <div key={c.modo} className="cartao p-3 text-sm">
              <div className="font-semibold">{MODOS[c.modo]}</div>
              <div className="text-xl font-bold tabular-nums">{brl(c.total)}</div>
              <div className="text-xs text-slate-500">{c.aConfirmar ? `+ ${c.aConfirmar} item(ns) a confirmar` : "todos os preços confirmados"}</div>
              {c.modo !== modo && <div className={`text-xs ${c.total > atual ? "text-red-600" : "text-emerald-700"}`}>{c.total >= atual ? "+" : "−"}{brl(Math.abs(c.total - atual))} vs atual</div>}
            </div>
          ))}
        </div>
      )}

      <Cartao titulo="Estimativa por etapa" acoes={pend && <span className="text-xs text-slate-400">calculando…</span>}>
        {!est ? <p className="text-sm text-slate-500">Calculando…</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Etapa</th><th>Motor</th><th>Quantidade</th><th>Custo</th><th></th></tr></thead>
                <tbody>
                  {est.linhas.map((l, i) => (
                    <tr key={i}>
                      <td className="font-medium">{nomeEtapa(l.etapa)}</td>
                      <td><div>{l.modelo}</div><div className="text-xs text-slate-500">{l.provedor}{l.observacao ? ` · ${l.observacao}` : ""}</div></td>
                      <td className="tabular-nums">{num(l.quantidade, l.quantidade < 10 ? 1 : 0)} <span className="text-xs text-slate-500">{UNIDADES[l.unidade] ?? l.unidade}</span></td>
                      <td className="tabular-nums">{l.custoBrl == null ? <Selo cor="amber">a confirmar</Selo> : brl(l.custoBrl)}</td>
                      <td>
                        {p.opcoes[l.etapa === "revisao" ? "roteiro" : l.etapa]?.length ? (
                          trocando === `${i}` ? (
                            <select autoFocus className="campo w-56 py-1 text-xs" defaultValue="" onChange={(e) => trocar(l.etapa === "revisao" ? "roteiro" : l.etapa, e.target.value)} onBlur={() => setTrocando(null)}>
                              <option value="" disabled>escolha…</option>
                              {p.opcoes[l.etapa === "revisao" ? "roteiro" : l.etapa].map((o) => <option key={o.motor} value={o.motor}>{o.nome} — {o.preco}</option>)}
                            </select>
                          ) : <button className="text-xs text-marca-600 hover:underline" onClick={() => setTrocando(`${i}`)}>Trocar motor</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3} className="px-3 py-3 text-right font-semibold">Total estimado</td>
                    <td colSpan={2} className="px-3 py-3 text-lg font-bold tabular-nums">{brl(est.totalBrl)}{est.aConfirmar > 0 && <span className="ml-1 text-xs font-normal text-amber-700">+ itens a confirmar</span>}</td></tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Cotação R$ {est.cotacao.toFixed(2)} + colchão {Math.round(est.colchao * 100)}% = R$ {(est.cotacao * (1 + est.colchao)).toFixed(2)} por dólar.</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {comp.filter((c) => c.modo !== modo && c.modo !== "manual").map((c) => (
                <span key={c.modo} className="text-slate-600">{MODOS[c.modo]}: {c.total >= atual ? "+" : "−"}{brl(Math.abs(c.total - atual))}</span>
              ))}
            </div>
          </>
        )}
      </Cartao>

      <Cartao titulo="Orçamento do cliente">
        {p.orcamento.restante == null ? <p className="text-sm text-slate-500">Cliente sem orçamento mensal definido.</p> : (
          <p className="text-sm">Orçamento {brl(p.orcamento.orcamento)} · gasto no mês {brl(p.orcamento.gasto)} · <strong>restante {brl(p.orcamento.restante)}</strong></p>
        )}
        {excede && !excedenteOk && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Aviso tipo="erro">O custo estimado ultrapassa o orçamento restante. Nenhuma geração começa sem aprovação do Administrador.</Aviso>
            {p.admin && <Botao variante="secundario" onClick={() => ini(async () => { const r = await aprovarExcedente(p.id); setMsg(r); setExcedenteOk(true); })}>Aprovar excedente</Botao>}
          </div>
        )}
      </Cartao>

      {est?.avisos.map((a) => <Aviso key={a} tipo="aviso">{a}</Aviso>)}
      {msg && <Aviso tipo={msg.ok ? "ok" : "erro"}>{msg.mensagem}</Aviso>}
      <div className="flex gap-2">
        <BotaoLink href={`/videos/${p.id}/avatar`} variante="secundario"><ArrowLeft size={14} />Voltar</BotaoLink>
        <Botao disabled={pend || !est || (excede && !excedenteOk)} onClick={() => ini(async () => { const r = await gerarPreviaAcao(p.id); if (r) setMsg(r); })}><Play size={14} />Gerar prévia (480p)</Botao>
      </div>
    </div>
  );
}
