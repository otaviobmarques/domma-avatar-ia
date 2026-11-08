CREATE TABLE "aprovacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"arquivo" text,
	"comentarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decidido_em" timestamp with time zone,
	"decidido_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"usuario_email" text,
	"acao" text NOT NULL,
	"alvo" text,
	"dados" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"nome" text NOT NULL,
	"foto" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"consentimento" jsonb,
	"consentimento_validade" timestamp with time zone,
	"verificacao" jsonb,
	"amostras" jsonb DEFAULT '{"fotos":[]}'::jsonb NOT NULL,
	"modelos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"motor_voz" text,
	"motor_avatar" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "biblioteca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"arquivo" text,
	"texto" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"origem" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cenas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text NOT NULL,
	"texto" text DEFAULT '' NOT NULL,
	"marcacoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"motor" text,
	"duracao" real,
	"audio" text,
	"palavras" jsonb,
	"arquivo" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"qualidade" text DEFAULT 'previa' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"orcamento_mensal" numeric(14, 4) DEFAULT 0 NOT NULL,
	"plano" text DEFAULT 'interno' NOT NULL,
	"creditos" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integracao_chamadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"modelo" text,
	"video_id" uuid,
	"etapa" text,
	"acao" text NOT NULL,
	"duracao_ms" integer,
	"quantidade" real,
	"custo" numeric(14, 4),
	"sucesso" boolean NOT NULL,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"status" text DEFAULT 'nao_configurado' NOT NULL,
	"chave_cifrada" text,
	"chave_final" text,
	"endpoint" text,
	"modelos_habilitados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"saldo" real,
	"saldo_unidade" text,
	"saldo_manual" boolean DEFAULT false NOT NULL,
	"ligado" boolean DEFAULT false NOT NULL,
	"padrao_de" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fallback" text,
	"limite_mensal" numeric(14, 4),
	"ultima_verificacao" timestamp with time zone,
	"ultimo_uso" timestamp with time zone,
	"ultimo_erro" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid,
	"cena_id" uuid,
	"etapa" text NOT NULL,
	"provedor" text NOT NULL,
	"modelo" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"max_tentativas" integer DEFAULT 3 NOT NULL,
	"custo" numeric(14, 4),
	"entrada" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resposta" jsonb,
	"tarefa_externa" text,
	"erro" text,
	"fallback_de" text,
	"depende" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rodar_apos" timestamp with time zone DEFAULT now() NOT NULL,
	"travado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "precos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"modelo" text NOT NULL,
	"etapa" text NOT NULL,
	"unidade" text NOT NULL,
	"preco" real,
	"moeda" text DEFAULT 'USD' NOT NULL,
	"plano_valor" real,
	"plano_unidades" real,
	"multiplicador_credito" real DEFAULT 1 NOT NULL,
	"qualidade" integer DEFAULT 2 NOT NULL,
	"fonte" text,
	"conferido_em" timestamp with time zone,
	"confirmado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precos_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preco_id" uuid NOT NULL,
	"preco_anterior" real,
	"preco_novo" real,
	"moeda" text,
	"alterado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" text DEFAULT 'editor' NOT NULL,
	"empresa_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"projeto" text,
	"titulo" text NOT NULL,
	"formato" text DEFAULT 'propaganda' NOT NULL,
	"duracao_alvo" integer DEFAULT 30 NOT NULL,
	"proporcao" text DEFAULT '9:16' NOT NULL,
	"briefing" jsonb,
	"roteiro" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avatar_id" uuid,
	"cenario_id" uuid,
	"enquadramento" text DEFAULT 'meio_corpo' NOT NULL,
	"olhar" text DEFAULT 'camera' NOT NULL,
	"modo" text DEFAULT 'equilibrado' NOT NULL,
	"motores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"estimativa" jsonb,
	"custo_estimado" numeric(14, 4),
	"custo_real" numeric(14, 4) DEFAULT 0 NOT NULL,
	"previa" text,
	"final" text,
	"finais" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"qualidade" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legendas" boolean DEFAULT true NOT NULL,
	"trilha_id" uuid,
	"logo_id" uuid,
	"marca_dagua" boolean DEFAULT true NOT NULL,
	"is_modelo" boolean DEFAULT false NOT NULL,
	"modelo_nome" text,
	"aprovado_excedente" boolean DEFAULT false NOT NULL,
	"erro" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aprovacoes" ADD CONSTRAINT "aprovacoes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatares" ADD CONSTRAINT "avatares_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatares" ADD CONSTRAINT "avatares_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biblioteca" ADD CONSTRAINT "biblioteca_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cenas" ADD CONSTRAINT "cenas_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cena_id_cenas_id_fk" FOREIGN KEY ("cena_id") REFERENCES "public"."cenas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precos_historico" ADD CONSTRAINT "precos_historico_preco_id_precos_id_fk" FOREIGN KEY ("preco_id") REFERENCES "public"."precos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_id_avatares_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatares"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aprovacoes_token_idx" ON "aprovacoes" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auditoria_data_idx" ON "auditoria" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "cenas_video_idx" ON "cenas" USING btree ("video_id","ordem");--> statement-breakpoint
CREATE INDEX "chamadas_provedor_idx" ON "integracao_chamadas" USING btree ("provedor","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "integracoes_provedor_idx" ON "integracoes" USING btree ("provedor");--> statement-breakpoint
CREATE INDEX "jobs_fila_idx" ON "jobs" USING btree ("status","rodar_apos");--> statement-breakpoint
CREATE INDEX "jobs_video_idx" ON "jobs" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "precos_modelo_idx" ON "precos" USING btree ("provedor","modelo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_idx" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE INDEX "videos_empresa_idx" ON "videos" USING btree ("empresa_id","criado_em");