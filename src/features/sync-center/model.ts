import type { OfflineMutation } from "../../lib/offline/types.ts";

export const MAX_LEGACY_BACKUP_BYTES = 25 * 1024 * 1024;

export const collectionLabels: Record<string, string> = {
  categories: "Categories",
  clients: "Clients",
  commissions: "Commissions",
  ledger: "Income and expenses",
  trips: "Mileage trips",
  subscriptions: "Recurring expenses",
  taxPayments: "Tax payments",
  reserveMoves: "Tax reserve transfers",
};

export function readLegacyFile(text: string, size: number) {
  if (size > MAX_LEGACY_BACKUP_BYTES) throw new Error("Choose a Finance Studio backup smaller than 25 MB.");
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error("This file is not a valid Finance Studio JSON backup.");
  }
}

export function mutationTitle(item: Pick<OfflineMutation, "method" | "url">) {
  const segments = item.url.split("?")[0].split("/").filter(Boolean);
  const last = segments.at(-1) ?? "record";
  const endpoint = /^\d+$/.test(last) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(last) ? segments.at(-2) ?? "record" : last;
  const words = endpoint.replaceAll("-", " ");
  const action = item.method === "POST" ? "Create" : item.method === "DELETE" ? "Remove" : "Update";
  return `${action} ${words}`;
}

export function shortDeviceId(id: string) {
  const part = id.replace(/^device-/, "").split("-")[0];
  return part ? part.toUpperCase() : "UNKNOWN";
}

export function totalRecords(counts: Record<string, { source?: number }>) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value.source ?? 0), 0);
}
