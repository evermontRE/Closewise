const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WEBHOOK_PATHS = new Set(["/api/stripe/webhook", "/api/bank-connections/plaid/webhook"]);

function configuredOrigins() {
  const origins = new Set<string>();
  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null]) {
    if (!value) continue;
    try { origins.add(new URL(value).origin); } catch { /* Invalid deployment configuration is ignored here and validated at startup. */ }
  }
  return origins;
}

export function isTrustedMutation(request: Request) {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return true;
  const url = new URL(request.url);
  if (WEBHOOK_PATHS.has(url.pathname)) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = configuredOrigins();
  allowed.add(url.origin);
  try { return allowed.has(new URL(origin).origin); } catch { return false; }
}
