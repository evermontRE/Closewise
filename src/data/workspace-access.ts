import "server-only";

import { createClient } from "@/lib/supabase/server";

export type WorkspaceRole = "owner" | "admin" | "member" | "bookkeeper" | "accountant";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WorkspaceAccessError extends Error {
  constructor(public readonly status: 401 | 403 | 404, message: string) {
    super(message);
  }
}

export async function requireWorkspaceAccess(workspaceId: string) {
  if (!UUID.test(workspaceId)) {
    throw new WorkspaceAccessError(404, "Workspace not found or not a member");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new WorkspaceAccessError(401, "Not authenticated");

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new WorkspaceAccessError(403, "Unable to verify workspace access");
  if (!membership) throw new WorkspaceAccessError(404, "Workspace not found or not a member");

  return { supabase, user, role: membership.role as WorkspaceRole };
}

export function requireFinancialWriter(role: WorkspaceRole) {
  if (role === "accountant") {
    throw new WorkspaceAccessError(403, "This workspace role is read-only");
  }
}
