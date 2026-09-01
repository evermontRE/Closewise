import { cents, toCents, toDecimalString } from "./money.ts";

export const RECURRING_CADENCES = ["weekly", "monthly", "quarterly", "semiannual", "annual"] as const;
export type RecurringCadence = (typeof RECURRING_CADENCES)[number];

const OCCURRENCES: Record<RecurringCadence, number> = {
  weekly: 52, monthly: 12, quarterly: 4, semiannual: 2, annual: 1,
};

export function annualizedRecurringAmount(amount: string, cadence: RecurringCadence) {
  return toDecimalString(cents(toCents(amount) * OCCURRENCES[cadence]));
}

export function nextRecurringDate(date: string, cadence: RecurringCadence) {
  const [year, month, day] = date.split("-").map(Number);
  if (cadence === "weekly") return formatUtc(new Date(Date.UTC(year, month - 1, day + 7)));
  const months = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : cadence === "semiannual" ? 6 : 12;
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return formatUtc(new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay))));
}

function formatUtc(date: Date) { return date.toISOString().slice(0, 10); }
