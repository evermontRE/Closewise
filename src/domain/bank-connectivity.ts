import { createHash } from "node:crypto";
import { toCents } from "./money.ts";

export interface ProviderTransaction {
  transaction_id: string;
  account_id: string;
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  amount: number;
  iso_currency_code?: string | null;
  pending?: boolean;
  pending_transaction_id?: string | null;
  personal_finance_category?: { primary?: string; detailed?: string } | null;
  [key: string]: unknown;
}

export interface NormalizedProviderTransaction {
  providerTransactionId: string;
  providerAccountId: string;
  postedDate: string;
  description: string;
  merchantName: string | null;
  amount: string;
  direction: "inflow" | "outflow";
  currency: string;
  pending: boolean;
  pendingTransactionId: string | null;
  providerCategory: string | null;
  fingerprint: string;
  rawData: Record<string, unknown>;
}

export function normalizePlaidTransaction(workspaceId: string, value: ProviderTransaction): NormalizedProviderTransaction {
  if (!value.transaction_id || !value.account_id || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(value.amount)) {
    throw new Error("Plaid returned an incomplete transaction record.");
  }
  const signedAmount = Object.is(value.amount, -0) ? 0 : -value.amount;
  if (signedAmount === 0) throw new Error("Plaid returned a zero-value transaction.");
  return {
    providerTransactionId: value.transaction_id,
    providerAccountId: value.account_id,
    postedDate: value.date,
    description: String(value.name || value.merchant_name || "Bank transaction").slice(0, 500),
    merchantName: value.merchant_name ? String(value.merchant_name).slice(0, 200) : null,
    amount: signedAmount.toFixed(2),
    direction: signedAmount > 0 ? "inflow" : "outflow",
    currency: String(value.iso_currency_code || "USD").slice(0, 3).toUpperCase(),
    pending: Boolean(value.pending),
    pendingTransactionId: value.pending_transaction_id ? String(value.pending_transaction_id) : null,
    providerCategory: value.personal_finance_category?.detailed ?? value.personal_finance_category?.primary ?? null,
    fingerprint: createHash("sha256").update(`${workspaceId}\0plaid\0${value.transaction_id}`).digest("hex"),
    // Keep only fields needed to explain and reconcile the imported line. Plaid
    // may add location, counterparties, logos, or other data that Finance Studio
    // does not need; those fields must not be retained by default.
    rawData: {
      transaction_id: value.transaction_id,
      account_id: value.account_id,
      date: value.date,
      authorized_date: value.authorized_date ?? null,
      name: String(value.name || "").slice(0, 500),
      merchant_name: value.merchant_name ? String(value.merchant_name).slice(0, 200) : null,
      amount: value.amount,
      iso_currency_code: value.iso_currency_code ?? null,
      pending: Boolean(value.pending),
      pending_transaction_id: value.pending_transaction_id ?? null,
      personal_finance_category: value.personal_finance_category ?? null,
    },
  };
}

export function reconciliationScore(input: { bankAmount: string; bankDate: string; bankDescription: string; targetAmount: string; targetDate: string; targetDescription?: string | null }) {
  if (toCents(input.bankAmount) !== toCents(input.targetAmount)) return 0;
  const days = Math.abs((Date.parse(`${input.bankDate}T00:00:00Z`) - Date.parse(`${input.targetDate}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days > 14) return 0;
  let score = days <= 1 ? 96 : days <= 3 ? 92 : days <= 7 ? 84 : 72;
  const bankWords = words(input.bankDescription);
  const targetWords = words(input.targetDescription ?? "");
  if (targetWords.some((word) => bankWords.includes(word))) score += 3;
  return Math.min(score, 99);
}

function words(value: string) {
  return value.toLocaleLowerCase("en-US").split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
}
