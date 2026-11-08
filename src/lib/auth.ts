import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Papel } from "@/db/schema";
import { env } from "./env";

const COOKIE = "domma_sessao";
const segredo = () => new TextEncoder().encode(env.authSecret);

export type Sessao = { id: string; nome: string; email: string; papel: Papel; empresaId: string | null };

export async function hashSenha(s: string) { return bcrypt.hash(s, 10); }

export async function entrar(email: string, senha: string): Promise<Sessao | null> {
  const db = await getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email.trim().toLowerCase()));
  if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senhaHash))) return null;
  const s: Sessao = { id: u.id, nome: u.nome, email: u.email, papel: u.papel, empresaId: u.empresaId };
  const jwt = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(segredo());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 7 });
  return s;
}

export async function sair() { (await cookies()).delete(COOKIE); }

export async function sessao(): Promise<Sessao | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, segredo());
    return payload as unknown as Sessao;
  } catch { return null; }
}

/** Exige login. Com `papeis`, exige um dos papéis (ex.: só Administrador acessa Integrações). */
export async function exigir(papeis?: Papel[]): Promise<Sessao> {
  const s = await sessao();
  if (!s) redirect("/entrar");
  if (papeis && !papeis.includes(s.papel)) redirect("/?negado=1");
  return s;
}

export const ehAdmin = (s: Sessao) => s.papel === "admin";
