import "server-only";
import { createHash, createPublicKey, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";
import { plaidRequest } from "./plaid";

type Claims = { iat?: number; request_body_sha256?: string };

export async function verifyPlaidWebhook(rawBody: string, token: string | null) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Claims;
    if (header.alg !== "ES256" || !header.kid || !claims.iat || Math.abs(Date.now() / 1000 - claims.iat) > 300) return false;
    const response = await plaidRequest<{ key: JsonWebKey }>("/webhook_verification_key/get", { key_id: header.kid });
    const key = createPublicKey({ key: response.key, format: "jwk" });
    const validSignature = verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"));
    if (!validSignature || !claims.request_body_sha256) return false;
    const actual = Buffer.from(createHash("sha256").update(rawBody).digest("hex"));
    const expected = Buffer.from(claims.request_body_sha256);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
