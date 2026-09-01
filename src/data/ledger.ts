import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoidInput } from "@/features/directory/input";
import type { CategoryInput, TransactionInput } from "@/features/ledger/input";
import { createAdminClient } from "@/lib/supabase/admin";

export type LedgerEntity = "category" | "transaction";
export type LedgerOperation = "create" | "update" | "void";

export class LedgerMutationError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 428, message: string) {
    super(message);
  }
}

export async function listCategories(supabase: SupabaseClient, workspaceId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, schedule_c_line, is_system, is_active, version, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Unable to load categories: ${error.message}`);
  return { items: (data ?? []).map(categoryDto) };
}

export async function getCategory(supabase: SupabaseClient, workspaceId: string, categoryId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, schedule_c_line, is_system, is_active, version, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", categoryId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Unable to load category: ${error.message}`);
  if (!data) throw new LedgerMutationError(404, "Category not found");
  return categoryDto(data);
}

export async function listTransactions(
  supabase: SupabaseClient,
  input: { workspaceId: string; page: number; pageSize: number; from: number; search: string; type: string; dateFrom: string; dateTo: string },
) {
  let query = supabase
    .from("transactions")
    .select(
      "id, category_id, client_id, property_id, commission_id, transaction_date, type, payee, description, amount, payment_method, vendor_tax_id_last4, receipt_status, source, notes, version, created_at, updated_at, transaction_splits(id, category_id, property_id, amount, memo, deleted_at)",
      { count: "exact" },
    )
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(input.from, input.from + input.pageSize - 1);

  if (input.search) query = query.ilike("description", `%${escapeLike(input.search)}%`);
  if (input.type) query = query.eq("type", input.type);
  if (input.dateFrom) query = query.gte("transaction_date", input.dateFrom);
  if (input.dateTo) query = query.lte("transaction_date", input.dateTo);
  const { data, error, count } = await query;
  if (error) throw new Error(`Unable to load transactions: ${error.message}`);
  return { items: (data ?? []).map(transactionDto), page: input.page, pageSize: input.pageSize, total: count ?? 0 };
}

export async function getTransaction(supabase: SupabaseClient, workspaceId: string, transactionId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, category_id, client_id, property_id, commission_id, transaction_date, type, payee, description, amount, payment_method, vendor_tax_id_last4, receipt_status, source, notes, version, created_at, updated_at, transaction_splits(id, category_id, property_id, amount, memo, deleted_at)")
    .eq("workspace_id", workspaceId)
    .eq("id", transactionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Unable to load transaction: ${error.message}`);
  if (!data) throw new LedgerMutationError(404, "Transaction not found");
  return transactionDto(data);
}

export async function mutateLedgerRecord(input: {
  workspaceId: string;
  actorId: string;
  clientMutationId: string;
  entity: LedgerEntity;
  operation: LedgerOperation;
  entityId?: string;
  expectedVersion?: number;
  record: CategoryInput | TransactionInput | VoidInput;
}) {
  const payloadHash = createHash("sha256").update(JSON.stringify({
    entity: input.entity,
    operation: input.operation,
    entityId: input.entityId ?? null,
    expectedVersion: input.expectedVersion ?? null,
    record: input.record,
  })).digest("hex");
  const splits = input.entity === "transaction" && "splits" in input.record ? input.record.splits : [];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mutate_ledger_record", {
    p_workspace_id: input.workspaceId,
    p_actor_id: input.actorId,
    p_client_mutation_id: input.clientMutationId,
    p_entity_type: input.entity,
    p_operation: input.operation,
    p_entity_id: input.entityId ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_payload_hash: payloadHash,
    p_record: input.record,
    p_splits: splits,
  });
  if (error) throw mapMutationError(error.message);
  return data as { id: string; operation: LedgerOperation; version: number };
}

function mapMutationError(message: string) {
  if (message.includes("Record version conflict")) return new LedgerMutationError(409, "This record changed. Reload it before saving again.");
  if (message.includes("Idempotency key")) return new LedgerMutationError(409, "This request key was already used for different content.");
  if (message.includes("Record not found")) return new LedgerMutationError(404, "Record not found");
  if (message.includes("Referenced record") || message.includes("Category kind") || message.includes("Split lines")) {
    return new LedgerMutationError(400, message.replace(/^.*?: /, ""));
  }
  if (message.includes("duplicate key")) return new LedgerMutationError(409, "A category with this name and type already exists.");
  return new Error(`Unable to save ledger record: ${message}`);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function categoryDto(row: Record<string, unknown>) {
  return {
    id: String(row.id), name: String(row.name), kind: String(row.kind),
    scheduleCLine: row.schedule_c_line === null ? null : String(row.schedule_c_line),
    isSystem: Boolean(row.is_system), isActive: Boolean(row.is_active), version: Number(row.version),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function transactionDto(row: Record<string, unknown>) {
  const splits = Array.isArray(row.transaction_splits)
    ? row.transaction_splits.filter((split) => (split as Record<string, unknown>).deleted_at === null)
    : [];
  return {
    id: String(row.id), categoryId: nullableString(row.category_id), clientId: nullableString(row.client_id),
    propertyId: nullableString(row.property_id), commissionId: nullableString(row.commission_id),
    transactionDate: String(row.transaction_date), type: String(row.type), payee: nullableString(row.payee),
    description: String(row.description), amount: String(row.amount), paymentMethod: nullableString(row.payment_method),
    vendorTaxIdLast4: nullableString(row.vendor_tax_id_last4), receiptStatus: String(row.receipt_status),
    source: String(row.source), notes: nullableString(row.notes), version: Number(row.version),
    splits: splits.map((split) => {
      const item = split as Record<string, unknown>;
      return { id: String(item.id), categoryId: nullableString(item.category_id), propertyId: nullableString(item.property_id), amount: String(item.amount), memo: nullableString(item.memo) };
    }),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}
