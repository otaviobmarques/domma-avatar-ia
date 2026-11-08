export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  encKey: process.env.APP_ENCRYPTION_KEY ?? "",
  authSecret: process.env.AUTH_SECRET ?? process.env.APP_ENCRYPTION_KEY ?? "dev-secret-troque",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@domma.local",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "avatar",
  workerInline: (process.env.WORKER_INLINE ?? "1") === "1",
};
