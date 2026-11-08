import type { BlocoRoteiro } from "@/db/schema";

export const textoFalado = (t: string) => t.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
export const contarPalavras = (t: string) => (textoFalado(t).match(/\S+/g) ?? []).length;
/** ~155 palavras/min em PT-BR comercial + 0,4 s por pausa marcada */
export function segundosFala(b: Pick<BlocoRoteiro, "texto" | "marcacoes">) {
  const pausas = (b.marcacoes?.filter((m) => m === "pausa").length ?? 0) + (b.texto.match(/\[pausa\]/gi)?.length ?? 0);
  return Math.max(1, contarPalavras(b.texto) / 2.6 + pausas * 0.4);
}
