import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformRole, type PlatformRole } from "@/domain/admin-operations";

export class PlatformAccessError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
  }
}

export type PlatformStaff = { userId: string; role: PlatformRole };

export async function getPlatformStaff(): Promise<PlatformStaff | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_staff")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return data && isPlatformRole(data.role) ? { userId: user.id, role: data.role } : null;
}

export async function requirePlatformStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new PlatformAccessError(401, "Not authenticated");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_staff")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data || !isPlatformRole(data.role)) throw new PlatformAccessError(403, "Platform staff access is required");
  return { admin, user, role: data.role as PlatformRole };
}
