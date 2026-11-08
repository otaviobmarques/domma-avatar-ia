# Domma AvatarIA

**Domma Tecnologia** — sistema de gêmeo digital com IA: clone de voz, avatar com boca e olhos sincronizados, troca de cenário, propagandas (carro-chefe do MVP), depoimentos e apresentações. Tem Central de Integrações, escolha de motor por etapa e **estimativa de custo antes de gerar**.

Implementa a **Fase 1 — MVP interno** do documento de escopo v1.0 (08/11/2026).

## O que está pronto

| Tela | Destaques |
|---|---|
| Início | Vídeos do mês, gasto × orçamento, custo médio, aprovações pendentes, alertas (integração com erro, saldo baixo, orçamento em 80%) |
| Avatares | Assistente em 5 passos: **consentimento LGPD** (termo versionado + hash, CPF validado, prazo), **verificação ao vivo** pela câmera com frase aleatória, rosto (vídeo + fotos com checklist automático de duração/resolução/luz), voz com **medidor de ruído**, treino nos motores + **teste A/B cego**. Comparação facial pelo Claude (ou aprovação manual do Administrador). **Excluir clone** apaga amostras e solicita exclusão nos provedores |
| Novo vídeo | Formato → Roteiro (Claude: 1 ou 3 versões, ajustar tom, marcações `[pausa]` `[olha p/ câmera]`…, contador de tempo, prévia da voz com custo antes) → Avatar e cenário (biblioteca ou gerar novo, sugestão de b-roll para reduzir custo) → **Motores e custo** (Econômico/Equilibrado/Premium/Manual, trocar motor por etapa, comparar modos, bloqueio por orçamento) |
| Revisão e editor | Player + linha do tempo por cena, relatório de qualidade do Claude (frames), regerar trecho (custo antes), corrigir olhar, legendas/trilha/logo/marca d'água, link de aprovação, render final 720p/1080p em várias proporções (reaproveita as cenas — sem novo custo de IA) |
| Aprovações | Link público sem conta, comentário no tempo exato do vídeo |
| Projetos / Biblioteca | Por cliente e campanha, duplicar, salvar como modelo; cenários, vinhetas, chamadas, trilhas, logotipos e trechos reaproveitáveis |
| Custos | Por mês, motor, cliente e formato; estimado × real (calibração); exportar CSV e PDF |
| Integrações | Cartão por provedor: status, chave **criptografada (AES-256-GCM)** mascarada, endpoint, modelos, saldo, liga/desliga, padrão por etapa, fallback, limite mensal (alerta 80% / bloqueio 100%), testar conexão, log de chamadas, ligar/desligar servidor GPU |
| Preços | Preço por motor/modelo, planos por crédito (custo efetivo), cotação automática do dólar + colchão IOF/spread, histórico, recalcular orçamentos abertos |
| Configurações | Usuários e papéis (Administrador, Editor, Cliente), clientes com orçamento, rótulo "gerado por IA", modo padrão, preferências de motor por formato, auditoria |

### Motores (camada única de conectores — `src/lib/conectores`)
Claude (roteiro, revisão, verificação facial), ElevenLabs (TTS com timestamps + clone), VoiceStudio (servidor próprio), Kling (avatar Std/Pro, Kolors, image→video; API oficial com AK/SK ou agregador), HeyGen (gêmeo digital), Seedance (BytePlus), Google Veo (Gemini API), Higgsfield (conector genérico configurável) e correção de olhar (servidor GPU). Endpoints e caminhos são editáveis em **Integrações → Opções → Avançado**, sem mudar código.

> ⚠️ Os conectores seguem a documentação pública de cada API, mas **só Anthropic foi testado com chamada real** até agora. Valide cada um na Fase 0 com as suas contas.

### Modo demonstração
Ligado por padrão: etapas sem motor ligado são geradas por um **simulador local (FFmpeg)** — o fluxo inteiro funciona sem nenhuma chave, e a estimativa mostra o preço do motor real que seria usado. Desligue em Configurações quando as chaves estiverem cadastradas.

## Rodar localmente

Requisitos: Node 22+ e FFmpeg.

```bash
cp .env.example .env.local   # gere APP_ENCRYPTION_KEY e AUTH_SECRET: openssl rand -hex 32
npm install
npm run dev
```

Acesse http://localhost:3000 — login inicial: `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env.local` (padrão `admin@domma.local` / `admin123`, **troque**). Sem `DATABASE_URL`, usa Postgres embutido (PGlite) em `./.data`.

## Produção — Supabase + Vercel + Railway

| Peça | Onde | O que faz |
|---|---|---|
| Banco + arquivos | **Supabase** | Postgres (migrações automáticas na subida) e Storage em bucket **privado** |
| Telas | **Vercel** | Next.js com `WORKER_INLINE=0`. Uploads vão **direto do navegador ao Supabase Storage** (URL assinada) e arquivos são entregues por redirecionamento — nada grande passa pelas funções (limite de ~4,5 MB) |
| Worker | **Railway** | `Dockerfile` (com FFmpeg) + start command `npm run worker`. Processa a fila: voz, avatar, cenas, montagem, revisão, conversão do vídeo do rosto e da voz, comparação facial, prévias |

Variáveis (iguais na Vercel e no Railway): `DATABASE_URL` (pooler do Supabase), `APP_ENCRYPTION_KEY`, `AUTH_SECRET`, `APP_URL` (URL da Vercel), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; na Vercel `WORKER_INLINE=0`. Opcional: `RESEND_API_KEY` + `EMAIL_REMETENTE` para enviar convites por e-mail.

> `APP_ENCRYPTION_KEY` precisa ser **a mesma** nos dois serviços — é ela que decifra as chaves de API.

## Estrutura

```
src/db/schema.ts          tabelas (seção 9 do escopo) — migrações em drizzle/
src/lib/orquestrador.ts   regras dos modos, escolha de motor, fallback, estimativa
src/lib/pipeline.ts       cria os jobs de cada vídeo (voz → avatar → olhar → cenas → montagem → revisão)
src/lib/worker.ts         fila (SKIP LOCKED), retentativas, fallback automático, execução das etapas
src/lib/conectores/       um conector por provedor
src/lib/ffmpeg.ts         montagem, legendas, marca d'água, trilha com ducking, simulador
src/app/                  telas (App Router) e server actions
```

## Pendências (seção 11 do escopo)
Nome/marca definitivos · Podcast com 1 ou 2 avatares (fase 2) · Quais contas têm API e quais planos · Preços dos planos para completar a Tabela de Preços · Resultado da Fase 0 para fixar o modo Equilibrado · Compartilhamento com Domma UGC Creator / Sistema de Edição.
