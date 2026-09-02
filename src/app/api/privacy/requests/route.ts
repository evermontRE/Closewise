import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const TYPES = new Set(["access", "export", "correction", "deletion", "restriction"]);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data, error } = await supabase.from("privacy_requests").select("id,workspace_id,request_type,status,request_details,submitted_at,acknowledged_at,completed_at,updated_at").order("submitted_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load privacy requests." }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    await enforceRateLimit({ action: "privacy-request", subject: user.id, limit: 5, windowSeconds: 3600 });
    const body = await request.json() as { type?: string; workspaceId?: string | null; details?: string | null };
    if (!body.type || !TYPES.has(body.type)) return NextResponse.json({ error: "Select a valid privacy request type." }, { status: 400 });
    if (body.details && body.details.length > 2000) return NextResponse.json({ error: "Request details must be 2,000 characters or fewer." }, { status: 400 });
    if (body.workspaceId) {
      const { data } = await supabase.from("workspace_members").select("workspace_id").eq("workspace_id", body.workspaceId).eq("user_id", user.id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Workspace not found or not a member." }, { status: 404 });
    }
    const { data, error } = await createAdminClient().from("privacy_requests").insert({ requester_id: user.id, workspace_id: body.workspaceId ?? null, request_type: body.type, request_details: body.details?.trim() || null }).select("id,request_type,status,submitted_at").single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (cause) {
    if (cause instanceof RateLimitError) return NextResponse.json({ error: cause.message }, { status: 429, headers: { "Retry-After": String(cause.retryAfterSeconds) } });
    if (cause instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    console.error("Privacy request error", cause instanceof Error ? cause.message : "Unknown error");
    return NextResponse.json({ error: "Unable to submit the privacy request." }, { status: 500 });
  }
}
