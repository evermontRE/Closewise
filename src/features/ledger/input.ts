import { toCents, toDecimalString } from "../../domain/money.ts";
import type { VoidInput } from "../directory/input.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TAX_ID_LAST4 = /^\d{4}$/;

export const TRANSACTION_TYPES = [
  "income", "expense", "owner_contribution", "owner_draw", "transfer",
  "refund", "reimbursement",
] as const;
export const RECEIPT_STATUSES = ["none", "attached", "missing", "not_required"] as const;
export const CATEGORY_KINDS = ["income", "expense"] as const;

export interface CategoryInput {
  name: string;
  kind: (typeof CATEGORY_KINDS)[number];
  scheduleCLine: string | null;
  isActive: boolean;
  deviceId: string;
}

export interface TransactionSplitInput {
  categoryId: string | null;
  propertyId: string | null;
  amount: string;
  memo: string | null;
}

export interface TransactionInput {
  transactionDate: string;
  type: (typeof TRANSACTION_TYPES)[number];
  categoryId: string | null;
  clientId: string | null;
  propertyId: string | null;
  commissionId: string | null;
  payee: string | null;
  description: string;
  amount: string;
  paymentMethod: string | null;
  vendorTaxIdLast4: string | null;
  receiptStatus: (typeof RECEIPT_STATUSES)[number];
  notes: string | null;
  splits: TransactionSplitInput[];
  deviceId: string;
}

export class LedgerInputError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Invalid ledger input");
    this.fields = fields;
  }
}

export function parseCategoryInput(value: unknown): CategoryInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const result: CategoryInput = {
    name: requiredText(source.name, "name", 100, fields),
    kind: enumValue(source.kind, CATEGORY_KINDS, "kind", fields, "expense"),
    scheduleCLine: optionalText(source.scheduleCLine, 120),
    isActive: typeof source.isActive === "boolean" ? source.isActive : true,
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };
  if (Object.keys(fields).length) throw new LedgerInputError(fields);
  return result;
}

export function parseTransactionInput(value: unknown): TransactionInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const transactionDate = dateValue(source.transactionDate, "transactionDate", fields);
  const amount = moneyValue(source.amount, "amount", fields, false);
  const splits = Array.isArray(source.splits)
    ? source.splits.slice(0, 100).map((item, index) => parseSplit(item, index, fields))
    : [];

  if (Array.isArray(source.splits) && source.splits.length > 100) {
    fields.splits = "A transaction can have at most 100 split lines";
  }
  if (splits.length > 0) {
    const splitTotal = splits.reduce((total, split) => total + toCents(split.amount), 0);
    if (splitTotal !== toCents(amount)) fields.splits = "Split lines must equal the transaction amount";
  }

  const vendorTaxIdLast4 = optionalText(source.vendorTaxIdLast4, 4);
  if (vendorTaxIdLast4 && !TAX_ID_LAST4.test(vendorTaxIdLast4)) {
    fields.vendorTaxIdLast4 = "Enter exactly four digits";
  }

  const result: TransactionInput = {
    transactionDate,
    type: enumValue(source.type, TRANSACTION_TYPES, "type", fields, "expense"),
    categoryId: optionalUuid(source.categoryId, "categoryId", fields),
    clientId: optionalUuid(source.clientId, "clientId", fields),
    propertyId: optionalUuid(source.propertyId, "propertyId", fields),
    commissionId: optionalUuid(source.commissionId, "commissionId", fields),
    payee: optionalText(source.payee, 160),
    description: requiredText(source.description, "description", 240, fields),
    amount,
    paymentMethod: optionalText(source.paymentMethod, 80),
    vendorTaxIdLast4,
    receiptStatus: enumValue(source.receiptStatus, RECEIPT_STATUSES, "receiptStatus", fields, "none"),
    notes: optionalText(source.notes, 2_000),
    splits,
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };
  if (Object.keys(fields).length) throw new LedgerInputError(fields);
  return result;
}

export function parseLedgerVoidInput(value: unknown): VoidInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const reason = requiredText(source.reason, "reason", 500, fields);
  if (reason && reason.length < 5) fields.reason = "Explain why this record is being removed";
  if (Object.keys(fields).length) throw new LedgerInputError(fields);
  return { reason, deviceId: optionalText(source.deviceId, 120) ?? "web" };
}

function parseSplit(value: unknown, index: number, fields: Record<string, string>): TransactionSplitInput {
  const source = asRecord(value);
  return {
    categoryId: optionalUuid(source.categoryId, `splits.${index}.categoryId`, fields),
    propertyId: optionalUuid(source.propertyId, `splits.${index}.propertyId`, fields),
    amount: moneyValue(source.amount, `splits.${index}.amount`, fields, false),
    memo: optionalText(source.memo, 240),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function requiredText(value: unknown, field: string, max: number, fields: Record<string, string>) {
  const text = optionalText(value, max);
  if (!text) fields[field] = "This field is required";
  return text ?? "";
}

function optionalText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function optionalUuid(value: unknown, field: string, fields: Record<string, string>) {
  const text = optionalText(value, 36);
  if (!text) return null;
  if (!UUID.test(text)) fields[field] = "Must be a valid identifier";
  return text;
}

function dateValue(value: unknown, field: string, fields: Record<string, string>) {
  const text = optionalText(value, 10) ?? "";
  const parsed = ISO_DATE.test(text) ? new Date(`${text}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    fields[field] = "Use YYYY-MM-DD";
  }
  return text;
}

function enumValue<T extends readonly string[]>(
  value: unknown, allowed: T, field: string, fields: Record<string, string>, fallback: T[number],
): T[number] {
  if (typeof value === "string" && allowed.includes(value)) return value as T[number];
  if (value !== undefined && value !== null && value !== "") fields[field] = "Unsupported value";
  return fallback;
}

function moneyValue(value: unknown, field: string, fields: Record<string, string>, allowZero: boolean) {
  try {
    const cents = toCents(value as string | number | null | undefined);
    if (cents < 0 || (!allowZero && cents === 0) || cents > 900_000_000_000_000) throw new Error();
    return toDecimalString(cents);
  } catch {
    fields[field] = allowZero ? "Enter a valid non-negative amount" : "Enter an amount greater than zero";
    return "0.00";
  }
}
