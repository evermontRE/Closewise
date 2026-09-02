import "server-only";
import { createHash } from "node:crypto";
import { normalizePlaidTransaction, type ProviderTransaction } from "@/domain/bank-connectivity";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBankToken, encryptBankToken } from "@/lib/banking/token-vault";
import { PlaidError, plaidRequest, plaidWebhookUrl } from "@/lib/banking/plaid";

type PlaidAccount = { account_id: string; name: string; official_name?: string | null; mask?: string | null; type: string; subtype: string; balances: { current?: number | null; available?: number | null; iso_currency_code?: string | null } };
type ConnectionRow = { id: string; workspace_id: string; access_token_ciphertext: string | null; sync_cursor: string | null; provider_item_id: string };

export async function createPlaidLinkToken(input: { workspaceId: string; userId: string; connectionId?: string | null }) {
  let accessToken: string | undefined;
  if (input.connectionId) {
    const row = await privateConnection(input.workspaceId, input.connectionId);
    if (!row.access_token_ciphertext) throw new Error("Bank connection is disconnected");
    accessToken = decryptBankToken(row.access_token_ciphertext);
  }
  const response = await plaidRequest<{ link_token: string; expiration: string }>("/link/token/create", {
    user: { client_user_id: createHash("sha256").update(input.userId).digest("hex") },
    client_name: "Finance Studio",
    language: "en",
    country_codes: ["US"],
    ...(accessToken ? { access_token: accessToken } : { products: ["transactions"], transactions: { days_requested: 730 } }),
    webhook: plaidWebhookUrl(),
  });
  return { linkToken: response.link_token, expiresAt: response.expiration, mode: accessToken ? "update" : "connect" };
}

export async function exchangePlaidToken(input: { workspaceId: string; actorId: string; publicToken: string }) {
  const exchange = await plaidRequest<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: input.publicToken });
  const accounts = await plaidRequest<{ accounts: PlaidAccount[]; item: { institution_id?: string | null } }>("/accounts/get", { access_token: exchange.access_token });
  let institutionName: string | null = null;
  if (accounts.item.institution_id) {
    const institution = await plaidRequest<{ institution: { name: string } }>("/institutions/get_by_id", { institution_id: accounts.item.institution_id, country_codes: ["US"] });
    institutionName = institution.institution.name;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("connect_plaid_item", { p_workspace_id: input.workspaceId, p_actor_id: input.actorId, p_item_id: exchange.item_id, p_access_token_ciphertext: encryptBankToken(exchange.access_token), p_institution_id: accounts.item.institution_id ?? null, p_institution_name: institutionName, p_accounts: accounts.accounts });
  if (error) throw new Error(`Unable to save the bank connection: ${error.message}`);
  await synchronizePlaidConnection(String((data as { id: string }).id), input.workspaceId);
  return data;
}

export async function listBankConnections(workspaceId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("bank_connections").select("id,provider,institution_name,status,error_code,error_message,consent_expires_at,last_webhook_at,last_sync_started_at,last_sync_succeeded_at,created_at,bank_accounts(id,account_name,account_type,mask,currency,current_balance,available_balance,balance_updated_at,is_active)").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load bank connections: ${error.message}`);
  return { items: (data ?? []).map((row) => ({ id: String(row.id), provider: String(row.provider), institutionName: row.institution_name ? String(row.institution_name) : "Connected institution", status: String(row.status), errorCode: row.error_code ? String(row.error_code) : null, errorMessage: row.error_message ? String(row.error_message) : null, consentExpiresAt: row.consent_expires_at ? String(row.consent_expires_at) : null, lastWebhookAt: row.last_webhook_at ? String(row.last_webhook_at) : null, lastSyncStartedAt: row.last_sync_started_at ? String(row.last_sync_started_at) : null, lastSyncSucceededAt: row.last_sync_succeeded_at ? String(row.last_sync_succeeded_at) : null, accounts: row.bank_accounts ?? [] })) };
}

export async function synchronizePlaidConnection(connectionId: string, workspaceId?: string) {
  const admin = createAdminClient();
  let query = admin.from("bank_connections").select("id,workspace_id,access_token_ciphertext,sync_cursor,provider_item_id").eq("id", connectionId).eq("provider", "plaid");
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("Bank connection not found");
  const connection = data as ConnectionRow;
  try {
    if (!connection.access_token_ciphertext) throw new Error("Bank connection is disconnected");
    const accessToken = decryptBankToken(connection.access_token_ciphertext);
    const originalCursor = connection.sync_cursor;
    let cursor = originalCursor;
    for (let restart = 0; restart < 3; restart += 1) {
      const added: unknown[] = [], modified: unknown[] = [], removed: unknown[] = [];
      try {
        let hasMore = true;
        while (hasMore) {
          const page = await plaidRequest<{ added: ProviderTransaction[]; modified: ProviderTransaction[]; removed: Array<{ transaction_id: string }>; next_cursor: string; has_more: boolean }>("/transactions/sync", { access_token: accessToken, cursor, count: 500, options: { include_original_description: true, personal_finance_category_version: "v2" } });
          added.push(...page.added.map((item) => normalizePlaidTransaction(connection.workspace_id, item)));
          modified.push(...page.modified.map((item) => normalizePlaidTransaction(connection.workspace_id, item)));
          removed.push(...page.removed);
          cursor = page.next_cursor;
          hasMore = page.has_more;
        }
        const applied = await admin.rpc("apply_plaid_transaction_sync", { p_connection_id: connection.id, p_added: added, p_modified: modified, p_removed: removed, p_next_cursor: cursor });
        if (applied.error) throw new Error(applied.error.message);
        return applied.data;
      } catch (cause) {
        if (cause instanceof PlaidError && cause.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && restart < 2) { cursor = originalCursor; continue; }
        throw cause;
      }
    }
  } catch (cause) {
    const code = cause instanceof PlaidError ? cause.code : "SYNC_FAILED";
    const actionRequired = cause instanceof PlaidError && ["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "USER_PERMISSION_REVOKED"].includes(cause.code);
    await admin.from("bank_connections").update({ status: actionRequired ? "action_required" : "error", error_code: code, error_message: cause instanceof Error ? cause.message.slice(0, 500) : "Bank synchronization failed", updated_at: new Date().toISOString() }).eq("id", connection.id);
    throw cause;
  }
}

export async function synchronizePlaidItem(itemId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("bank_connections").select("id").eq("provider", "plaid").eq("provider_item_id", itemId).maybeSingle();
  if (!data) return null;
  await admin.from("bank_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", data.id);
  return synchronizePlaidConnection(String(data.id));
}

export async function recordPlaidWebhook(input: { itemId: string | null; type: string; code: string; rawBody: string; payload: unknown }) {
  const admin = createAdminClient();
  const bodyHash = createHash("sha256").update(input.rawBody).digest("hex");
  let connectionId: string | null = null;
  if (input.itemId) { const { data } = await admin.from("bank_connections").select("id").eq("provider", "plaid").eq("provider_item_id", input.itemId).maybeSingle(); connectionId = data?.id ? String(data.id) : null; }
  const { error } = await admin.from("bank_connection_events").upsert({ connection_id: connectionId, provider: "plaid", event_type: input.type, event_code: input.code, body_sha256: bodyHash, signature_verified: true, payload: input.payload }, { onConflict: "body_sha256", ignoreDuplicates: true });
  if (error) throw new Error(`Unable to record Plaid webhook: ${error.message}`);
  return { connectionId, bodyHash };
}

export async function updatePlaidItemHealth(itemId: string, code: string, payload: Record<string, unknown>) {
  const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
  const errorCode = String(error.error_code ?? code);
  const actionRequired = ["ERROR", "PENDING_EXPIRATION", "USER_PERMISSION_REVOKED"].includes(code) || ["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "USER_PERMISSION_REVOKED"].includes(errorCode);
  await createAdminClient().from("bank_connections").update({ status: actionRequired ? "action_required" : "error", error_code: errorCode, error_message: String(error.error_message ?? "This bank connection needs attention.").slice(0, 500), last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("provider", "plaid").eq("provider_item_id", itemId);
}

export async function disconnectPlaidConnection(input: { workspaceId: string; connectionId: string; actorId: string }) {
  const connection = await privateConnection(input.workspaceId, input.connectionId);
  if (!connection.access_token_ciphertext) return { id: input.connectionId, status: "disconnected", credentialDestroyed: true };
  const accessToken = decryptBankToken(connection.access_token_ciphertext);
  try {
    await plaidRequest("/item/remove", { access_token: accessToken });
  } catch (cause) {
    if (!(cause instanceof PlaidError) || !["INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND"].includes(cause.code)) throw cause;
  }
  const { data, error } = await createAdminClient().rpc("finalize_bank_disconnection", {
    p_connection_id: input.connectionId,
    p_actor_id: input.actorId,
  });
  if (error) throw new Error(`Unable to finalize bank disconnection: ${error.message}`);
  return data;
}

async function privateConnection(workspaceId: string, connectionId: string) {
  const { data, error } = await createAdminClient().from("bank_connections").select("id,workspace_id,access_token_ciphertext,sync_cursor,provider_item_id").eq("workspace_id", workspaceId).eq("id", connectionId).maybeSingle();
  if (error || !data) throw new Error("Bank connection not found");
  return data as ConnectionRow;
}
