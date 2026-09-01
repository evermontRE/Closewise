const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY = /^[A-Z]{2}$/;

export interface ClientInput {
  displayName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  deviceId: string;
}

export interface PropertyInput {
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  normalizedAddress: string;
  notes: string | null;
  deviceId: string;
}

export interface VoidInput {
  reason: string;
  deviceId: string;
}

export class DirectoryInputError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Invalid directory input");
    this.fields = fields;
  }
}

export function parseClientInput(value: unknown): ClientInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const displayName = requiredText(source.displayName, "displayName", 160, fields);
  const email = optionalText(source.email, 254)?.toLowerCase() ?? null;

  if (email && !EMAIL.test(email)) fields.email = "Enter a valid email address";

  const result: ClientInput = {
    displayName,
    email,
    phone: optionalText(source.phone, 40),
    source: optionalText(source.source, 120),
    notes: optionalText(source.notes, 2_000),
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };

  if (Object.keys(fields).length) throw new DirectoryInputError(fields);
  return result;
}

export function parsePropertyInput(value: unknown): PropertyInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const addressLine1 = requiredText(source.addressLine1, "addressLine1", 200, fields);
  const addressLine2 = optionalText(source.addressLine2, 200);
  const city = optionalText(source.city, 120);
  const region = optionalText(source.region, 60);
  const postalCode = optionalText(source.postalCode, 20);
  const country = (typeof source.country === "string" && source.country.trim()
    ? source.country.trim()
    : "US").toUpperCase();

  if (!COUNTRY.test(country)) fields.country = "Use a two-letter country code";

  const result: PropertyInput = {
    addressLine1,
    addressLine2,
    city,
    region,
    postalCode,
    country,
    normalizedAddress: normalizeAddress([
      addressLine1,
      addressLine2,
      city,
      region,
      postalCode,
      country,
    ]),
    notes: optionalText(source.notes, 2_000),
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };

  if (Object.keys(fields).length) throw new DirectoryInputError(fields);
  return result;
}

export function parseVoidInput(value: unknown): VoidInput {
  const source = asRecord(value);
  const fields: Record<string, string> = {};
  const reason = requiredText(source.reason, "reason", 500, fields);
  if (reason && reason.length < 5) fields.reason = "Explain why this record is being removed";

  if (Object.keys(fields).length) throw new DirectoryInputError(fields);
  return {
    reason,
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredText(
  value: unknown,
  field: string,
  max: number,
  fields: Record<string, string>,
) {
  const text = optionalText(value, max);
  if (!text) fields[field] = "This field is required";
  return text ?? "";
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function normalizeAddress(parts: Array<string | null>) {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(", ")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
