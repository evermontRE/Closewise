import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClientInput,
  PropertyInput,
  VoidInput,
} from "@/features/directory/input";
import { createAdminClient } from "@/lib/supabase/admin";

export type DirectoryEntity = "client" | "property";
export type DirectoryOperation = "create" | "update" | "void";

export class DirectoryMutationError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 428, message: string) {
    super(message);
  }
}

export async function listClients(
  supabase: SupabaseClient,
  input: { workspaceId: string; page: number; pageSize: number; from: number; search: string },
) {
  let query = supabase
    .from("clients")
    .select(
      "id, display_name, email, phone, source, notes, version, created_at, updated_at",
      { count: "exact" },
    )
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null)
    .order("display_name", { ascending: true })
    .range(input.from, input.from + input.pageSize - 1);

  if (input.search) query = query.ilike("display_name", `%${escapeLike(input.search)}%`);
  const { data, error, count } = await query;
  if (error) throw new Error(`Unable to load clients: ${error.message}`);

  return {
    items: (data ?? []).map(clientDto),
    page: input.page,
    pageSize: input.pageSize,
    total: count ?? 0,
  };
}

export async function getClient(supabase: SupabaseClient, workspaceId: string, clientId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, display_name, email, phone, source, notes, version, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Unable to load client: ${error.message}`);
  if (!data) throw new DirectoryMutationError(404, "Client not found");
  return clientDto(data);
}

export async function listProperties(
  supabase: SupabaseClient,
  input: { workspaceId: string; page: number; pageSize: number; from: number; search: string },
) {
  let query = supabase
    .from("properties")
    .select(
      "id, address_line_1, address_line_2, city, region, postal_code, country, notes, version, created_at, updated_at",
      { count: "exact" },
    )
    .eq("workspace_id", input.workspaceId)
    .is("deleted_at", null)
    .order("address_line_1", { ascending: true })
    .range(input.from, input.from + input.pageSize - 1);

  if (input.search) query = query.ilike("normalized_address", `%${escapeLike(input.search)}%`);
  const { data, error, count } = await query;
  if (error) throw new Error(`Unable to load properties: ${error.message}`);

  return {
    items: (data ?? []).map(propertyDto),
    page: input.page,
    pageSize: input.pageSize,
    total: count ?? 0,
  };
}

export async function getProperty(
  supabase: SupabaseClient,
  workspaceId: string,
  propertyId: string,
) {
  const { data, error } = await supabase
    .from("properties")
    .select("id, address_line_1, address_line_2, city, region, postal_code, country, notes, version, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Unable to load property: ${error.message}`);
  if (!data) throw new DirectoryMutationError(404, "Property not found");
  return propertyDto(data);
}

export async function mutateDirectoryRecord(input: {
  workspaceId: string;
  actorId: string;
  clientMutationId: string;
  entity: DirectoryEntity;
  operation: DirectoryOperation;
  entityId?: string;
  expectedVersion?: number;
  record: ClientInput | PropertyInput | VoidInput;
}) {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({
      entity: input.entity,
      operation: input.operation,
      entityId: input.entityId ?? null,
      expectedVersion: input.expectedVersion ?? null,
      record: input.record,
    }))
    .digest("hex");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mutate_directory_record", {
    p_workspace_id: input.workspaceId,
    p_actor_id: input.actorId,
    p_client_mutation_id: input.clientMutationId,
    p_entity_type: input.entity,
    p_operation: input.operation,
    p_entity_id: input.entityId ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_payload_hash: payloadHash,
    p_record: input.record,
  });

  if (error) throw mapMutationError(error.message);
  return data as { id: string; operation: DirectoryOperation; version: number };
}

function mapMutationError(message: string) {
  if (message.includes("Record version conflict")) {
    return new DirectoryMutationError(409, "This record changed. Reload it before saving again.");
  }
  if (message.includes("Idempotency key")) {
    return new DirectoryMutationError(409, "This request key was already used for different content.");
  }
  if (message.includes("Record not found")) {
    return new DirectoryMutationError(404, "Record not found");
  }
  return new Error(`Unable to save directory record: ${message}`);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function clientDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    email: row.email === null ? null : String(row.email),
    phone: row.phone === null ? null : String(row.phone),
    source: row.source === null ? null : String(row.source),
    notes: row.notes === null ? null : String(row.notes),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function propertyDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    addressLine1: String(row.address_line_1),
    addressLine2: row.address_line_2 === null ? null : String(row.address_line_2),
    city: row.city === null ? null : String(row.city),
    region: row.region === null ? null : String(row.region),
    postalCode: row.postal_code === null ? null : String(row.postal_code),
    country: String(row.country),
    notes: row.notes === null ? null : String(row.notes),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
