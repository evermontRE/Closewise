import { cents, toCents, toDecimalString } from "../../domain/money.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

export const BANK_ACCOUNT_TYPES = ["checking", "savings", "credit_card", "loan", "other"] as const;
export const BANK_REVIEW_ACTIONS = ["categorize", "match", "reconcile", "ignore"] as const;

export interface BankAccountInput {
  institutionName: string | null;
  accountName: string;
  accountType: (typeof BANK_ACCOUNT_TYPES)[number];
  mask: string | null;
  currency: string;
  isActive: boolean;
  deviceId: string;
}

export interface ImportedBankRow {
  postedDate: string;
  description: string;
  amount: string;
  merchantName: string | null;
  providerTransactionId: string | null;
  rawData: Record<string, string>;
}

export interface BankImportInput {
  bankAccountId: string;
  fileName: string;
  csvText: string;
  rows: ImportedBankRow[];
  deviceId: string;
}

export interface BankReviewInput {
  action: (typeof BANK_REVIEW_ACTIONS)[number];
  categoryId: string | null;
  clientId: string | null;
  propertyId: string | null;
  targetType: "transaction" | "commission" | null;
  targetId: string | null;
  matchConfidence: number | null;
  reason: string | null;
  deviceId: string;
}

export interface BankVoidInput { reason: string; deviceId: string }

export class BankInputError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super("Invalid bank workflow input");
    this.fields = fields;
  }
}

export function parseBankAccountInput(value: unknown): BankAccountInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const currency = (optionalText(source.currency, 3) ?? "USD").toUpperCase();
  if (!CURRENCY.test(currency)) fields.currency = "Use a three-letter currency code";
  const result: BankAccountInput = {
    institutionName: optionalText(source.institutionName, 160),
    accountName: requiredText(source.accountName, "accountName", 160, fields),
    accountType: enumValue(source.accountType, BANK_ACCOUNT_TYPES, "accountType", fields, "checking"),
    mask: optionalText(source.mask, 8),
    currency,
    isActive: typeof source.isActive === "boolean" ? source.isActive : true,
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };
  if (Object.keys(fields).length) throw new BankInputError(fields);
  return result;
}

export function parseBankImportInput(value: unknown): BankImportInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const bankAccountId = uuidValue(source.bankAccountId, "bankAccountId", fields);
  const fileName = requiredText(source.fileName, "fileName", 240, fields);
  const csvText = typeof source.csvText === "string" ? source.csvText : "";
  if (!csvText.trim()) fields.csvText = "Select a non-empty CSV statement";
  if (new TextEncoder().encode(csvText).byteLength > MAX_CSV_BYTES) fields.csvText = "CSV files are limited to 5 MB";

  let rows: ImportedBankRow[] = [];
  if (!fields.csvText) {
    try {
      rows = normalizeCsv(csvText, asRecord(source.mapping));
    } catch (error) {
      fields.csvText = error instanceof Error ? error.message : "Unable to read this CSV";
    }
  }
  if (Object.keys(fields).length) throw new BankInputError(fields);
  return { bankAccountId, fileName, csvText, rows, deviceId: optionalText(source.deviceId, 120) ?? "web" };
}

export function parseBankReviewInput(value: unknown): BankReviewInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const action = enumValue(source.action, BANK_REVIEW_ACTIONS, "action", fields, "categorize");
  const categoryId = optionalUuid(source.categoryId, "categoryId", fields);
  const clientId = optionalUuid(source.clientId, "clientId", fields);
  const propertyId = optionalUuid(source.propertyId, "propertyId", fields);
  const targetType = source.targetType === "transaction" || source.targetType === "commission" ? source.targetType : null;
  const targetId = optionalUuid(source.targetId, "targetId", fields);
  const reason = optionalText(source.reason, 500);
  let matchConfidence: number | null = null;
  if (source.matchConfidence !== undefined && source.matchConfidence !== null && source.matchConfidence !== "") {
    const numeric = Number(source.matchConfidence);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) fields.matchConfidence = "Enter a number from 0 to 100";
    else matchConfidence = Math.round(numeric);
  }
  if (action === "categorize" && !categoryId) fields.categoryId = "Choose a specific category";
  if (action === "match" && (!targetType || !targetId)) fields.targetId = "Choose a transaction or commission to match";
  if (action === "ignore" && (!reason || reason.length < 5)) fields.reason = "Explain why this bank line should be ignored";
  if (Object.keys(fields).length) throw new BankInputError(fields);
  return {
    action, categoryId, clientId, propertyId, targetType, targetId, matchConfidence, reason,
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };
}

export function parseBankVoidInput(value: unknown): BankVoidInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const reason = requiredText(source.reason, "reason", 500, fields);
  if (reason && reason.length < 5) fields.reason = "Explain why this account is being removed";
  if (Object.keys(fields).length) throw new BankInputError(fields);
  return { reason, deviceId: optionalText(source.deviceId, 120) ?? "web" };
}

function normalizeCsv(csvText: string, mapping: Record<string, unknown>): ImportedBankRow[] {
  const table = parseCsv(csvText);
  if (table.length < 2) throw new Error("The CSV must contain a header and at least one transaction");
  if (table.length - 1 > MAX_ROWS) throw new Error("CSV imports are limited to 10,000 rows");
  const headers = table[0].map((header) => header.trim());
  const normalizedHeaders = headers.map(normalizeHeader);
  const column = (key: string, fallback: string, required = false) => {
    const requested = optionalText(mapping[key], 120) ?? fallback;
    const index = normalizedHeaders.indexOf(normalizeHeader(requested));
    if (required && index < 0) throw new Error(`Missing required column: ${requested}`);
    return index;
  };
  const dateIndex = column("dateColumn", "date", true);
  const descriptionIndex = column("descriptionColumn", "description", true);
  const amountIndex = column("amountColumn", "amount");
  const debitIndex = column("debitColumn", "debit");
  const creditIndex = column("creditColumn", "credit");
  const merchantIndex = column("merchantColumn", "merchant");
  const idIndex = column("idColumn", "id");
  if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0) throw new Error("Missing an amount column or debit/credit columns");

  return table.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row, offset) => {
    const postedDate = parseDate(row[dateIndex] ?? "");
    const description = (row[descriptionIndex] ?? "").trim().slice(0, 500);
    if (!description) throw new Error(`Row ${offset + 2}: description is required`);
    const amount = amountIndex >= 0
      ? parseAmount(row[amountIndex] ?? "", offset + 2)
      : toDecimalString(cents(
        toCents(row[creditIndex] ? parseAmount(row[creditIndex], offset + 2) : 0)
        - toCents(row[debitIndex] ? parseAmount(row[debitIndex], offset + 2) : 0),
      ));
    if (toCents(amount) === 0) throw new Error(`Row ${offset + 2}: amount cannot be zero`);
    return {
      postedDate, description, amount,
      merchantName: merchantIndex < 0 ? null : optionalText(row[merchantIndex], 200),
      providerTransactionId: idIndex < 0 ? null : optionalText(row[idIndex], 200),
      rawData: Object.fromEntries(headers.map((header, index) => [header.slice(0, 120), (row[index] ?? "").slice(0, 1_000)])),
    };
  });
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function parseAmount(value: string, rowNumber: number) {
  const trimmed = value.trim();
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[,$\s()]/g, "");
  try {
    const amountCents = toCents(cleaned || 0);
    return toDecimalString(negative ? cents(-amountCents) : amountCents);
  } catch {
    throw new Error(`Row ${rowNumber}: amount is invalid`);
  }
}

function parseDate(value: string) {
  const text = value.trim();
  let normalized = text;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) normalized = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? new Date(`${normalized}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`Invalid transaction date: ${text || "blank"}`);
  }
  return normalized;
}

function normalizeHeader(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function asRecord(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function optionalText(value: unknown, max: number) { if (typeof value !== "string") return null; const text = value.trim(); return text ? text.slice(0, max) : null; }
function requiredText(value: unknown, field: string, max: number, fields: Record<string, string>) { const text = optionalText(value, max); if (!text) fields[field] = "This field is required"; return text ?? ""; }
function optionalUuid(value: unknown, field: string, fields: Record<string, string>) { const text = optionalText(value, 36); if (!text) return null; if (!UUID.test(text)) fields[field] = "Must be a valid identifier"; return text; }
function uuidValue(value: unknown, field: string, fields: Record<string, string>) { const text = optionalUuid(value, field, fields); if (!text) fields[field] = "This field is required"; return text ?? ""; }
function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string, fields: Record<string, string>, fallback: T[number]): T[number] { if (typeof value === "string" && allowed.includes(value)) return value as T[number]; if (value !== undefined && value !== null && value !== "") fields[field] = "Unsupported value"; return fallback; }
