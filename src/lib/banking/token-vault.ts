import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const raw = process.env.BANK_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("BANK_TOKEN_ENCRYPTION_KEY is not configured");
  const value = Buffer.from(raw, "base64");
  if (value.length !== 32) throw new Error("BANK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return value;
}

export function encryptBankToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptBankToken(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Stored bank credential is invalid");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
