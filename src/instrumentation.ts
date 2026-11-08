export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.WORKER_INLINE ?? "1") !== "1") return;
  const { iniciarWorker } = await import("./lib/worker");
  const { getDb } = await import("./db");
  await getDb();
  iniciarWorker();
}
