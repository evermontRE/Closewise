import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Wait a moment and try again.");
  }
}

export async function enforceRateLimit(input: { action: string; subject: string; limit: number; windowSeconds: number }) {
  const subjectHash = createHash("sha256").update(input.subject).digest("hex");
  const { data, error } = await createAdminClient().rpc("consume_api_rate_limit", {
    p_bucket_key: `${input.action}:${subjectHash}`,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  });
  if (error) throw new Error(`Unable to enforce request limits: ${error.message}`);
  const result = data as { allowed?: boolean; retryAfterSeconds?: number } | null;
  if (!result?.allowed) throw new RateLimitError(Math.max(1, Number(result?.retryAfterSeconds ?? input.windowSeconds)));
}
