import { exigir } from "@/lib/auth";
import { carregarVideo } from "@/lib/pipeline";
import { carregarContexto, disponibilidade, saldoOrcamento, REGRAS } from "@/lib/orquestrador";
import { PROVEDORES } from "@/lib/catalogo";
import { Cabecalho } from "@/components/ui";
import { PassosVideo } from "../../PassosVideo";
import { TelaMotores } from "./TelaMotores";

export default async function Motores({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigir(["admin", "editor"]);
  const { id } = await params;
  const { video: v } = await carregarVideo(id);
  const ctx = await carregarContexto();
  const orc = await saldoOrcamento(v.empresaId);
  // Opções por etapa: só motores ligados (com o custo unitário de cada um)
  const opcoes: Record<string, { motor: string; nome: string; preco: string }[]> = {};
  for (const p of PROVEDORES) {
    const d = disponibilidade(ctx, p.id);
    if (!d.ok && !ctx.config.modoDemo) continue;
    for (const m of p.modelos) {
      if (!(ctx.integracoes.get(p.id)?.modelosHabilitados ?? []).includes(m.id) && d.ok) continue;
      const chave = m.etapa === "roteiro" ? `${p.id}/${m.id}:saida` : `${p.id}/${m.id}`;
      const pr = ctx.precos.get(chave);
      (opcoes[m.etapa] ??= []).push({ motor: `${p.id}/${m.id}`, nome: `${m.nome}${d.ok ? "" : " (simulado)"}`, preco: pr?.unitario != null ? `${pr.moeda === "USD" ? "US$" : "R$"} ${pr.unitario}/${pr.unidade}` : "a confirmar" });
    }
  }
  opcoes.cenas = [{ motor: "local/imagem", nome: "Imagem + movimento (local)", preco: "R$ 0" }, ...(opcoes.cenas ?? [])];
  return (
    <>
      <Cabecalho titulo="Novo vídeo — Motores e custo" sub="Escolha os motores e veja o custo antes de gerar." />
      <PassosVideo id={id} atual={3} />
      <TelaMotores id={id} admin={s.papel === "admin"} modoInicial={v.modo} motoresIniciais={v.motores} opcoes={opcoes}
        regras={Object.fromEntries(Object.entries(REGRAS).map(([k, r]) => [k, r.descricao]))}
        orcamento={{ orcamento: orc.orcamento, gasto: orc.gasto, restante: Number.isFinite(orc.restante) ? orc.restante : null }} aprovadoExcedente={v.aprovadoExcedente} />
    </>
  );
}
