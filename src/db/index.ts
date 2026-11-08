import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

type G = { __db?: Promise<DB> };
const g = globalThis as unknown as G;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function criar(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: Number(process.env.DB_POOL ?? 5), prepare: false });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

/** Conexão única por processo. Aplica as migrações na primeira chamada. */
export function getDb(): Promise<DB> {
  if (!g.__db) {
    g.__db = criar().then(async (db) => {
      const { seed } = await import("./seed");
      await seed(db);
      return db;
    }).catch((e) => { g.__db = undefined; throw e; });
  }
  return g.__db;
}

export { schema };
