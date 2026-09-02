import "server-only";

type PlaidEnvironment = "sandbox" | "development" | "production";
const hosts: Record<PlaidEnvironment, string> = { sandbox: "https://sandbox.plaid.com", development: "https://development.plaid.com", production: "https://production.plaid.com" };

export class PlaidError extends Error {
  constructor(public readonly code: string, public readonly type: string, message: string, public readonly requestId: string | null = null) { super(message); }
}

function configuration() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const environment = (process.env.PLAID_ENV ?? "sandbox") as PlaidEnvironment;
  if (!clientId || !secret) throw new Error("Plaid credentials are not configured");
  if (!hosts[environment]) throw new Error("PLAID_ENV must be sandbox, development, or production");
  return { clientId, secret, baseUrl: hosts[environment], environment };
}

export async function plaidRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const config = configuration();
  const response = await fetch(`${config.baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "PLAID-CLIENT-ID": config.clientId, "PLAID-SECRET": config.secret }, body: JSON.stringify(body), cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new PlaidError(String(payload.error_code ?? "PLAID_ERROR"), String(payload.error_type ?? "API_ERROR"), String(payload.error_message ?? "Plaid could not complete the request."), payload.request_id ? String(payload.request_id) : null);
  return payload as T;
}

export function plaidEnvironment() { return configuration().environment; }
export function plaidWebhookUrl() {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base || !/^https:\/\//.test(base)) throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTPS URL before bank connections can be enabled");
  return `${base.replace(/\/$/, "")}/api/bank-connections/plaid/webhook`;
}
