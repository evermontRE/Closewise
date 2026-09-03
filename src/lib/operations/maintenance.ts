import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logOperation, safeError } from "./logger";

export async function runProductionMaintenance(requestId: string) {
  const admin = createAdminClient();
  const { data: runId, error: claimError } = await admin.rpc("claim_maintenance_run", { p_request_id: requestId });
  if (claimError) throw claimError;
  if (!runId) return { duplicate: true };
  const started = Date.now();

  try {
    const dbStarted = Date.now();
    const { error: dbError } = await admin.from("subscriptions").select("workspace_id", { count: "exact", head: true });
    if (dbError) throw dbError;
    const databaseLatencyMs = Date.now() - dbStarted;
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 172_800_000).toISOString();

    const [purge, failedStripe, stuckStripe, unhealthyPlaid, stalePlaid, backup] = await Promise.all([
      admin.rpc("purge_expired_security_data"),
      admin.from("stripe_webhook_events").select("event_id", { count: "exact", head: true }).eq("status", "failed").gte("received_at", dayAgo),
      admin.from("stripe_webhook_events").select("event_id", { count: "exact", head: true }).eq("status", "processing").lt("received_at", new Date(Date.now() - 900_000).toISOString()),
      admin.from("bank_connections").select("id", { count: "exact", head: true }).in("status", ["error", "action_required"]),
      admin.from("bank_connections").select("id", { count: "exact", head: true }).eq("status", "healthy").lt("last_sync_succeeded_at", twoDaysAgo),
      admin.from("backup_verifications").select("status,verification_type,verified_at").eq("status", "passed").order("verified_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const result of [purge, failedStripe, stuckStripe, unhealthyPlaid, stalePlaid, backup]) if (result.error) throw result.error;

    const stripeFailures = (failedStripe.count ?? 0) + (stuckStripe.count ?? 0);
    const plaidIssues = (unhealthyPlaid.count ?? 0) + (stalePlaid.count ?? 0);
    const backupAgeHours = backup.data ? Math.floor((Date.now() - new Date(backup.data.verified_at).getTime()) / 3_600_000) : null;
    const backupHealthy = backupAgeHours !== null && backupAgeHours <= 168;
    const metrics = { databaseLatencyMs, stripeFailures, plaidIssues, backupAgeHours, retention: purge.data };

    const healthWrites = await Promise.all([
      recordHealth(admin, "database", databaseLatencyMs < 2_000 ? "healthy" : "degraded", "Database connectivity check completed.", { latencyMs: databaseLatencyMs }),
      recordHealth(admin, "stripe-webhooks", stripeFailures ? "unhealthy" : "healthy", stripeFailures ? "Stripe webhook failures require review." : "Stripe webhook processing is current.", { failures: stripeFailures }),
      recordHealth(admin, "plaid-sync", plaidIssues ? "degraded" : "healthy", plaidIssues ? "One or more bank connections require attention." : "Bank connection health checks passed.", { issues: plaidIssues }),
      recordHealth(admin, "backups", backupHealthy ? "healthy" : backup.data ? "degraded" : "unconfigured", backupHealthy ? "Backup verification is current." : "Backup verification is missing or stale.", { ageHours: backupAgeHours }),
      setAlert(admin, "stripe-webhook-failures", "stripe-webhooks", "critical", stripeFailures ? `${stripeFailures} Stripe webhook failures require review.` : "Stripe webhook processing recovered.", stripeFailures > 0, { failures: stripeFailures }),
      setAlert(admin, "plaid-connection-health", "plaid-sync", "warning", plaidIssues ? `${plaidIssues} bank connections require attention.` : "Bank connection health recovered.", plaidIssues > 0, { issues: plaidIssues }),
      setAlert(admin, "backup-verification-stale", "backups", "critical", backupHealthy ? "Backup verification is current." : "Record and verify a Supabase backup or restore test.", !backupHealthy, { ageHours: backupAgeHours }),
    ]);
    for (const result of healthWrites) if (result.error) throw result.error;
    const { error: finishError } = await admin.rpc("finish_maintenance_run", { p_run_id: runId, p_succeeded: true, p_metrics: metrics, p_error_message: null });
    if (finishError) throw finishError;
    logOperation("info", "production_maintenance_completed", { requestId, durationMs: Date.now() - started, stripeFailures, plaidIssues });
    return { duplicate: false, runId, metrics };
  } catch (error) {
    const message = safeError(error);
    await admin.rpc("finish_maintenance_run", { p_run_id: runId, p_succeeded: false, p_metrics: {}, p_error_message: message });
    logOperation("error", "production_maintenance_failed", { requestId, durationMs: Date.now() - started, error: message });
    throw error;
  }
}

function recordHealth(admin: ReturnType<typeof createAdminClient>, service: string, status: string, summary: string, metrics: Record<string, unknown>) {
  return admin.rpc("record_service_health", { p_service: service, p_status: status, p_summary: summary, p_metrics: metrics });
}

function setAlert(admin: ReturnType<typeof createAdminClient>, key: string, service: string, severity: string, summary: string, open: boolean, details: Record<string, unknown>) {
  return admin.rpc("set_operational_alert", { p_alert_key: key, p_service: service, p_severity: severity, p_summary: summary, p_open: open, p_details: details });
}
