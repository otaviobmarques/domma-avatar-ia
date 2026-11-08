import type { Etapa } from "@/db/schema";

export type CampoCredencial = { nome: string; rotulo: string; tipo: "segredo" | "texto" | "url"; obrigatorio?: boolean; ajuda?: string };

export type ProvedorInfo = {
  id: string;
  nome: string;
  descricao: string;
  etapas: Etapa[];
  credencial: string;
  campos: CampoCredencial[];
  modelos: { id: string; nome: string; etapa: Etapa }[];
  temSaldoApi: boolean;
  temServidor?: boolean;
  docs?: string;
  aviso?: string;
  /** configurações avançadas editáveis (endpoints e caminhos) */
  extraPadrao?: Record<string, string>;
};

/**
 * Catálogo dos provedores suportados (seção 3.3 do escopo).
 * Para adicionar um motor: cadastre aqui + crie o conector em src/lib/conectores.
 */
export const PROVEDORES: ProvedorInfo[] = [
  {
    id: "anthropic",
    nome: "Anthropic (Claude)",
    descricao: "Cérebro: roteiro, diálogos, escolha de motores e revisão de qualidade dos frames.",
    etapas: ["roteiro", "revisao"],
    credencial: "Chave de API",
    campos: [{ nome: "apiKey", rotulo: "Chave de API", tipo: "segredo", obrigatorio: true, ajuda: "console.anthropic.com → API Keys" }],
    modelos: [
      { id: "claude-opus-5-5", nome: "Claude Opus 5.5", etapa: "roteiro" },
      { id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5", etapa: "roteiro" },
      { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5", etapa: "roteiro" },
    ],
    temSaldoApi: false,
    docs: "https://docs.claude.com",
  },
  {
    id: "voicestudio",
    nome: "VoiceStudio (servidor próprio)",
    descricao: "Clone de voz e TTS open-source (AGPL-3) rodando em GPU alugada por hora.",
    etapas: ["voz"],
    credencial: "URL do servidor + token interno",
    campos: [
      { nome: "endpoint", rotulo: "URL do servidor", tipo: "url", obrigatorio: true, ajuda: "Ex.: https://gpu-voz.seudominio.com" },
      { nome: "apiKey", rotulo: "Token interno", tipo: "segredo", obrigatorio: true },
    ],
    modelos: [{ id: "voicestudio-tts", nome: "VoiceStudio TTS", etapa: "voz" }],
    temSaldoApi: false,
    temServidor: true,
    aviso: "Rodar sem modificações e isolado como serviço separado (AGPL-3). Validar com advogado antes da fase SaaS.",
    extraPadrao: {
      ttsPath: "/tts",
      clonePath: "/clone",
      healthPath: "/health",
      ligarUrl: "",
      desligarUrl: "",
      statusServidorUrl: "",
    },
  },
  {
    id: "elevenlabs",
    nome: "ElevenLabs",
    descricao: "Voz premium com clone instantâneo e marcações de tempo por caractere.",
    etapas: ["voz"],
    credencial: "Chave de API",
    campos: [{ nome: "apiKey", rotulo: "Chave de API", tipo: "segredo", obrigatorio: true }],
    modelos: [
      { id: "eleven_multilingual_v2", nome: "Multilingual v2", etapa: "voz" },
      { id: "eleven_flash_v2_5", nome: "Flash v2.5 (barato)", etapa: "voz" },
    ],
    temSaldoApi: true,
    docs: "https://elevenlabs.io/docs/api-reference",
  },
  {
    id: "kling",
    nome: "Kling",
    descricao: "Avatar a partir de foto + áudio (piscadas e microexpressões), imagens de cenário e cenas.",
    etapas: ["avatar", "cenario", "cenas"],
    credencial: "Chave de API (kling.ai/dev/api-key)",
    campos: [
      { nome: "apiKey", rotulo: "Chave de API", tipo: "segredo", obrigatorio: true, ajuda: "kling.ai/dev/api-key → + Create a new API Key (aparece uma única vez)" },
      { nome: "secretKey", rotulo: "Secret Key (só contas antigas com Access Key + Secret Key)", tipo: "segredo", ajuda: "Deixe vazio se você criou uma chave única" },
      { nome: "endpoint", rotulo: "Base da API", tipo: "url", ajuda: "Padrão: https://api-singapore.klingai.com" },
    ],
    modelos: [
      { id: "kling-avatar-std", nome: "Kling AI Avatar Standard", etapa: "avatar" },
      { id: "kling-avatar-pro", nome: "Kling AI Avatar Pro", etapa: "avatar" },
      { id: "kolors", nome: "Imagem de cenário (Kling Image)", etapa: "cenario" },
      { id: "kling-v2-1", nome: "Kling v2.1 (imagem → vídeo)", etapa: "cenas" },
    ],
    temSaldoApi: false,
    docs: "https://kling.ai/document-api",
    extraPadrao: {
      avatarPath: "/v1/videos/avatar/image2video",
      imagemPath: "/v1/images/generations",
      modeloImagem: "kling-v3",
      videoPath: "/v1/videos/image2video",
      modoAvatarStd: "std",
      modoAvatarPro: "pro",
    },
  },
  {
    id: "heygen",
    nome: "HeyGen",
    descricao: "Gêmeo digital treinado com vídeo da pessoa — apresentador principal.",
    etapas: ["avatar"],
    credencial: "Chave de API",
    campos: [{ nome: "apiKey", rotulo: "Chave de API", tipo: "segredo", obrigatorio: true }],
    modelos: [{ id: "heygen-avatar", nome: "HeyGen Avatar (gêmeo digital)", etapa: "avatar" }],
    temSaldoApi: true,
    docs: "https://docs.heygen.com",
  },
  {
    id: "seedance",
    nome: "Seedance (BytePlus / agregador)",
    descricao: "Cenas inteiras com ação, diálogo curto e áudio nativo — UGC, esquetes, b-roll com pessoas.",
    etapas: ["cenas"],
    credencial: "Chave de API",
    campos: [
      { nome: "apiKey", rotulo: "Chave de API", tipo: "segredo", obrigatorio: true },
      { nome: "endpoint", rotulo: "Base da API", tipo: "url", ajuda: "BytePlus: https://ark.ap-southeast.bytepluses.com/api/v3" },
    ],
    modelos: [
      { id: "seedance-2-0-mini", nome: "Seedance 2.0 Mini", etapa: "cenas" },
      { id: "seedance-2-5", nome: "Seedance 2.5", etapa: "cenas" },
    ],
    temSaldoApi: false,
    extraPadrao: { tarefasPath: "/contents/generations/tasks", modeloMini: "seedance-2-0-mini", modelo25: "seedance-2-5" },
  },
  {
    id: "google_veo",
    nome: "Google Veo (Gemini API)",
    descricao: "Cenas cinematográficas para aberturas e cenas especiais.",
    etapas: ["cenas"],
    credencial: "Chave de API / conta de serviço",
    campos: [{ nome: "apiKey", rotulo: "Chave da Gemini API", tipo: "segredo", obrigatorio: true }],
    modelos: [
      { id: "veo-3.0-fast-generate-001", nome: "Veo 3 Fast", etapa: "cenas" },
      { id: "veo-3.0-generate-001", nome: "Veo 3", etapa: "cenas" },
    ],
    temSaldoApi: false,
  },
  {
    id: "higgsfield",
    nome: "Higgsfield",
    descricao: "Movimentos de câmera e efeitos para peças de redes sociais.",
    etapas: ["efeitos"],
    credencial: "Chave de API (confirmar disponibilidade no seu plano)",
    campos: [
      { nome: "apiKey", rotulo: "Chave de API", tipo: "segredo", obrigatorio: true },
      { nome: "endpoint", rotulo: "Base da API", tipo: "url", obrigatorio: true },
    ],
    modelos: [{ id: "higgsfield-efeitos", nome: "Efeitos de câmera", etapa: "efeitos" }],
    temSaldoApi: false,
    aviso: "Conector genérico: ajuste os caminhos em 'Avançado' depois de confirmar a API do seu plano.",
    extraPadrao: { criarPath: "/v1/generations", statusPath: "/v1/generations/{id}", campoId: "id", campoStatus: "status", campoUrl: "video_url", statusOk: "completed" },
  },
  {
    id: "olhar_gpu",
    nome: "Correção de olhar (servidor GPU)",
    descricao: "Pós-produção que mantém contato visual com a câmera, suavizando quando a cabeça gira muito.",
    etapas: ["olhar"],
    credencial: "URL do servidor + token interno",
    campos: [
      { nome: "endpoint", rotulo: "URL do servidor", tipo: "url", obrigatorio: true },
      { nome: "apiKey", rotulo: "Token interno", tipo: "segredo" },
    ],
    modelos: [{ id: "olhar-padrao", nome: "Correção de olhar", etapa: "olhar" }],
    temSaldoApi: false,
    extraPadrao: { corrigirPath: "/gaze", healthPath: "/health" },
  },
];

export const SIMULADOR = "simulador";

export function provedor(id: string): ProvedorInfo | undefined {
  return PROVEDORES.find((p) => p.id === id);
}

export const ETAPAS: { id: Etapa; nome: string }[] = [
  { id: "roteiro", nome: "Roteiro" },
  { id: "voz", nome: "Voz" },
  { id: "avatar", nome: "Avatar" },
  { id: "olhar", nome: "Correção de olhar" },
  { id: "cenario", nome: "Cenário" },
  { id: "cenas", nome: "Cenas" },
  { id: "efeitos", nome: "Efeitos" },
  { id: "revisao", nome: "Revisão" },
  { id: "montagem", nome: "Montagem" },
];

export function nomeEtapa(e: string) {
  return ETAPAS.find((x) => x.id === e)?.nome ?? e;
}

/** Preços de referência levantados no escopo (seção 6.2). Nada inventado: o resto fica "a confirmar". */
export const PRECOS_INICIAIS = [
  { provedor: "anthropic", modelo: "claude-opus-5-5:entrada", etapa: "roteiro", unidade: "mil_tokens", preco: 0.004, moeda: "USD", qualidade: 3, fonte: "Preço público da API Anthropic (US$ 4 / 1M tokens de entrada)", confirmado: true },
  { provedor: "anthropic", modelo: "claude-opus-5-5:saida", etapa: "roteiro", unidade: "mil_tokens", preco: 0.02, moeda: "USD", qualidade: 3, fonte: "Preço público da API Anthropic (US$ 20 / 1M tokens de saída)", confirmado: true },
  { provedor: "anthropic", modelo: "claude-sonnet-5-5:entrada", etapa: "roteiro", unidade: "mil_tokens", preco: 0.002, moeda: "USD", qualidade: 2, fonte: "Preço público da API Anthropic", confirmado: true },
  { provedor: "anthropic", modelo: "claude-sonnet-5-5:saida", etapa: "roteiro", unidade: "mil_tokens", preco: 0.01, moeda: "USD", qualidade: 2, fonte: "Preço público da API Anthropic", confirmado: true },
  { provedor: "anthropic", modelo: "claude-haiku-5-5:entrada", etapa: "roteiro", unidade: "mil_tokens", preco: 0.0001, moeda: "USD", qualidade: 1, fonte: "Preço público da API Anthropic", confirmado: true },
  { provedor: "anthropic", modelo: "claude-haiku-5-5:saida", etapa: "roteiro", unidade: "mil_tokens", preco: 0.0005, moeda: "USD", qualidade: 1, fonte: "Preço público da API Anthropic", confirmado: true },
  { provedor: "voicestudio", modelo: "voicestudio-tts", etapa: "voz", unidade: "minuto_gpu", preco: null, moeda: "USD", qualidade: 2, fonte: "Custo do servidor ÷ uso — preencher após Fase 0", confirmado: false },
  { provedor: "elevenlabs", modelo: "eleven_multilingual_v2", etapa: "voz", unidade: "mil_caracteres", preco: null, moeda: "USD", qualidade: 3, fonte: "Cadastrar a partir do seu plano", confirmado: false, multiplicadorCredito: 0.2 },
  { provedor: "elevenlabs", modelo: "eleven_flash_v2_5", etapa: "voz", unidade: "mil_caracteres", preco: null, moeda: "USD", qualidade: 2, fonte: "Cadastrar a partir do seu plano", confirmado: false, multiplicadorCredito: 0.1 },
  { provedor: "kling", modelo: "kling-avatar-std", etapa: "avatar", unidade: "segundo", preco: 0.052, moeda: "USD", qualidade: 2, fonte: "PiAPI (fonte pública, nov/2026)", confirmado: true, multiplicadorCredito: 1 },
  { provedor: "kling", modelo: "kling-avatar-pro", etapa: "avatar", unidade: "segundo", preco: null, moeda: "USD", qualidade: 3, fonte: "Mais caro que o Standard — confirmar no seu plano", confirmado: false, multiplicadorCredito: 2 },
  { provedor: "kling", modelo: "kolors", etapa: "cenario", unidade: "imagem", preco: null, moeda: "USD", qualidade: 2, fonte: "Confirmar no seu plano", confirmado: false },
  { provedor: "kling", modelo: "kling-v2-1", etapa: "cenas", unidade: "segundo", preco: null, moeda: "USD", qualidade: 2, fonte: "Confirmar no seu plano", confirmado: false },
  { provedor: "heygen", modelo: "heygen-avatar", etapa: "avatar", unidade: "segundo", preco: null, moeda: "USD", qualidade: 3, fonte: "Cadastrar a partir do seu plano", confirmado: false },
  { provedor: "seedance", modelo: "seedance-2-0-mini", etapa: "cenas", unidade: "segundo", preco: 0.034, moeda: "USD", qualidade: 2, fonte: "A partir de US$ 0,034/s — varia por provedor", confirmado: false },
  { provedor: "seedance", modelo: "seedance-2-5", etapa: "cenas", unidade: "segundo", preco: 0.23, moeda: "USD", qualidade: 3, fonte: "US$ 0,23 a 0,60/s — varia muito por intermediário", confirmado: false, multiplicadorCredito: 8 },
  { provedor: "google_veo", modelo: "veo-3.0-fast-generate-001", etapa: "cenas", unidade: "segundo", preco: null, moeda: "USD", qualidade: 2, fonte: "Cadastrar a partir da sua conta", confirmado: false },
  { provedor: "google_veo", modelo: "veo-3.0-generate-001", etapa: "cenas", unidade: "segundo", preco: null, moeda: "USD", qualidade: 3, fonte: "Cadastrar a partir da sua conta", confirmado: false },
  { provedor: "higgsfield", modelo: "higgsfield-efeitos", etapa: "efeitos", unidade: "geracao", preco: null, moeda: "USD", qualidade: 2, fonte: "Confirmar disponibilidade no seu plano", confirmado: false },
  { provedor: "olhar_gpu", modelo: "olhar-padrao", etapa: "olhar", unidade: "minuto_gpu", preco: null, moeda: "USD", qualidade: 2, fonte: "Custo do servidor ÷ uso", confirmado: false },
] as const;

export const UNIDADES: Record<string, string> = {
  segundo: "segundo de vídeo",
  minuto_gpu: "minuto de GPU",
  mil_tokens: "mil tokens",
  mil_caracteres: "mil caracteres",
  imagem: "imagem",
  geracao: "geração",
};
