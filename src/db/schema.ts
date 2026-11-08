import {
  pgTable, text, integer, boolean, timestamp, jsonb, numeric, uuid, index, uniqueIndex, real,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const brl = (name: string) => numeric(name, { precision: 14, scale: 4, mode: "number" });

/* ---------- Empresas / clientes ---------- */
export const empresas = pgTable("empresas", {
  id: id(),
  nome: text("nome").notNull(),
  orcamentoMensal: brl("orcamento_mensal").notNull().default(0),
  plano: text("plano").notNull().default("interno"),
  creditos: integer("creditos").notNull().default(0),
  criadoEm: criadoEm(),
});

/* ---------- Usuários ---------- */
export type Papel = "admin" | "editor" | "cliente";
export const usuarios = pgTable("usuarios", {
  id: id(),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  senhaHash: text("senha_hash").notNull(),
  papel: text("papel").$type<Papel>().notNull().default("editor"),
  empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("usuarios_email_idx").on(t.email)]);

/* ---------- Avatares (gêmeos digitais) ---------- */
export type AvatarStatus = "rascunho" | "consentido" | "verificado" | "amostras" | "pronto" | "excluido";
export type Consentimento = {
  termoVersao: string;
  nome: string;
  cpf: string;
  finalidade: string;
  prazoMeses: number;
  aceitoEm: string;
  ip: string | null;
  userAgent: string | null;
  hashTermo: string;
};
export type Verificacao = {
  frase: string;
  geradaEm: string;
  video?: string;
  gravadaEm?: string;
  status: "pendente" | "gravada" | "aprovada" | "reprovada";
  observacao?: string;
};
export type Amostras = {
  video?: string;
  videoDuracao?: number;
  fotos: string[];
  voz?: string;
  vozDuracao?: number;
  vozRuidoDb?: number;
  checklist?: Record<string, boolean>;
};
export const avatares = pgTable("avatares", {
  id: id(),
  empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  foto: text("foto"),
  status: text("status").$type<AvatarStatus>().notNull().default("rascunho"),
  consentimento: jsonb("consentimento").$type<Consentimento | null>(),
  consentimentoValidade: timestamp("consentimento_validade", { withTimezone: true }),
  verificacao: jsonb("verificacao").$type<Verificacao | null>(),
  amostras: jsonb("amostras").$type<Amostras>().notNull().default({ fotos: [] }),
  /** ids dos modelos treinados por provedor: { elevenlabs: "voice_id", heygen: "avatar_id", ... } */
  modelos: jsonb("modelos").$type<Record<string, string>>().notNull().default({}),
  motorVoz: text("motor_voz"),
  motorAvatar: text("motor_avatar"),
  criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm: criadoEm(),
  excluidoEm: timestamp("excluido_em", { withTimezone: true }),
});

/* ---------- Central de Integrações ---------- */
export type IntegracaoStatus = "conectado" | "erro" | "desligado" | "sem_saldo" | "nao_configurado";
export type Etapa = "roteiro" | "voz" | "avatar" | "olhar" | "cenario" | "cenas" | "efeitos" | "revisao" | "montagem";
export const integracoes = pgTable("integracoes", {
  id: id(),
  provedor: text("provedor").notNull(),
  status: text("status").$type<IntegracaoStatus>().notNull().default("nao_configurado"),
  chaveCifrada: text("chave_cifrada"),
  chaveFinal: text("chave_final"),
  endpoint: text("endpoint"),
  modelosHabilitados: jsonb("modelos_habilitados").$type<string[]>().notNull().default([]),
  saldo: real("saldo"),
  saldoUnidade: text("saldo_unidade"),
  saldoManual: boolean("saldo_manual").notNull().default(false),
  ligado: boolean("ligado").notNull().default(false),
  padraoDe: jsonb("padrao_de").$type<Etapa[]>().notNull().default([]),
  fallback: text("fallback"),
  limiteMensal: brl("limite_mensal"),
  ultimaVerificacao: timestamp("ultima_verificacao", { withTimezone: true }),
  ultimoUso: timestamp("ultimo_uso", { withTimezone: true }),
  ultimoErro: text("ultimo_erro"),
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("integracoes_provedor_idx").on(t.provedor)]);

export const integracaoChamadas = pgTable("integracao_chamadas", {
  id: id(),
  provedor: text("provedor").notNull(),
  modelo: text("modelo"),
  videoId: uuid("video_id"),
  etapa: text("etapa"),
  acao: text("acao").notNull(),
  duracaoMs: integer("duracao_ms"),
  quantidade: real("quantidade"),
  custo: brl("custo"),
  sucesso: boolean("sucesso").notNull(),
  erro: text("erro"),
  criadoEm: criadoEm(),
}, (t) => [index("chamadas_provedor_idx").on(t.provedor, t.criadoEm)]);

/* ---------- Tabela de Preços ---------- */
export const precos = pgTable("precos", {
  id: id(),
  provedor: text("provedor").notNull(),
  modelo: text("modelo").notNull(),
  etapa: text("etapa").$type<Etapa>().notNull(),
  /** segundo, minuto_gpu, mil_tokens_entrada, mil_tokens_saida, mil_caracteres, imagem, geracao */
  unidade: text("unidade").notNull(),
  preco: real("preco"),
  moeda: text("moeda").$type<"USD" | "BRL">().notNull().default("USD"),
  /** Para planos por créditos: valor pago no plano e unidades incluídas → custo efetivo */
  planoValor: real("plano_valor"),
  planoUnidades: real("plano_unidades"),
  multiplicadorCredito: real("multiplicador_credito").notNull().default(1),
  qualidade: integer("qualidade").notNull().default(2), // 1 econômico, 2 bom, 3 premium
  fonte: text("fonte"),
  conferidoEm: timestamp("conferido_em", { withTimezone: true }),
  confirmado: boolean("confirmado").notNull().default(false),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("precos_modelo_idx").on(t.provedor, t.modelo)]);

export const precosHistorico = pgTable("precos_historico", {
  id: id(),
  precoId: uuid("preco_id").notNull().references(() => precos.id, { onDelete: "cascade" }),
  precoAnterior: real("preco_anterior"),
  precoNovo: real("preco_novo"),
  moeda: text("moeda"),
  alteradoPor: uuid("alterado_por"),
  criadoEm: criadoEm(),
});

/* ---------- Configurações (chave/valor) ---------- */
export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Vídeos ---------- */
export type VideoStatus = "rascunho" | "gerando" | "previa_pronta" | "em_aprovacao" | "aprovado" | "renderizando" | "finalizado" | "erro";
export type Formato = "propaganda" | "depoimento" | "apresentacao" | "ugc" | "podcast";
export type Modo = "economico" | "equilibrado" | "premium" | "manual";
export type BlocoRoteiro = {
  id: string;
  tipo: "avatar" | "broll" | "texto";
  texto: string;
  /** marcações: animado, pausa, olha_camera, enfase, pensar */
  marcacoes: string[];
  broll?: string;
  enquadramento?: "rosto" | "meio_corpo";
};
export type Briefing = { produto: string; publico: string; oferta: string; cta: string; observacoes?: string };
export type LinhaEstimativa = {
  etapa: Etapa;
  provedor: string;
  modelo: string;
  quantidade: number;
  unidade: string;
  custoBrl: number | null; // null = "a confirmar"
  observacao?: string;
};
export type Estimativa = {
  modo: Modo;
  linhas: LinhaEstimativa[];
  totalBrl: number;
  aConfirmar: number;
  cotacao: number;
  colchao: number;
  avisos: string[];
  calculadaEm: string;
};
export type ItemQualidade = { cena: number; tempo: string; tipo: string; mensagem: string; gravidade: "info" | "aviso" | "erro" };

export const videos = pgTable("videos", {
  id: id(),
  empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
  projeto: text("projeto"),
  titulo: text("titulo").notNull(),
  formato: text("formato").$type<Formato>().notNull().default("propaganda"),
  duracaoAlvo: integer("duracao_alvo").notNull().default(30),
  proporcao: text("proporcao").$type<"9:16" | "16:9" | "1:1">().notNull().default("9:16"),
  briefing: jsonb("briefing").$type<Briefing | null>(),
  roteiro: jsonb("roteiro").$type<BlocoRoteiro[]>().notNull().default([]),
  avatarId: uuid("avatar_id").references(() => avatares.id, { onDelete: "set null" }),
  cenarioId: uuid("cenario_id"),
  enquadramento: text("enquadramento").notNull().default("meio_corpo"),
  olhar: text("olhar").notNull().default("camera"),
  modo: text("modo").$type<Modo>().notNull().default("equilibrado"),
  /** escolhas manuais por etapa: { voz: "elevenlabs/eleven_multilingual_v2" } */
  motores: jsonb("motores").$type<Partial<Record<Etapa, string>>>().notNull().default({}),
  status: text("status").$type<VideoStatus>().notNull().default("rascunho"),
  estimativa: jsonb("estimativa").$type<Estimativa | null>(),
  custoEstimado: brl("custo_estimado"),
  custoReal: brl("custo_real").notNull().default(0),
  previa: text("previa"),
  final: text("final"),
  finais: jsonb("finais").$type<Record<string, string>>().notNull().default({}),
  qualidade: jsonb("qualidade").$type<ItemQualidade[]>().notNull().default([]),
  legendas: boolean("legendas").notNull().default(true),
  trilhaId: uuid("trilha_id"),
  logoId: uuid("logo_id"),
  marcaDagua: boolean("marca_dagua").notNull().default(true),
  isModelo: boolean("is_modelo").notNull().default(false),
  modeloNome: text("modelo_nome"),
  aprovadoExcedente: boolean("aprovado_excedente").notNull().default(false),
  erro: text("erro"),
  criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm: criadoEm(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("videos_empresa_idx").on(t.empresaId, t.criadoEm)]);

export const cenas = pgTable("cenas", {
  id: id(),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  ordem: integer("ordem").notNull(),
  tipo: text("tipo").$type<"avatar" | "broll" | "texto">().notNull(),
  texto: text("texto").notNull().default(""),
  marcacoes: jsonb("marcacoes").$type<string[]>().notNull().default([]),
  motor: text("motor"),
  duracao: real("duracao"),
  audio: text("audio"),
  palavras: jsonb("palavras").$type<{ palavra: string; inicio: number; fim: number }[]>(),
  arquivo: text("arquivo"),
  /** versão da cena: aumenta a cada "Regerar trecho" */
  versao: integer("versao").notNull().default(1),
  qualidade: text("qualidade").$type<"previa" | "final">().notNull().default("previa"),
}, (t) => [index("cenas_video_idx").on(t.videoId, t.ordem)]);

export type JobStatus = "pendente" | "rodando" | "ok" | "erro" | "cancelado" | "aguardando";
export const jobs = pgTable("jobs", {
  id: id(),
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
  cenaId: uuid("cena_id").references(() => cenas.id, { onDelete: "cascade" }),
  etapa: text("etapa").$type<Etapa>().notNull(),
  provedor: text("provedor").notNull(),
  modelo: text("modelo"),
  status: text("status").$type<JobStatus>().notNull().default("pendente"),
  tentativas: integer("tentativas").notNull().default(0),
  maxTentativas: integer("max_tentativas").notNull().default(3),
  custo: brl("custo"),
  entrada: jsonb("entrada").$type<Record<string, unknown>>().notNull().default({}),
  resposta: jsonb("resposta").$type<Record<string, unknown> | null>(),
  /** id da tarefa assíncrona no provedor (HeyGen, Kling, Veo...) */
  tarefaExterna: text("tarefa_externa"),
  erro: text("erro"),
  fallbackDe: text("fallback_de"),
  depende: jsonb("depende").$type<string[]>().notNull().default([]),
  rodarApos: timestamp("rodar_apos", { withTimezone: true }).notNull().defaultNow(),
  travadoEm: timestamp("travado_em", { withTimezone: true }),
  criadoEm: criadoEm(),
  finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
}, (t) => [index("jobs_fila_idx").on(t.status, t.rodarApos), index("jobs_video_idx").on(t.videoId)]);

/* ---------- Biblioteca ---------- */
export type TipoBiblioteca = "cenario" | "vinheta" | "trilha" | "logotipo" | "chamada" | "trecho";
export const biblioteca = pgTable("biblioteca", {
  id: id(),
  empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
  tipo: text("tipo").$type<TipoBiblioteca>().notNull(),
  nome: text("nome").notNull(),
  arquivo: text("arquivo"),
  texto: text("texto"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  origem: text("origem"),
  criadoEm: criadoEm(),
});

/* ---------- Aprovações ---------- */
export type Comentario = { tempo: number; texto: string; autor: string; em: string };
export const aprovacoes = pgTable("aprovacoes", {
  id: id(),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  status: text("status").$type<"pendente" | "aprovado" | "ajuste">().notNull().default("pendente"),
  arquivo: text("arquivo"),
  comentarios: jsonb("comentarios").$type<Comentario[]>().notNull().default([]),
  decididoEm: timestamp("decidido_em", { withTimezone: true }),
  decididoPor: text("decidido_por"),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("aprovacoes_token_idx").on(t.token)]);

/* ---------- Auditoria (quem gerou cada vídeo, quem mexeu em chaves) ---------- */
export const auditoria = pgTable("auditoria", {
  id: id(),
  usuarioId: uuid("usuario_id"),
  usuarioEmail: text("usuario_email"),
  acao: text("acao").notNull(),
  alvo: text("alvo"),
  dados: jsonb("dados").$type<Record<string, unknown>>(),
  criadoEm: criadoEm(),
}, (t) => [index("auditoria_data_idx").on(t.criadoEm)]);
