/**
 * Plan definitions. `modules` and `caps` mirror the EDITIONS map in the
 * legacy Finance Studio client (legacy/finance-studio.html) so a plan means
 * the same thing on the server as it did in the offline-only build.
 */
export type PlanId = "essentials" | "professional" | "complete";

export interface Plan {
  id: PlanId;
  name: string;
  tag: string;
  priceMonthlyUsd: number;
  stripePriceEnvVar: string;
  modules: string[];
  caps: {
    reportTypes: string[] | "all";
    insights: "basic" | "full";
    forecastMonths: number;
    multiYear: boolean;
    splitEntries: boolean;
    customCategories: boolean;
  };
}

export const PLAN_ORDER: PlanId[] = ["essentials", "professional", "complete"];

export const PLANS: Record<PlanId, Plan> = {
  essentials: {
    id: "essentials",
    name: "Closewise Essentials",
    tag: "Know what you earned and what you can spend.",
    priceMonthlyUsd: 19,
    stripePriceEnvVar: "STRIPE_PRICE_ESSENTIALS",
    modules: ["dashboard", "commissions", "ledger", "mileage", "goals", "reports", "audit", "marketplace", "settings"],
    caps: {
      reportTypes: ["pl", "commissions", "pending", "expenses", "mileage", "goals"],
      insights: "basic",
      forecastMonths: 0,
      multiYear: false,
      splitEntries: false,
      customCategories: false,
    },
  },
  professional: {
    id: "professional",
    name: "Closewise Professional",
    tag: "Plan taxes, protect margin, and see which deals actually pay.",
    priceMonthlyUsd: 49,
    stripePriceEnvVar: "STRIPE_PRICE_PROFESSIONAL",
    modules: [
      "dashboard", "bank", "commissions", "ledger", "mileage", "tax", "deals", "properties",
      "budget", "subscriptions", "timeline", "goals", "reports", "audit", "insights", "marketplace", "settings",
    ],
    caps: {
      reportTypes: ["pl", "commissions", "pending", "expenses", "categories", "mileage", "quarterly", "organizer", "schedulec", "deals", "subscriptions", "budget", "cashflow", "goals"],
      insights: "full",
      forecastMonths: 6,
      multiYear: false,
      splitEntries: true,
      customCategories: true,
    },
  },
  complete: {
    id: "complete",
    name: "Closewise Complete",
    tag: "Full business intelligence — lifetime value, multi-year, forecasting.",
    priceMonthlyUsd: 99,
    stripePriceEnvVar: "STRIPE_PRICE_COMPLETE",
    modules: [
      "dashboard", "bank", "commissions", "ledger", "mileage", "tax", "deals", "properties", "clients",
      "budget", "subscriptions", "timeline", "goals", "reports", "audit", "insights", "marketplace", "settings",
    ],
    caps: {
      reportTypes: "all",
      insights: "full",
      forecastMonths: 12,
      multiYear: true,
      splitEntries: true,
      customCategories: true,
    },
  },
};

export function isPlanId(value: string): value is PlanId {
  return value === "essentials" || value === "professional" || value === "complete";
}

export function planFromStripePriceId(priceId: string): PlanId | null {
  for (const id of PLAN_ORDER) {
    if (process.env[PLANS[id].stripePriceEnvVar] === priceId) return id;
  }
  return null;
}
