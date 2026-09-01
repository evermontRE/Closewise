const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_BYTES = 10 * 1024 * 1024;

export const RECEIPT_RECORD_TYPES = ["transaction", "bank_transaction", "commission"] as const;
export const RECEIPT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export interface ReceiptIntentInput {
  recordType: (typeof RECEIPT_RECORD_TYPES)[number];
  recordId: string;
  fileName: string;
  safeFileName: string;
  mimeType: (typeof RECEIPT_MIME_TYPES)[number];
  sizeBytes: number;
  declaredSha256: string | null;
  deviceId: string;
}

export interface ReceiptCompleteInput { deviceId: string }
export interface ReceiptVoidInput { reason: string; deviceId: string }

export class ReceiptInputError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) { super("Invalid receipt input"); this.fields = fields; }
}

export function parseReceiptIntentInput(value: unknown): ReceiptIntentInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const recordType = enumValue(source.recordType, RECEIPT_RECORD_TYPES, "recordType", fields, "transaction");
  const recordId = uuidValue(source.recordId, "recordId", fields);
  const fileName = requiredText(source.fileName, "fileName", 240, fields);
  const mimeType = enumValue(source.mimeType, RECEIPT_MIME_TYPES, "mimeType", fields, "application/pdf");
  const sizeBytes = Number(source.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_BYTES) fields.sizeBytes = "Receipt files must be between 1 byte and 10 MB";
  const declaredSha256 = optionalText(source.sha256, 64)?.toLowerCase() ?? null;
  if (declaredSha256 && !SHA256.test(declaredSha256)) fields.sha256 = "SHA-256 must contain 64 hexadecimal characters";
  const safeFileName = sanitizeFileName(fileName, mimeType);
  if (Object.keys(fields).length) throw new ReceiptInputError(fields);
  return { recordType, recordId, fileName, safeFileName, mimeType, sizeBytes, declaredSha256, deviceId: optionalText(source.deviceId, 120) ?? "web" };
}

export function parseReceiptCompleteInput(value: unknown): ReceiptCompleteInput {
  const source = asRecord(value);
  return { deviceId: optionalText(source.deviceId, 120) ?? "web" };
}

export function parseReceiptVoidInput(value: unknown): ReceiptVoidInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const reason = requiredText(source.reason, "reason", 500, fields);
  if (reason && reason.length < 5) fields.reason = "Explain why this receipt should be removed";
  if (Object.keys(fields).length) throw new ReceiptInputError(fields);
  return { reason, deviceId: optionalText(source.deviceId, 120) ?? "web" };
}

export function parseReceiptQuery(request: Request) {
  const url = new URL(request.url);
  const recordType = url.searchParams.get("recordType") ?? "";
  const recordId = url.searchParams.get("recordId") ?? "";
  return {
    recordType: RECEIPT_RECORD_TYPES.includes(recordType as (typeof RECEIPT_RECORD_TYPES)[number]) ? recordType : "",
    recordId: UUID.test(recordId) ? recordId : "",
  };
}

function sanitizeFileName(fileName: string, mimeType: string) {
  const expectedExtension = ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mimeType] ?? "bin";
  const stem = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "receipt";
  return `${stem}.${expectedExtension}`;
}
function asRecord(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function optionalText(value: unknown, max: number) { if (typeof value !== "string") return null; const text = value.trim(); return text ? text.slice(0, max) : null; }
function requiredText(value: unknown, field: string, max: number, fields: Record<string, string>) { const text = optionalText(value, max); if (!text) fields[field] = "This field is required"; return text ?? ""; }
function uuidValue(value: unknown, field: string, fields: Record<string, string>) { const text = optionalText(value, 36); if (!text || !UUID.test(text)) fields[field] = "Must be a valid identifier"; return text ?? ""; }
function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string, fields: Record<string, string>, fallback: T[number]): T[number] { if (typeof value === "string" && allowed.includes(value)) return value as T[number]; if (value !== undefined && value !== null && value !== "") fields[field] = "Unsupported value"; return fallback; }
