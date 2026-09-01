import {
  calculateCommission,
  type CommissionCalculationInput,
} from "../../domain/commission.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const COMMISSION_STATUSES = [
  "prospective",
  "under_contract",
  "pending",
  "closed",
  "paid",
  "fell_through",
  "terminated",
  "lost",
  "canceled",
] as const;

export const COMMISSION_SIDES = ["buyer", "seller", "dual", "referral", "other"] as const;

export interface CommissionInput extends CommissionCalculationInput {
  clientId: string | null;
  propertyId: string | null;
  transactionReference: string | null;
  side: (typeof COMMISSION_SIDES)[number];
  status: (typeof COMMISSION_STATUSES)[number];
  leadSource: string | null;
  contractDate: string | null;
  expectedClosingDate: string | null;
  closedDate: string | null;
  hoursInvested: number;
  notes: string | null;
  deviceId: string;
}

export class CommissionInputError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Invalid commission input");
    this.fields = fields;
  }
}

export function parseCommissionInput(value: unknown): CommissionInput {
  const source = isRecord(value) ? value : {};
  const fields: Record<string, string> = {};

  const clientId = optionalUuid(source.clientId, "clientId", fields);
  const propertyId = optionalUuid(source.propertyId, "propertyId", fields);
  const side = enumValue(source.side, COMMISSION_SIDES, "side", fields, "buyer");
  const status = enumValue(source.status, COMMISSION_STATUSES, "status", fields, "pending");
  const salesPrice = moneyValue(source.salesPrice, "salesPrice", fields);
  const flatCommission = moneyValue(source.flatCommission, "flatCommission", fields);

  if (Number(salesPrice) <= 0 && Number(flatCommission) <= 0) {
    fields.salesPrice = "Enter a sales price or a flat commission";
  }

  const commissionRatePct = percentage(
    source.commissionRatePct,
    "commissionRatePct",
    fields,
  );
  if (Number(flatCommission) <= 0 && Number(salesPrice) > 0 && commissionRatePct <= 0) {
    fields.commissionRatePct = "Enter a commission rate or a flat commission";
  }

  const result: CommissionInput = {
    clientId,
    propertyId,
    transactionReference: optionalText(source.transactionReference, 80),
    side,
    status,
    leadSource: optionalText(source.leadSource, 120),
    contractDate: optionalDate(source.contractDate, "contractDate", fields),
    expectedClosingDate: optionalDate(source.expectedClosingDate, "expectedClosingDate", fields),
    closedDate: optionalDate(source.closedDate, "closedDate", fields),
    salesPrice,
    commissionRatePct,
    flatCommission,
    referralFee: moneyValue(source.referralFee, "referralFee", fields),
    referralPct: percentage(source.referralPct, "referralPct", fields),
    brokerageSplitPct: percentage(source.brokerageSplitPct, "brokerageSplitPct", fields),
    teamSplitPct: percentage(source.teamSplitPct, "teamSplitPct", fields),
    franchiseFee: moneyValue(source.franchiseFee, "franchiseFee", fields),
    transactionFee: moneyValue(source.transactionFee, "transactionFee", fields),
    errorsAndOmissionsFee: moneyValue(source.errorsAndOmissionsFee, "errorsAndOmissionsFee", fields),
    administrativeDeductions: moneyValue(source.administrativeDeductions, "administrativeDeductions", fields),
    concession: moneyValue(source.concession, "concession", fields),
    closingDeductions: moneyValue(source.closingDeductions, "closingDeductions", fields),
    taxReservePct: percentage(source.taxReservePct, "taxReservePct", fields),
    hoursInvested: boundedNumber(source.hoursInvested, "hoursInvested", fields, 0, 100_000),
    notes: optionalText(source.notes, 2_000),
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };

  if (calculateCommission(result).netReceived < 0) {
    fields.deductions = "Total deductions cannot exceed gross commission";
  }

  if (Object.keys(fields).length) throw new CommissionInputError(fields);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function optionalUuid(value: unknown, field: string, fields: Record<string, string>): string | null {
  const text = optionalText(value, 36);
  if (!text) return null;
  if (!UUID.test(text)) fields[field] = "Must be a valid identifier";
  return text;
}

function optionalDate(value: unknown, field: string, fields: Record<string, string>): string | null {
  const text = optionalText(value, 10);
  if (!text) return null;
  const match = text.match(ISO_DATE);
  const parsed = match ? new Date(`${text}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    fields[field] = "Use YYYY-MM-DD";
  }
  return text;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
  fields: Record<string, string>,
  fallback: T[number],
): T[number] {
  if (typeof value === "string" && allowed.includes(value)) return value as T[number];
  if (value !== undefined && value !== null && value !== "") fields[field] = "Unsupported value";
  return fallback;
}

function moneyValue(value: unknown, field: string, fields: Record<string, string>): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 9_000_000_000_000) {
    fields[field] = "Enter a valid non-negative amount";
    return "0.00";
  }
  return numeric.toFixed(2);
}

function percentage(value: unknown, field: string, fields: Record<string, string>): number {
  return boundedNumber(value, field, fields, 0, 100);
}

function boundedNumber(
  value: unknown,
  field: string,
  fields: Record<string, string>,
  min: number,
  max: number,
): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    fields[field] = `Enter a number from ${min} to ${max}`;
    return min;
  }
  return numeric;
}
