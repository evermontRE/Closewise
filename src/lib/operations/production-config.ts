export type LaunchStage = "development" | "beta" | "production";
export type ConfigurationReport = { stage: LaunchStage; ready: boolean; missing: string[]; invalid: string[] };

const REQUIRED = [
  "NEXT_PUBLIC_LAUNCH_STAGE", "NEXT_PUBLIC_REGISTRATION_MODE",
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ESSENTIALS", "STRIPE_PRICE_PROFESSIONAL", "STRIPE_PRICE_COMPLETE",
  "ENTITLEMENT_SIGNING_SECRET", "PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV",
  "BANK_TOKEN_ENCRYPTION_KEY", "CRON_SECRET", "HEALTHCHECK_SECRET", "OPERATIONS_SECRET",
] as const;

export function launchStage(value = process.env.NEXT_PUBLIC_LAUNCH_STAGE): LaunchStage {
  if (value === "production" || value === "beta") return value;
  return "development";
}

function validUrl(value: string | undefined, production: boolean) {
  try { const url = new URL(value ?? ""); return !production || url.protocol === "https:"; } catch { return false; }
}

export function productionConfiguration(env: Record<string, string | undefined> = process.env): ConfigurationReport {
  const stage = launchStage(env.NEXT_PUBLIC_LAUNCH_STAGE);
  const missing = REQUIRED.filter((key) => !env[key]?.trim());
  const invalid: string[] = [];
  const production = stage === "production";
  if (env.NEXT_PUBLIC_SITE_URL && !validUrl(env.NEXT_PUBLIC_SITE_URL, production)) invalid.push("NEXT_PUBLIC_SITE_URL");
  if (env.NEXT_PUBLIC_SUPABASE_URL && !validUrl(env.NEXT_PUBLIC_SUPABASE_URL, true)) invalid.push("NEXT_PUBLIC_SUPABASE_URL");
  if (env.PLAID_ENV && !["sandbox", "development", "production"].includes(env.PLAID_ENV)) invalid.push("PLAID_ENV");
  if (env.NEXT_PUBLIC_REGISTRATION_MODE && !["open", "beta", "closed"].includes(env.NEXT_PUBLIC_REGISTRATION_MODE)) invalid.push("NEXT_PUBLIC_REGISTRATION_MODE");
  if (production && env.PLAID_ENV !== "production") invalid.push("PLAID_ENV must be production");
  if (production && env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_live_")) invalid.push("STRIPE_SECRET_KEY must be live mode");
  if (env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) invalid.push("STRIPE_WEBHOOK_SECRET");
  for (const key of ["STRIPE_PRICE_ESSENTIALS", "STRIPE_PRICE_PROFESSIONAL", "STRIPE_PRICE_COMPLETE"] as const) if (env[key] && !env[key]?.startsWith("price_")) invalid.push(key);
  const operationalSecrets = [env.CRON_SECRET, env.HEALTHCHECK_SECRET, env.OPERATIONS_SECRET].filter(Boolean);
  if (new Set(operationalSecrets).size !== operationalSecrets.length) invalid.push("Operational bearer secrets must be distinct");
  for (const key of ["ENTITLEMENT_SIGNING_SECRET", "CRON_SECRET", "HEALTHCHECK_SECRET", "OPERATIONS_SECRET"] as const) if (env[key] && env[key]!.length < 32) invalid.push(`${key} must contain at least 32 characters`);
  if (env.BANK_TOKEN_ENCRYPTION_KEY) {
    try { if (Buffer.from(env.BANK_TOKEN_ENCRYPTION_KEY, "base64").length !== 32) invalid.push("BANK_TOKEN_ENCRYPTION_KEY must decode to 32 bytes"); } catch { invalid.push("BANK_TOKEN_ENCRYPTION_KEY"); }
  }
  return { stage, ready: missing.length === 0 && invalid.length === 0, missing, invalid: [...new Set(invalid)] };
}
