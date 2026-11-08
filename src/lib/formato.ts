export const brl = (n: number | null | undefined, casas = 2) =>
  n == null ? "a confirmar" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
export const usd = (n: number | null | undefined, casas = 3) =>
  n == null ? "—" : `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4 })}`;
export const num = (n: number | null | undefined, casas = 0) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }));
export const data = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
export const dataHora = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const STATUS_VIDEO: Record<string, { nome: string; cor: string }> = {
  rascunho: { nome: "Rascunho", cor: "slate" },
  gerando: { nome: "Gerando", cor: "blue" },
  previa_pronta: { nome: "Prévia pronta", cor: "violet" },
  em_aprovacao: { nome: "Em aprovação", cor: "amber" },
  aprovado: { nome: "Aprovado", cor: "green" },
  renderizando: { nome: "Renderizando", cor: "blue" },
  finalizado: { nome: "Finalizado", cor: "green" },
  erro: { nome: "Erro", cor: "red" },
};
export const FORMATOS: Record<string, string> = {
  propaganda: "Propaganda", depoimento: "Depoimento", apresentacao: "Apresentação", ugc: "UGC", podcast: "Podcast",
};
export const MODOS: Record<string, string> = { economico: "Econômico", equilibrado: "Equilibrado", premium: "Premium", manual: "Manual" };
