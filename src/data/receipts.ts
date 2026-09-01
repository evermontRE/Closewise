import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReceiptCompleteInput, ReceiptIntentInput, ReceiptVoidInput } from "@/features/receipts/input";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "finance-receipts";

export class ReceiptWorkflowError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 428, message: string) { super(message); }
}

export async function listReceipts(supabase: SupabaseClient, input: { workspaceId: string; recordType: string; recordId: string }) {
  let query = supabase.from("attachments")
    .select("id, file_name, mime_type, size_bytes, sha256, record_type, record_id, status, version, verified_at, created_at, updated_at")
    .eq("workspace_id", input.workspaceId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (input.recordType) query = query.eq("record_type", input.recordType);
  if (input.recordId) query = query.eq("record_id", input.recordId);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load receipts: ${error.message}`);
  return { items: (data ?? []).map(receiptDto) };
}

export async function getReceipt(supabase: SupabaseClient, workspaceId: string, receiptId: string) {
  const { data, error } = await supabase.from("attachments")
    .select("id, file_name, mime_type, size_bytes, sha256, record_type, record_id, status, version, verified_at, created_at, updated_at")
    .eq("workspace_id", workspaceId).eq("id", receiptId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Unable to load receipt: ${error.message}`);
  if (!data) throw new ReceiptWorkflowError(404, "Receipt not found");
  return receiptDto(data);
}

export async function createReceiptUploadIntent(input: {
  workspaceId: string; actorId: string; clientMutationId: string; receipt: ReceiptIntentInput;
}) {
  const payloadHash = hashJson(input.receipt);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mutate_receipt_record", {
    p_workspace_id: input.workspaceId, p_actor_id: input.actorId,
    p_client_mutation_id: input.clientMutationId, p_operation: "create",
    p_receipt_id: null, p_expected_version: null, p_payload_hash: payloadHash,
    p_record: input.receipt,
  });
  if (error) throw mapReceiptError(error.message);
  const result = data as { id: string; status: string; storagePath: string; version: number };
  const { data: upload, error: uploadError } = await admin.storage.from(BUCKET).createSignedUploadUrl(result.storagePath, { upsert: false });
  if (uploadError) throw new Error(`Unable to create receipt upload URL: ${uploadError.message}`);
  return { id: result.id, status: result.status, version: result.version, upload: { signedUrl: upload.signedUrl, token: upload.token, path: upload.path } };
}

export async function completeReceiptUpload(input: {
  workspaceId: string; actorId: string; receiptId: string; clientMutationId: string;
  expectedVersion: number; complete: ReceiptCompleteInput;
}) {
  const admin = createAdminClient();
  const receipt = await storageReceipt(admin, input.workspaceId, input.receiptId);
  if (receipt.status !== "pending" && receipt.status !== "ready") throw new ReceiptWorkflowError(409, "This receipt cannot be completed");
  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(String(receipt.storage_path));
  if (downloadError || !blob) throw new ReceiptWorkflowError(400, "Upload the receipt file before completing it");
  const bytes = Buffer.from(await blob.arrayBuffer());
  const detectedMimeType = detectMimeType(bytes);
  if (!detectedMimeType || detectedMimeType !== receipt.mime_type) throw new ReceiptWorkflowError(400, "Uploaded file contents do not match the declared receipt type");
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  const record = { actualSizeBytes: bytes.byteLength, actualSha256, actualMimeType: detectedMimeType, deviceId: input.complete.deviceId };
  const { data, error } = await admin.rpc("mutate_receipt_record", {
    p_workspace_id: input.workspaceId, p_actor_id: input.actorId,
    p_client_mutation_id: input.clientMutationId, p_operation: "finalize",
    p_receipt_id: input.receiptId, p_expected_version: input.expectedVersion,
    p_payload_hash: hashJson({ receiptId: input.receiptId, expectedVersion: input.expectedVersion, record }),
    p_record: record,
  });
  if (error) throw mapReceiptError(error.message);
  return data as { id: string; status: string; version: number };
}

export async function createReceiptDownload(input: { workspaceId: string; receiptId: string }) {
  const admin = createAdminClient();
  const receipt = await storageReceipt(admin, input.workspaceId, input.receiptId);
  if (receipt.status !== "ready") throw new ReceiptWorkflowError(409, "Receipt is not ready to download");
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(String(receipt.storage_path), 60, { download: String(receipt.file_name) });
  if (error) throw new Error(`Unable to create receipt download URL: ${error.message}`);
  return { signedUrl: data.signedUrl, expiresIn: 60 };
}

export async function voidReceipt(input: {
  workspaceId: string; actorId: string; receiptId: string; clientMutationId: string;
  expectedVersion: number; receipt: ReceiptVoidInput;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mutate_receipt_record", {
    p_workspace_id: input.workspaceId, p_actor_id: input.actorId,
    p_client_mutation_id: input.clientMutationId, p_operation: "void",
    p_receipt_id: input.receiptId, p_expected_version: input.expectedVersion,
    p_payload_hash: hashJson({ receiptId: input.receiptId, expectedVersion: input.expectedVersion, record: input.receipt }),
    p_record: input.receipt,
  });
  if (error) throw mapReceiptError(error.message);
  return data as { id: string; status: string; version: number };
}

async function storageReceipt(admin: ReturnType<typeof createAdminClient>, workspaceId: string, receiptId: string) {
  const { data, error } = await admin.from("attachments")
    .select("id, storage_path, file_name, mime_type, size_bytes, declared_sha256, status, version")
    .eq("workspace_id", workspaceId).eq("id", receiptId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Unable to verify receipt: ${error.message}`);
  if (!data) throw new ReceiptWorkflowError(404, "Receipt not found");
  return data;
}

function detectMimeType(bytes: Buffer): string | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
function hashJson(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function mapReceiptError(message: string) {
  if (message.includes("Record version conflict")) return new ReceiptWorkflowError(409, "This receipt changed. Reload it before continuing.");
  if (message.includes("Idempotency key")) return new ReceiptWorkflowError(409, "This request key was already used for different content.");
  if (message.includes("not found")) return new ReceiptWorkflowError(404, "Receipt or linked record not found.");
  if (message.includes("must") || message.includes("required") || message.includes("does not") || message.includes("cannot") || message.includes("mismatch")) return new ReceiptWorkflowError(400, message.replace(/^.*?: /, ""));
  return new Error(`Unable to save receipt: ${message}`);
}
function receiptDto(row: Record<string, unknown>) { return { id: String(row.id), fileName: String(row.file_name), mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes), sha256: row.sha256 === null ? null : String(row.sha256), recordType: String(row.record_type), recordId: String(row.record_id), status: String(row.status), version: Number(row.version), verifiedAt: row.verified_at === null ? null : String(row.verified_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
