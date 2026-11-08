import crypto from "node:crypto";
import { env } from "./env";

function chave(): Buffer {
  if (!env.encKey || env.encKey.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY ausente ou curta (mín. 32 caracteres). Configure no .env.");
  }
  return crypto.createHash("sha256").update(env.encKey).digest();
}

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<dados> (base64url) */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrar(valor: string): string {
  const [v, iv, tag, dados] = valor.split(".");
  if (v !== "v1") throw new Error("Formato de chave cifrada desconhecido");
  const d = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}

export function mascarar(chaveTexto: string): string {
  return chaveTexto.slice(-4);
}

export function token(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hmac(texto: string): string {
  return crypto.createHmac("sha256", env.authSecret).update(texto).digest("base64url");
}

export function sha256(texto: string | Buffer): string {
  return crypto.createHash("sha256").update(texto).digest("hex");
}
