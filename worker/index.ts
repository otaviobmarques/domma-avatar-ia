/**
 * Worker separado (Railway): processa a fila de jobs.
 *   DATABASE_URL=... APP_ENCRYPTION_KEY=... npm run worker
 * Use WORKER_INLINE=0 no servidor web quando este processo estiver rodando.
 */
import { getDb } from "../src/db";
import { iniciarWorker, limparPrevias } from "../src/lib/worker";

await getDb();
iniciarWorker(Number(process.env.WORKER_CONCURRENCY ?? 4));
setInterval(() => limparPrevias().catch(() => {}), 6 * 60 * 60 * 1000);
process.on("SIGTERM", () => process.exit(0));
