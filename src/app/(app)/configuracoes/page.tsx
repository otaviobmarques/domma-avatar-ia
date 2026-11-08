import { asc, desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { exigir } from "@/lib/auth";
import { lerConfig } from "@/lib/config";
import { PROVEDORES } from "@/lib/catalogo";
import { Cabecalho, Cartao, Selo } from "@/components/ui";
import { brl, dataHora } from "@/lib/formato";
import { FormAcao } from "./FormAcao";
import { convidarUsuario, atualizarUsuario, salvarEmpresa, salvarGerais, trocarSenha } from "@/app/acoes/configuracoes";

export default async function Configuracoes() {
  const s = await exigir(["admin"]);
  const db = await getDb();
  const cfg = await lerConfig();
  const usuarios = await db.select().from(schema.usuarios).orderBy(asc(schema.usuarios.nome));
  const empresas = await db.select().from(schema.empresas).orderBy(asc(schema.empresas.nome));
  const log = await db.select().from(schema.auditoria).orderBy(desc(schema.auditoria.criadoEm)).limit(40);
  const motores = (etapa: string) => PROVEDORES.flatMap((p) => p.modelos.filter((m) => m.etapa === etapa).map((m) => ({ v: `${p.id}/${m.id}`, n: `${p.nome.split(" (")[0]} · ${m.nome}` })));
  const claude = PROVEDORES.find((p) => p.id === "anthropic")!.modelos;
  return (
    <>
      <Cabecalho titulo="Configurações" sub="Regras gerais do Domma AvatarIA." />
      <div className="space-y-6">
        <Cartao titulo="Geral, rotulagem e orquestrador">
          <FormAcao acao={salvarGerais} rotulo="Salvar">
            <div className="grid gap-4 md:grid-cols-3">
              <div><label className="rotulo">Nome do sistema</label><input name="nomeSistema" className="campo" defaultValue={cfg.nomeSistema} /></div>
              <div><label className="rotulo">Idioma</label><select name="idioma" className="campo" defaultValue={cfg.idioma}><option value="pt-BR">Português (Brasil)</option></select></div>
              <div><label className="rotulo">Modo padrão</label><select name="modoPadrao" className="campo" defaultValue={cfg.modoPadrao}><option value="economico">Econômico</option><option value="equilibrado">Equilibrado</option><option value="premium">Premium</option></select></div>
              <div><label className="rotulo">Modelo do Claude (roteiro e revisão)</label><select name="modeloClaude" className="campo" defaultValue={cfg.modeloClaude}>{claude.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
              <div><label className="rotulo">Texto da marca d&apos;água</label><input name="textoMarcaDagua" className="campo" defaultValue={cfg.textoMarcaDagua} /></div>
              <div><label className="rotulo">Limpar prévias após (dias)</label><input name="limpezaPreviasDias" type="number" className="campo" defaultValue={cfg.limpezaPreviasDias} /></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="marcaDagua" defaultChecked={cfg.marcaDagua} />Marca d&apos;água e rótulo “conteúdo gerado por IA” (recomendado ligado)</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="revisaoAutomatica" defaultChecked={cfg.revisaoAutomatica} />Revisão automática dos frames pelo Claude</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="modoDemo" defaultChecked={cfg.modoDemo} />Modo demonstração (simula motores sem chave)</label>
            </div>
            <div className="mt-4 text-sm"><span className="rotulo">Formatos de exportação</span>
              <div className="flex gap-4">{["9:16", "16:9", "1:1"].map((f) => <label key={f} className="flex items-center gap-1.5"><input type="checkbox" name="formatos" value={f} defaultChecked={cfg.formatosExportacao.includes(f)} />{f}</label>)}</div></div>
            <div className="mt-4">
              <span className="rotulo">Preferências de motor por formato (sobrepõem o modo)</span>
              <table className="tabela text-xs">
                <thead><tr><th>Formato</th><th>Voz</th><th>Avatar</th><th>Cenas</th></tr></thead>
                <tbody>{(["propaganda", "depoimento", "apresentacao", "ugc"] as const).map((f) => (
                  <tr key={f}><td className="font-medium capitalize">{f}</td>
                    {(["voz", "avatar", "cenas"] as const).map((e) => (
                      <td key={e}><select name={`pref_${f}_${e}`} className="campo py-1 text-xs" defaultValue={cfg.preferenciasPorFormato[f]?.[e] ?? ""}><option value="">— regra do modo —</option>{motores(e).map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}</select></td>
                    ))}</tr>
                ))}</tbody>
              </table>
            </div>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Clientes / empresas">
          <div id="clientes" className="space-y-2">
            {empresas.map((e) => (
              <FormAcao key={e.id} acao={salvarEmpresa} rotulo="Salvar" inline>
                <input type="hidden" name="id" value={e.id} />
                <input name="nome" className="campo w-56" defaultValue={e.nome} />
                <div className="flex items-center gap-1 text-sm">Orçamento mensal R$ <input name="orcamento" className="campo w-28" inputMode="decimal" defaultValue={e.orcamentoMensal} /></div>
                <select name="plano" className="campo w-36" defaultValue={e.plano}><option value="interno">Interno</option><option value="franqueado">Franqueado</option><option value="agencia">Agência</option></select>
                <span className="text-xs text-slate-500">{brl(e.orcamentoMensal, 0)}/mês</span>
              </FormAcao>
            ))}
            <div className="border-t border-slate-100 pt-3">
              <FormAcao acao={salvarEmpresa} rotulo="+ Cliente" inline>
                <input name="nome" className="campo w-56" placeholder="ex.: Auto Visão, Royal Vistorias" required />
                <div className="flex items-center gap-1 text-sm">Orçamento R$ <input name="orcamento" className="campo w-28" inputMode="decimal" placeholder="0 = sem limite" /></div>
                <select name="plano" className="campo w-36"><option value="interno">Interno</option><option value="franqueado">Franqueado</option><option value="agencia">Agência</option></select>
              </FormAcao>
            </div>
          </div>
        </Cartao>

        <Cartao titulo="Usuários e permissões">
          <div className="space-y-2">
            {usuarios.map((u) => (
              <FormAcao key={u.id} acao={atualizarUsuario.bind(null, u.id)} rotulo="Salvar" inline>
                <div className="w-56 text-sm"><div className="font-medium">{u.nome}{u.id === s.id && " (você)"}</div><div className="text-xs text-slate-500">{u.email}</div></div>
                <select name="papel" className="campo w-36" defaultValue={u.papel}><option value="admin">Administrador</option><option value="editor">Editor</option><option value="cliente">Cliente</option></select>
                <select name="empresaId" className="campo w-44" defaultValue={u.empresaId ?? ""}><option value="">— todas —</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="ativo" defaultChecked={u.ativo} />ativo</label>
              </FormAcao>
            ))}
            <div className="border-t border-slate-100 pt-3">
              <FormAcao acao={convidarUsuario} rotulo="+ Usuário (convidar por e-mail)" inline>
                <input name="nome" className="campo w-44" placeholder="Nome" />
                <input name="email" type="email" required className="campo w-56" placeholder="email@empresa.com" />
                <select name="papel" className="campo w-36"><option value="editor">Editor</option><option value="admin">Administrador</option><option value="cliente">Cliente</option></select>
                <select name="empresaId" className="campo w-44"><option value="">— todas —</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
              </FormAcao>
            </div>
          </div>
        </Cartao>

        <Cartao titulo="Minha senha">
          <FormAcao acao={trocarSenha} rotulo="Trocar senha" inline><input name="nova" type="password" className="campo w-64" placeholder="nova senha (mín. 8)" /></FormAcao>
        </Cartao>

        <Cartao titulo="Registro de auditoria (quem gerou cada vídeo, quem mexeu em chaves)">
          <table className="tabela text-xs">
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th></tr></thead>
            <tbody>{log.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{dataHora(l.criadoEm)}</td><td>{l.usuarioEmail ?? "cliente (link)"}</td><td><Selo>{l.acao}</Selo></td><td className="font-mono">{l.alvo}</td></tr>)}</tbody>
          </table>
        </Cartao>
      </div>
    </>
  );
}
