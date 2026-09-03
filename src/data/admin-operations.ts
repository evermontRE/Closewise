import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function searchOperationalWorkspaces(admin: SupabaseClient, query: string, limit = 25) {
  const clean = query.trim().slice(0, 100);
  let request = admin
    .from("workspaces")
    .select("id,name,owner_id,stripe_customer_id,created_at,subscriptions(plan,status,current_period_end,grace_period_end),workspace_operational_status(status,reason,updated_at)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (clean) {
    const safe = clean.replace(/[^a-zA-Z0-9 .@_-]/g, "");
    if (/^[0-9a-f-]{36}$/i.test(safe)) request = request.or(`name.ilike.%${safe}%,id.eq.${safe}`);
    else if (/^cus_[a-zA-Z0-9]+$/.test(safe)) request = request.or(`name.ilike.%${safe}%,stripe_customer_id.eq.${safe}`);
    else request = request.ilike("name", `%${safe}%`);
  }
  const { data, error } = await request;
  if (error) throw error;

  return Promise.all((data ?? []).map(async (workspace) => {
    const { data: owner } = await admin.auth.admin.getUserById(workspace.owner_id);
    const operational = first(workspace.workspace_operational_status);
    return {
      id: workspace.id,
      name: workspace.name,
      ownerEmail: owner.user?.email ?? "Unavailable",
      stripeCustomerId: workspace.stripe_customer_id,
      createdAt: workspace.created_at,
      subscription: first(workspace.subscriptions),
      operationalStatus: operational?.status ?? "active",
      operationalReason: operational?.reason ?? null,
      operationalUpdatedAt: operational?.updated_at ?? null,
    };
  }));
}

export async function getOperationalWorkspace(admin: SupabaseClient, workspaceId: string) {
  const { data: workspace, error } = await admin
    .from("workspaces")
    .select("id,name,owner_id,stripe_customer_id,created_at,subscriptions(*),workspace_operational_status(*)")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!workspace) return null;

  const [{ data: owner }, notes, reviews, audits, billing, banks, privacy] = await Promise.all([
    admin.auth.admin.getUserById(workspace.owner_id),
    admin.from("support_notes").select("id,note,reason,created_at,author_id").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(25),
    admin.from("support_review_sessions").select("id,staff_id,reason,started_at,expires_at,ended_at").eq("workspace_id", workspaceId).order("started_at", { ascending: false }).limit(10),
    admin.from("platform_audit_events").select("id,actor_id,action,reason,created_at,before_data,after_data").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
    admin.from("billing_events").select("id,event_type,subscription_status,plan,occurred_at").eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }).limit(15),
    admin.from("bank_connections").select("status,error_code,last_sync_succeeded_at").eq("workspace_id", workspaceId),
    admin.from("privacy_requests").select("status,request_type,submitted_at").eq("workspace_id", workspaceId).order("submitted_at", { ascending: false }).limit(10),
  ]);
  for (const result of [notes, reviews, audits, billing, banks, privacy]) if (result.error) throw result.error;

  return {
    id: workspace.id,
    name: workspace.name,
    ownerEmail: owner.user?.email ?? "Unavailable",
    stripeCustomerId: workspace.stripe_customer_id,
    createdAt: workspace.created_at,
    subscription: first(workspace.subscriptions),
    operations: first(workspace.workspace_operational_status) ?? { status: "active", reason: null, updated_at: null },
    notes: notes.data ?? [],
    reviews: reviews.data ?? [],
    auditEvents: audits.data ?? [],
    billingEvents: billing.data ?? [],
    bankConnections: banks.data ?? [],
    privacyRequests: privacy.data ?? [],
  };
}

export async function getReliabilityOverview(admin: SupabaseClient) {
  const [health, alerts, maintenance, backups] = await Promise.all([
    admin.from("service_health_checks").select("service,status,summary,metrics,checked_at").order("service"),
    admin.from("operational_alerts").select("alert_key,service,severity,status,summary,occurrence_count,last_seen_at,resolved_at").order("last_seen_at", { ascending: false }).limit(50),
    admin.from("maintenance_runs").select("id,status,request_id,metrics,error_message,started_at,finished_at").order("started_at", { ascending: false }).limit(20),
    admin.from("backup_verifications").select("id,backup_reference,verification_type,status,backup_created_at,verified_at,notes").order("verified_at", { ascending: false }).limit(20),
  ]);
  for (const result of [health, alerts, maintenance, backups]) if (result.error) throw result.error;
  return { health: health.data ?? [], alerts: alerts.data ?? [], maintenance: maintenance.data ?? [], backups: backups.data ?? [] };
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}
