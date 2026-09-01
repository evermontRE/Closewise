export type Cents = number & { readonly __brand: "Cents" };

export type MoneyInput = Cents | number | string | null | undefined;

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

function assertSafeCents(value: number): Cents {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_SAFE_CENTS) {
    throw new RangeError("Money amount exceeds the supported integer-cent range");
  }
  return value as Cents;
}

/** Parse a database decimal or form value into integer cents. */
export function toCents(value: MoneyInput): Cents {
  if (value === null || value === undefined || value === "") return 0 as Cents;

  const text = typeof value === "number" ? value.toString() : String(value).trim();
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);

  if (!match) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) throw new TypeError(`Invalid money value: ${text}`);
    return assertSafeCents(Math.round(numeric * 100));
  }

  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2]);
  const fraction = (match[3] ?? "").padEnd(3, "0");
  const cents = Number(fraction.slice(0, 2));
  const roundDigit = Number(fraction[2] ?? "0");
  return assertSafeCents(sign * (whole * 100 + cents + (roundDigit >= 5 ? 1 : 0)));
}

export function cents(value: number): Cents {
  return assertSafeCents(Math.round(value));
}

export function nonNegative(value: Cents): Cents {
  return (value < 0 ? 0 : value) as Cents;
}

export function add(...values: Cents[]): Cents {
  return assertSafeCents(values.reduce((total, value) => total + value, 0));
}

export function subtract(left: Cents, right: Cents): Cents {
  return assertSafeCents(left - right);
}

/** Convert a percentage such as 2.5 into 250 basis points. */
export function percentToBasisPoints(percent: number | string | null | undefined): number {
  const numeric = Number(percent ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(Math.min(Math.max(numeric, 0), 100) * 100);
}

export function applyBasisPoints(amount: Cents, basisPoints: number): Cents {
  const bounded = Math.min(Math.max(Math.round(basisPoints), 0), 10_000);
  return assertSafeCents(Math.round((amount * bounded) / 10_000));
}

/** Allocate an exact cent total proportionally without losing remainder cents. */
export function allocateProportionally(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) return [];
  const normalized = weights.map((weight) => Math.max(Number.isFinite(weight) ? weight : 0, 0));
  const weightTotal = normalized.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal === 0) return normalized.map(() => 0 as Cents);

  const raw = normalized.map((weight) => (total * weight) / weightTotal);
  const allocated = raw.map((value) => Math.floor(value));
  let remainder = total - allocated.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    allocated[order[index % order.length].index] += 1;
  }

  return allocated.map(assertSafeCents);
}

export function toDecimalString(value: Cents): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

