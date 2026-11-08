"use client";
import { useState, useTransition } from "react";
import { Plug, RefreshCw, KeyRound, ListChecks, Trash2, Power, Settings2, Server, Lock, Eye, EyeOff, ExternalLink } from "lucide-react";
import type { ProvedorInfo, CampoCredencial } from "@/lib/catalogo";
import { ETAPAS } from "@/lib/catalogo";
import { Botao, Selo } from "@/components/ui";
import { brl, dataHora, num } from "@/lib/formato";
import { conectar, testar, atualizarSaldo, salvarOpcoes, alternarLigado, remover, servidor } from "@/app/acoes/integracoes";

type Integ = {
  provedor: string; status: string; chaveFinal: string | null; endpoint: string | null; modelosHabilitados: string[]; saldo: number | null; saldoUnidade: string | null;
  saldoManual: boolean; ligado: boolean; padraoDe: string[]; fallback: string | null; limiteMensal: number | null; ultimaVerificacao: Date | null; ultimoUso: Date | null;
  ultimoErro: string | null; extra: Record<string, unknown>; temChave: boolean;
};
type Chamada = { id: string; criadoEm: string; acao: string; etapa: string | null; videoId: string | null; duracaoMs: number | null; custo: number | null; sucesso: boolean; erro: string | null; modelo: string | null };

const STATUS: Record<string, { nome: string; cor: string }> = {
  conectado: { nome: "Conectado", cor: "green" }, erro: { nome: "Erro", cor: "red" }, desligado: { nome: "Desligado", cor: "gray" },
  sem_saldo: { nome: "Sem saldo", cor: "amber" }, nao_configurado: { nome: "Não configurado", cor: "gray" },
};

export function CartaoIntegracao({ info, integ, gastoMes, chamadas, outros }: { info: ProvedorInfo; integ: Integ; gastoMes: number; chamadas: Chamada[]; outros: { id: string; nome: string }[] }) {
  const [painel, setPainel] = useState<"" | "conectar" | "opcoes" | "chamadas">(integ.status === "nao_configurado" ? "" : "");
  const [msg, setMsg] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [pend, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem: string }>) => iniciar(async () => setMsg(await f()));
  const st = STATUS[integ.status] ?? STATUS.desligado;
  const pctLimite = integ.limiteMensal ? (gastoMes / integ.limiteMensal) * 100 : null;
  const etapasProv = ETAPAS.filter((e) => info.etapas.includes(e.id));

  return (
    <div className="cartao flex flex-col">
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{info.nome}</h3>
            <Selo cor={st.cor}>{st.nome}</Selo>
          </div>
          <p className="mt-1 text-xs text-slate-500">{info.descricao}</p>
          <div className="mt-1 flex flex-wrap gap-1">{etapasProv.map((e) => <Selo key={e.id} cor={integ.padraoDe.includes(e.id) ? "violet" : "slate"}>{e.nome}{integ.padraoDe.includes(e.id) ? " · padrão" : ""}</Selo>)}</div>
        </div>
        {integ.status !== "nao_configurado" && (
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" className="peer sr-only" checked={integ.ligado} disabled={pend} onChange={(e) => rodar(() => alternarLigado(info.id, e.target.checked))} />
            <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
            <Power size={13} />
          </label>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs sm:grid-cols-3">
        <div><dt className="text-slate-500">Chave</dt><dd className="font-mono">{integ.temChave ? `••••${integ.chaveFinal ?? ""}` : "—"}</dd></div>
        {info.campos.some((c) => c.nome === "endpoint") && <div className="col-span-2 sm:col-span-1"><dt className="text-slate-500">Endpoint</dt><dd className="truncate" title={integ.endpoint ?? ""}>{integ.endpoint ?? "padrão"}</dd></div>}
        <div><dt className="text-slate-500">Saldo</dt><dd>{integ.saldo != null ? `${num(integ.saldo)} ${integ.saldoUnidade ?? ""}${integ.saldoManual ? " (manual)" : ""}` : "—"}</dd></div>
        <div><dt className="text-slate-500">Gasto no mês</dt><dd>{brl(gastoMes)}{integ.limiteMensal ? ` / ${brl(integ.limiteMensal, 0)}` : ""}</dd></div>
        <div><dt className="text-slate-500">Fallback</dt><dd>{outros.find((o) => o.id === integ.fallback)?.nome ?? "—"}</dd></div>
        <div><dt className="text-slate-500">Última verificação</dt><dd>{dataHora(integ.ultimaVerificacao)}</dd></div>
        <div><dt className="text-slate-500">Último uso</dt><dd>{dataHora(integ.ultimoUso)}</dd></div>
      </dl>
      {pctLimite != null && (
        <div className="px-4 pb-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pctLimite >= 100 ? "bg-red-500" : pctLimite >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pctLimite)}%` }} /></div>
          {pctLimite >= 80 && <p className="mt-1 text-xs text-amber-700">{pctLimite >= 100 ? "Limite mensal atingido — o orquestrador bloqueou este motor." : "Alerta: 80% do limite mensal."}</p>}
        </div>
      )}
      {integ.ultimoErro && integ.status === "erro" && <p className="mx-4 mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{integ.ultimoErro}</p>}
      {info.aviso && <p className="mx-4 mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{info.aviso}</p>}

      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-slate-100 p-3">
        <Botao variante={integ.temChave ? "secundario" : "primario"} onClick={() => setPainel(painel === "conectar" ? "" : "conectar")}>
          {integ.temChave ? <><KeyRound size={14} />Trocar chave</> : <><Plug size={14} />Conectar</>}
        </Botao>
        {integ.status !== "nao_configurado" && <>
          <Botao variante="secundario" disabled={pend} onClick={() => rodar(() => testar(info.id))}><RefreshCw size={14} className={pend ? "animate-spin" : ""} />Testar conexão</Botao>
          {info.temSaldoApi && <Botao variante="secundario" disabled={pend} onClick={() => rodar(() => atualizarSaldo(info.id))}>Atualizar saldo</Botao>}
          {info.temServidor && <>
            <Botao variante="secundario" disabled={pend} onClick={() => rodar(() => servidor(info.id, "ligar"))}><Server size={14} />Ligar servidor</Botao>
            <Botao variante="secundario" disabled={pend} onClick={() => rodar(() => servidor(info.id, "desligar"))}>Desligar servidor</Botao>
          </>}
          <Botao variante="fantasma" onClick={() => setPainel(painel === "opcoes" ? "" : "opcoes")}><Settings2 size={14} />Opções</Botao>
          <Botao variante="fantasma" onClick={() => setPainel(painel === "chamadas" ? "" : "chamadas")}><ListChecks size={14} />Ver chamadas</Botao>
          <Botao variante="perigo" disabled={pend} onClick={() => confirm(`Apagar a chave de ${info.nome}? O histórico é mantido.`) && rodar(() => remover(info.id))}><Trash2 size={14} />Remover</Botao>
        </>}
      </div>
      {msg && <p className={`mx-3 mb-3 rounded px-2 py-1 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.mensagem}</p>}

      {painel === "conectar" && (
        <form className="space-y-4 border-t border-slate-100 bg-slate-50 p-4" action={(fd) => rodar(async () => { const r = await conectar(info.id, fd); if (r.ok) setPainel(""); return r; })}>
          {info.campos.filter((c) => !c.avancado).map((c) => <Campo key={c.nome} c={c} temChave={integ.temChave} endpoint={integ.endpoint} />)}
          {info.campos.some((c) => c.avancado) && (
            <details className="rounded-lg border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">Opções avançadas (normalmente não precisa mexer)</summary>
              <div className="mt-3 space-y-4">{info.campos.filter((c) => c.avancado).map((c) => <Campo key={c.nome} c={c} temChave={integ.temChave} endpoint={integ.endpoint} />)}</div>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Botao disabled={pend}>{pend ? "Salvando e testando…" : "Salvar e testar"}</Botao>
            <Botao type="button" variante="fantasma" onClick={() => setPainel("")}>Cancelar</Botao>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Lock size={12} />A chave é criptografada e, depois de salva, só aparecem os 4 últimos dígitos.</p>
        </form>
      )}

      {painel === "opcoes" && (
        <form className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 text-sm" action={(fd) => rodar(() => salvarOpcoes(info.id, fd))}>
          <label className="flex items-center gap-2"><input type="checkbox" name="ligado" defaultChecked={integ.ligado} />Ligado (desligado = o orquestrador nunca escolhe este motor)</label>
          <div>
            <span className="rotulo">Modelos habilitados</span>
            <div className="flex flex-wrap gap-3">{info.modelos.map((m) => <label key={m.id} className="flex items-center gap-1.5"><input type="checkbox" name="modelos" value={m.id} defaultChecked={integ.modelosHabilitados.includes(m.id)} />{m.nome}</label>)}</div>
          </div>
          <div>
            <span className="rotulo">Motor padrão de</span>
            <div className="flex flex-wrap gap-3">{etapasProv.map((e) => <label key={e.id} className="flex items-center gap-1.5"><input type="checkbox" name="padraoDe" value={e.id} defaultChecked={integ.padraoDe.includes(e.id)} />{e.nome}</label>)}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo">Fallback (motor reserva)</label>
              <select name="fallback" className="campo" defaultValue={integ.fallback ?? ""}>
                <option value="">— nenhum —</option>
                {outros.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo">Limite mensal (R$)</label>
              <input name="limiteMensal" className="campo" inputMode="decimal" defaultValue={integ.limiteMensal ?? ""} placeholder="sem limite" />
              <p className="mt-0.5 text-[11px] text-slate-400">Alerta em 80%, bloqueio em 100%</p>
            </div>
            {!info.temSaldoApi && <>
              <div><label className="rotulo">Saldo (lançamento manual)</label><input name="saldoManual" className="campo" inputMode="decimal" placeholder={integ.saldo != null ? String(integ.saldo) : ""} /></div>
              <div><label className="rotulo">Unidade do saldo</label><input name="saldoUnidade" className="campo" defaultValue={integ.saldoUnidade ?? "créditos"} /></div>
            </>}
          </div>
          {Object.keys(integ.extra ?? {}).length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">Avançado (endpoints e caminhos da API)</summary>
              <textarea name="extra" rows={6} className="campo mt-2 font-mono text-xs" defaultValue={JSON.stringify(integ.extra, null, 2)} />
            </details>
          )}
          <Botao disabled={pend}>Salvar opções</Botao>
        </form>
      )}

      {painel === "chamadas" && (
        <div className="max-h-80 overflow-auto border-t border-slate-100">
          {chamadas.length === 0 ? <p className="p-4 text-xs text-slate-500">Nenhuma chamada ainda.</p> : (
            <table className="tabela text-xs">
              <thead><tr><th>Data</th><th>Ação</th><th>Vídeo</th><th>Duração</th><th>Custo</th><th>Resultado</th></tr></thead>
              <tbody>{chamadas.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{dataHora(c.criadoEm)}</td>
                  <td>{c.acao}{c.modelo ? <span className="text-slate-400"> · {c.modelo}</span> : null}</td>
                  <td>{c.videoId ? <a className="text-marca-600 hover:underline" href={`/videos/${c.videoId}`}>abrir</a> : "—"}</td>
                  <td>{c.duracaoMs != null ? `${(c.duracaoMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td>{c.custo != null ? brl(c.custo, 3) : "—"}</td>
                  <td>{c.sucesso ? <Selo cor="green">ok</Selo> : <span className="text-red-600" title={c.erro ?? ""}>erro</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ c, temChave, endpoint }: { c: CampoCredencial; temChave: boolean; endpoint: string | null }) {
  const [ver, setVer] = useState(false);
  const segredo = c.tipo === "segredo";
  const exigido = c.obrigatorio && (!segredo || !temChave);
  const exemplo = segredo ? (temChave ? "Deixe vazio para manter a chave atual" : c.exemplo ? `Cole a chave aqui (${c.exemplo})` : "Cole a chave aqui") : c.exemplo ?? "";
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={`campo-${c.nome}`} className="text-sm font-semibold text-slate-800">{c.rotulo}{exigido && <span className="text-marca-600"> *</span>}</label>
        {c.link && <a href={c.link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-marca-600 hover:underline">{c.link.texto}<ExternalLink size={12} /></a>}
      </div>
      <div className="relative">
        <input id={`campo-${c.nome}`} name={c.nome} type={segredo && !ver ? "password" : "text"} autoComplete="off" spellCheck={false}
          className={`campo ${segredo ? "pr-10 font-mono" : ""}`} defaultValue={c.nome === "endpoint" ? endpoint ?? "" : ""} placeholder={exemplo} required={exigido} />
        {segredo && (
          <button type="button" onClick={() => setVer(!ver)} title={ver ? "Ocultar" : "Mostrar"} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700">
            {ver ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {c.ajuda && <p className="mt-1 text-xs text-slate-500">{c.ajuda}</p>}
    </div>
  );
}
