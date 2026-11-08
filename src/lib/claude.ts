import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import fs from "node:fs/promises";
import type { BlocoRoteiro, Briefing, Formato, ItemQualidade } from "@/db/schema";
import { credenciais, registrarChamada } from "./integracoes";
import { tabelaPrecos, custoBrl } from "./precos";
import { lerConfig } from "./config";

const MARCACOES = ["animado", "pausa", "olha_camera", "enfase", "pensar", "sorriso", "serio"] as const;

const BlocoZ = z.object({
  tipo: z.enum(["avatar", "broll", "texto"]).describe("avatar = pessoa falando para a câmera; broll = narração sobre imagem/cena; texto = cartão de texto animado"),
  texto: z.string().describe("Fala exata em PT-BR. Pode conter [pausa] inline."),
  marcacoes: z.array(z.enum(MARCACOES)),
  broll: z.string().describe("Para broll: descrição visual da cena (ex.: 'tela do sistema', 'carro no pátio'). Vazio nos outros tipos."),
  enquadramento: z.enum(["rosto", "meio_corpo"]),
});
const RoteiroZ = z.object({
  abordagem: z.string().describe("Nome curto da abordagem (ex.: 'Dor → solução')"),
  blocos: z.array(BlocoZ),
});
const VersoesZ = z.object({ versoes: z.array(RoteiroZ) });

const QualidadeZ = z.object({
  itens: z.array(z.object({
    cena: z.number().int().describe("Número da cena (1 = primeira)"),
    tempo: z.string().describe("mm:ss aproximado"),
    tipo: z.enum(["olhar", "boca", "cenario", "rosto", "texto", "outro"]),
    mensagem: z.string(),
    gravidade: z.enum(["info", "aviso", "erro"]),
  })),
  resumo: z.string(),
});

const SISTEMA_ROTEIRO = `Você é roteirista de vídeos curtos com avatar de IA (gêmeo digital de uma pessoa real) para empresas brasileiras.
Escreva em português do Brasil, tom natural de fala, frases curtas que soem bem em voz sintetizada.
Regras do produto:
- O avatar só aparece nos trechos em que a pessoa fala para a câmera; use "broll" para mostrar produto/tela/ambiente enquanto a narração continua — isso reduz custo.
- Abra com um gancho forte nos 3 primeiros segundos e termine com a chamada para ação do briefing.
- Marcações orientam voz e olhar: [pausa] gera piscada natural; "olha_camera" mantém contato visual; "pensar" desvia o olhar brevemente; "enfase" destaca uma palavra.
- Respeite a duração alvo: ~2,6 palavras por segundo de fala.
- Nunca faça promessas enganosas, conteúdo político-eleitoral ou que se passe por outra pessoa.`;

async function cliente() {
  const c = await credenciais("anthropic");
  if (!c.apiKey) throw new Error("Cadastre a chave da Anthropic em Integrações");
  return new Anthropic({ apiKey: c.apiKey });
}

async function custoUso(modelo: string, uso: { input_tokens: number; output_tokens: number }) {
  const cfg = await lerConfig();
  const p = await tabelaPrecos();
  const cambio = { cotacao: cfg.cotacaoUsd, colchao: cfg.colchao };
  const e = custoBrl(p.get(`anthropic/${modelo}:entrada`), uso.input_tokens / 1000, cambio);
  const s = custoBrl(p.get(`anthropic/${modelo}:saida`), uso.output_tokens / 1000, cambio);
  return e == null || s == null ? null : e + s;
}

let contador = 0;
const novoId = () => `b${Date.now().toString(36)}${(contador++).toString(36)}`;

export type PedidoRoteiro = {
  briefing: Briefing; formato: Formato; duracao: number; proporcao: string; empresa?: string; nomeAvatar?: string;
  versoes: number; ajuste?: string; roteiroAtual?: BlocoRoteiro[]; videoId?: string;
};

/** Gera 1 ou 3 versões de roteiro em blocos (cena a cena) com marcações. */
export async function gerarRoteiro(p: PedidoRoteiro): Promise<{ versoes: { abordagem: string; blocos: BlocoRoteiro[] }[]; custo: number | null }> {
  const cfg = await lerConfig();
  const modelo = cfg.modeloClaude;
  const inicio = Date.now();
  const pedido = [
    `Formato: ${p.formato}. Duração alvo: ${p.duracao}s. Proporção: ${p.proporcao}.`,
    p.empresa ? `Empresa/cliente: ${p.empresa}.` : "",
    p.nomeAvatar ? `Quem fala (avatar): ${p.nomeAvatar}.` : "",
    `Briefing:\n- Produto: ${p.briefing.produto}\n- Público: ${p.briefing.publico}\n- Oferta: ${p.briefing.oferta}\n- Chamada para ação: ${p.briefing.cta}${p.briefing.observacoes ? `\n- Observações: ${p.briefing.observacoes}` : ""}`,
    p.roteiroAtual?.length ? `Roteiro atual (para ajustar):\n${JSON.stringify(p.roteiroAtual.map(({ tipo, texto, marcacoes, broll }) => ({ tipo, texto, marcacoes, broll })))}` : "",
    p.ajuste ? `Ajuste pedido: ${p.ajuste}. Mantenha a estrutura que funciona e aplique só o ajuste.` : "",
    p.versoes > 1 ? `Escreva ${p.versoes} versões com abordagens claramente diferentes.` : "Escreva 1 versão.",
  ].filter(Boolean).join("\n\n");
  try {
    const cli = await cliente();
    const r = await cli.beta.messages.parse({
      model: modelo,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(VersoesZ) },
      // Recusas de segurança caem automaticamente para outro modelo (server-side fallback)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SISTEMA_ROTEIRO,
      messages: [{ role: "user", content: pedido }],
    });
    if (r.stop_reason === "refusal") throw new Error("O Claude recusou este briefing. Revise o conteúdo (uso proibido: político-eleitoral, golpes, enganoso).");
    if (!r.parsed_output) throw new Error("Resposta do Claude fora do formato esperado");
    const custo = await custoUso(modelo, r.usage);
    await registrarChamada({ provedor: "anthropic", modelo, videoId: p.videoId, etapa: "roteiro", acao: p.ajuste ? "ajustar_tom" : `roteiro_${p.versoes}v`, inicio, quantidade: (r.usage.input_tokens + r.usage.output_tokens) / 1000, custo, sucesso: true });
    return {
      versoes: r.parsed_output.versoes.slice(0, p.versoes).map((v) => ({
        abordagem: v.abordagem,
        blocos: v.blocos.map((b) => ({ id: novoId(), tipo: b.tipo, texto: b.texto, marcacoes: b.marcacoes, broll: b.broll || undefined, enquadramento: b.enquadramento })),
      })),
      custo,
    };
  } catch (e) {
    await registrarChamada({ provedor: "anthropic", modelo, videoId: p.videoId, etapa: "roteiro", acao: "roteiro", inicio, sucesso: false, erro: (e as Error).message });
    throw e;
  }
}

/** Roteiro de exemplo (modo demonstração sem chave da Anthropic). */
export function roteiroDemo(p: PedidoRoteiro): { versoes: { abordagem: string; blocos: BlocoRoteiro[] }[] } {
  const b = p.briefing;
  const base = (abordagem: string, gancho: string): { abordagem: string; blocos: BlocoRoteiro[] } => ({
    abordagem,
    blocos: [
      { id: novoId(), tipo: "avatar", texto: `${gancho} [pausa]`, marcacoes: ["animado", "olha_camera"], enquadramento: "rosto" },
      { id: novoId(), tipo: "broll", texto: `Com ${b.produto || "a nossa solução"}, você resolve isso sem complicação.`, marcacoes: ["enfase"], broll: "tela do sistema" },
      { id: novoId(), tipo: "avatar", texto: `${b.oferta || "Condição especial para começar hoje"}. [pausa] Feito para ${b.publico || "quem quer resultado"}.`, marcacoes: ["olha_camera"], enquadramento: "meio_corpo" },
      { id: novoId(), tipo: "texto", texto: b.cta || "Acesse e saiba mais", marcacoes: [] },
    ],
  });
  const vs = [
    base("Dor → solução", `Ainda perde tempo com ${b.produto ? "processos manuais" : "isso"}?`),
    base("Prova social", "Centenas de lojistas já mudaram o jeito de trabalhar."),
    base("Oferta direta", "Tenho uma novidade rápida pra você."),
  ];
  return { versoes: vs.slice(0, p.versoes) };
}

/** Revisão de qualidade (seção 2.1, passo 9): o Claude olha frames da prévia e aponta problemas. */
export async function revisarFrames(e: {
  videoId: string; frames: { tempo: number; arquivo: string; cena: number }[]; roteiro: BlocoRoteiro[]; olhar: string; formato: string;
}): Promise<{ itens: ItemQualidade[]; resumo: string; custo: number | null }> {
  const cfg = await lerConfig();
  const modelo = cfg.modeloClaude;
  const inicio = Date.now();
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of e.frames) {
    const mm = `${String(Math.floor(f.tempo / 60)).padStart(2, "0")}:${String(Math.floor(f.tempo % 60)).padStart(2, "0")}`;
    conteudo.push({ type: "text", text: `Frame em ${mm} (cena ${f.cena}):` });
    conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await fs.readFile(f.arquivo)).toString("base64") } });
  }
  conteudo.push({
    type: "text",
    text: `Roteiro (cenas em ordem): ${JSON.stringify(e.roteiro.map((b, i) => ({ cena: i + 1, tipo: b.tipo, texto: b.texto, marcacoes: b.marcacoes })))}
Formato: ${e.formato}. Comportamento de olhar esperado: ${e.olhar === "camera" ? "olhar na câmera com piscadas no ritmo da fala" : "alternado (convidado ao ouvir, câmera ao falar)"}.
Verifique em cada frame: olhos estranhos ou fora do esperado, boca deformada ou fora de sincronia aparente, rosto distorcido, cenário errado para a cena, texto ilegível ou cortado pela proporção.
Seja específico e só aponte problemas visíveis. Se estiver tudo certo, devolva lista vazia.`,
  });
  try {
    const cli = await cliente();
    const r = await cli.beta.messages.parse({
      model: modelo,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(QualidadeZ) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: "Você é o controle de qualidade de vídeos com avatar de IA. Responda em português do Brasil.",
      messages: [{ role: "user", content: conteudo }],
    });
    if (r.stop_reason === "refusal" || !r.parsed_output) throw new Error("Revisão indisponível para este vídeo");
    const custo = await custoUso(modelo, r.usage);
    await registrarChamada({ provedor: "anthropic", modelo, videoId: e.videoId, etapa: "revisao", acao: "revisar_frames", inicio, quantidade: (r.usage.input_tokens + r.usage.output_tokens) / 1000, custo, sucesso: true });
    return { itens: r.parsed_output.itens, resumo: r.parsed_output.resumo, custo };
  } catch (err) {
    await registrarChamada({ provedor: "anthropic", modelo, videoId: e.videoId, etapa: "revisao", acao: "revisar_frames", inicio, sucesso: false, erro: (err as Error).message });
    throw err;
  }
}

const ComparacaoZ = z.object({
  mesmaPessoa: z.boolean(),
  confianca: z.enum(["alta", "media", "baixa"]),
  observacao: z.string(),
});

/** Verificação ao vivo: compara o rosto da gravação na hora com as fotos enviadas. */
export async function compararRosto(e: { avatarId: string; verificacao: string[]; fotos: { dados: Buffer; tipo: string }[] }) {
  const cfg = await lerConfig();
  const modelo = cfg.modeloClaude;
  const inicio = Date.now();
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: "Frames da gravação de verificação ao vivo:" }];
  for (const f of e.verificacao) conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await fs.readFile(f)).toString("base64") } });
  conteudo.push({ type: "text", text: "Fotos enviadas para criar o avatar:" });
  for (const f of e.fotos) conteudo.push({ type: "image", source: { type: "base64", media_type: f.tipo as "image/jpeg", data: f.dados.toString("base64") } });
  conteudo.push({ type: "text", text: "Esta é uma checagem de consentimento: a pessoa que gravou a verificação ao vivo parece ser a mesma das fotos? Considere traços faciais estáveis (formato do rosto, olhos, nariz, boca), não roupa ou fundo. Também indique se a gravação parece uma tela filmada ou foto estática (tentativa de fraude)." });
  try {
    const cli = await cliente();
    const r = await cli.beta.messages.parse({
      model: modelo, max_tokens: 4000, thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(ComparacaoZ) },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      messages: [{ role: "user", content: conteudo }],
    });
    if (!r.parsed_output) throw new Error("Comparação indisponível");
    await registrarChamada({ provedor: "anthropic", modelo, etapa: "revisao", acao: "verificar_rosto", inicio, custo: await custoUso(modelo, r.usage), sucesso: true });
    return r.parsed_output;
  } catch (err) {
    await registrarChamada({ provedor: "anthropic", modelo, etapa: "revisao", acao: "verificar_rosto", inicio, sucesso: false, erro: (err as Error).message });
    throw err;
  }
}
