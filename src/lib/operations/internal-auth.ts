import "server-only";

import { timingSafeEqual } from "node:crypto";

export function hasBearerSecret(header: string | null, secret: string | undefined) {
  const expected = secret ? `Bearer ${secret}` : "";
  if (!header || !expected || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
