const DECIMAL = /^\d+(?:\.\d+)?$/;

export const MILEAGE_RATES: Readonly<Record<number, string>> = { 2026: "0.7250" };

export function defaultMileageRate(dateOrYear: string | number): string {
  const year = typeof dateOrYear === "number" ? dateOrYear : Number.parseInt(dateOrYear.slice(0, 4), 10);
  return MILEAGE_RATES[year] ?? MILEAGE_RATES[2026];
}

export function normalizeMiles(value: unknown): string {
  return normalizeDecimal(value, 2, false);
}

export function normalizeOdometer(value: unknown): string {
  return normalizeDecimal(value, 2, true);
}

export function normalizeMileageRate(value: unknown): string {
  return normalizeDecimal(value, 4, false);
}

export function mileageDeduction(miles: string, rate: string, parking = "0.00", tolls = "0.00"): string {
  const mileHundredths = scaledInteger(miles, 2);
  const rateTenThousandths = scaledInteger(rate, 4);
  const mileageCents = divideRounded(mileHundredths * rateTenThousandths, 10_000);
  return centsString(mileageCents + scaledInteger(parking, 2) + scaledInteger(tolls, 2));
}

function normalizeDecimal(value: unknown, scale: number, allowZero: boolean): string {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!DECIMAL.test(text)) throw new Error("Invalid decimal");
  const amount = scaledInteger(text, scale);
  if (amount < 0 || (!allowZero && amount === 0)) throw new Error("Invalid decimal");
  const divisor = 10 ** scale;
  return `${Math.floor(amount / divisor)}.${(amount % divisor).toString().padStart(scale, "0")}`;
}

function scaledInteger(value: string, scale: number): number {
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}${"0".repeat(scale)}`;
  const kept = padded.slice(0, scale);
  const remainder = padded.slice(scale);
  let result = Number(whole || "0") * 10 ** scale + Number(kept || "0");
  if (!Number.isSafeInteger(result)) throw new Error("Decimal exceeds safe calculation range");
  if (remainder && Number(remainder[0]) >= 5) result += 1;
  return result;
}

function divideRounded(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator)) throw new Error("Calculation exceeds safe range");
  return Math.floor((numerator + denominator / 2) / denominator);
}

function centsString(cents: number) {
  return `${Math.floor(cents / 100)}.${(cents % 100).toString().padStart(2, "0")}`;
}
