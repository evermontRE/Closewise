import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankAccountInput, BankImportInput, BankReviewInput, BankVoidInput } from "@/features/bank/input";
import { createAdminClient } from "@/lib/supabase/admin";

export class BankWorkflowError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 428, message: string) { super(message); }
}

export async function listBankAccounts(supabase: SupabaseClient, workspaceId: string) {
  const { data, error } = await supabase.from("bank_accounts")
    .select("id, institution_name, account_name, account_type, mask, currency, last_reconciled_through, is_active, version, created_at, updated_at")
    .eq("workspace_id", workspaceId).is("deleted_at", null).order("account_name");
  if (error) throw new Error(`Unable to load bank accounts: ${error.message}`);
  return { items: (data ?? []).map(bankAccountDto) };
}

export async function getBankAccount(supabase: SupabaseClient, workspaceId: string, accountId: string) {
  const { data, error } = await supabase.from("bank_accounts")
    .select("id, institution_name, account_name, account_type, mask, currency, last_reconciled_through, is_active, version, created_at, updated_at")
    .eq("workspace_id", workspaceId).eq("id", accountId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Unable to load bank account: ${error.message}`);
  if (!data) throw new BankWorkflowError(404, "Bank account not found");
  return bankAccountDto(data);
}

export async function listBankImports(supabase: SupabaseClient, workspaceId: string, accountId: string) {
  let query = supabase.from("bank_imports")
    .select("id, bank_account_id, file_name, row_count, imported_at")
    .eq("workspace_id", workspaceId).order("imported_at", { ascending: false }).limit(100);
  if (accountId) query = query.eq("bank_account_id", accountId);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load bank imports: ${error.message}`);
  return { items: (data ?? []).map((row) => ({ id: String(row.id), bankAccountId: nullableString(row.bank_account_id), fileName: nullableString(row.file_name), rowCount: Number(row.row_count), importedAt: String(row.imported_at) })) };
}

export async function listBankTransactions(
  supabase: SupabaseClient,
  input: { workspaceId: string; page: number; pageSize: number; from: number; status: string; accountId: string },
) {
  let query = supabase.from("bank_transactions")
    .select("id, bank_account_id, bank_import_id, posted_date, description, amount, direction, status, merchant_name, category_id, client_id, property_id, match_confidence, reviewed_at, reconciled_at, ignored_reason, version, created_at, updated_at, bank_matches(transaction_id, commission_id, matched_at, voided_at)", { count: "exact" })
    .eq("workspace_id", input.workspaceId).is("deleted_at", null)
    .order("review_priority", { ascending: false }).order("posted_date", { ascending: false })
    .range(input.from, input.from + input.pageSize - 1);
  if (input.status) query = query.eq("status", input.status);
  else query = query.in("status", ["new", "categorized", "matched"]);
  if (input.accountId) query = query.eq("bank_account_id", input.accountId);
  const { data, error, count } = await query;
  if (error) throw new Error(`Unable to load bank transactions: ${error.message}`);
  return { items: (data ?? []).map(bankTransactionDto), page: input.page, pageSize: input.pageSize, total: count ?? 0 };
}

export async function mutateBankAccount(input: {
  workspaceId: string; actorId: string; clientMutationId: string;
  operation: "create" | "update" | "void"; entityId?: string; expectedVersion?: number;
  record: BankAccountInput | BankVoidInput;
}) {
  const payloadHash = hashJson({ operation: input.operation, entityId: input.entityId ?? null, expectedVersion: input.expectedVersion ?? null, record: input.record });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mutate_bank_account", {
    p_workspace_id: input.workspaceId, p_actor_id: input.actorId,
    p_client_mutation_id: input.clientMutationId, p_operation: input.operation,
    p_entity_id: input.entityId ?? null, p_expected_version: input.expectedVersion ?? null,
    p_payload_hash: payloadHash, p_record: input.record,
  });
  if (error) throw mapBankError(error.message);
  return data as { id: string; operation: string; version: number };
}

export async function importBankStatement(input: { workspaceId: string; actorId: string; import: BankImportInput }) {
  const fileHash = createHash("sha256").update(input.import.bankAccountId).update("\0").update(input.import.csvText).digest("hex");
  const occurrences = new Map<string, number>();
  const rows = input.import.rows.map((row) => {
    const basis = row.providerTransactionId
      ? `provider:${row.providerTransactionId}`
      : `${row.postedDate}|${row.amount}|${normalizeDescription(row.description)}`;
    const occurrence = (occurrences.get(basis) ?? 0) + 1;
    occurrences.set(basis, occurrence);
    const fingerprint = createHash("sha256").update(input.import.bankAccountId).update("\0").update(basis).update("\0").update(String(occurrence)).digest("hex");
    return { ...row, fingerprint };
  });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("import_bank_statement", {
    p_workspace_id: input.workspaceId, p_actor_id: input.actorId,
    p_bank_account_id: input.import.bankAccountId, p_file_name: input.import.fileName,
    p_file_hash: fileHash, p_device_id: input.import.deviceId, p_rows: rows,
  });
  if (error) throw mapBankError(error.message);
  return data as { id: string; imported: number; duplicates: number; total: number };
}

export async function reviewBankTransaction(input: {
  workspaceId: string; actorId: string; bankTransactionId: string;
  clientMutationId: string; expectedVersion: number; review: BankReviewInput;
}) {
  const payloadHash = hashJson({ bankTransactionId: input.bankTransactionId, expectedVersion: input.expectedVersion, review: input.review });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("review_bank_transaction", {
    p_workspace_id: input.workspaceId, p_actor_id: input.actorId,
    p_bank_transaction_id: input.bankTransactionId, p_client_mutation_id: input.clientMutationId,
    p_expected_version: input.expectedVersion, p_payload_hash: payloadHash, p_review: input.review,
  });
  if (error) throw mapBankError(error.message);
  return data as { id: string; status: string; version: number; ledgerTransactionId?: string };
}

function mapBankError(message: string) {
  if (message.includes("Record version conflict")) return new BankWorkflowError(409, "This bank line changed. Reload it before continuing.");
  if (message.includes("Idempotency key") || message.includes("already imported")) return new BankWorkflowError(409, message.replace(/^.*?: /, ""));
  if (message.includes("not found")) return new BankWorkflowError(404, "The requested bank record was not found.");
  if (message.includes("must") || message.includes("required") || message.includes("does not") || message.includes("cannot") || message.includes("not available") || message.includes("already matched") || message.includes("Choose a specific")) return new BankWorkflowError(400, message.replace(/^.*?: /, ""));
  return new Error(`Unable to complete bank workflow: ${message}`);
}

function hashJson(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function normalizeDescription(value: string) { return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim(); }
function nullableString(value: unknown) { return value === null || value === undefined ? null : String(value); }
function bankAccountDto(row: Record<string, unknown>) { return { id: String(row.id), institutionName: nullableString(row.institution_name), accountName: String(row.account_name), accountType: String(row.account_type), mask: nullableString(row.mask), currency: String(row.currency), lastReconciledThrough: nullableString(row.last_reconciled_through), isActive: Boolean(row.is_active), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function bankTransactionDto(row: Record<string, unknown>) {
  const matches = Array.isArray(row.bank_matches)
    ? row.bank_matches.filter((item) => (item as Record<string, unknown>).voided_at === null)
    : [];
  const match = matches.length ? matches[0] as Record<string, unknown> : null;
  return {
    id: String(row.id), bankAccountId: nullableString(row.bank_account_id), bankImportId: nullableString(row.bank_import_id),
    postedDate: String(row.posted_date), description: String(row.description), amount: String(row.amount), direction: String(row.direction),
    status: String(row.status), merchantName: nullableString(row.merchant_name), categoryId: nullableString(row.category_id),
    clientId: nullableString(row.client_id), propertyId: nullableString(row.property_id), matchConfidence: row.match_confidence === null ? null : Number(row.match_confidence),
    match: match ? { transactionId: nullableString(match.transaction_id), commissionId: nullableString(match.commission_id), matchedAt: String(match.matched_at) } : null,
    reviewedAt: nullableString(row.reviewed_at), reconciledAt: nullableString(row.reconciled_at), ignoredReason: nullableString(row.ignored_reason),
    version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}
