import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { evaluateSubscriptionAccess, isMutationMethod, planAllowsModule, workspaceApiModule } from "@/domain/subscription-access";

const WORKSPACE_API = /^\/api\/workspaces\/([0-9a-f-]{36})(?:\/|$)/i;

export async function authorizeWorkspaceApi(request: NextRequest) {
  const match = request.nextUrl.pathname.match(WORKSPACE_API);
  if (!match) return null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = match[1];
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return null;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan,status,current_period_end,grace_period_end")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const access = evaluateSubscriptionAccess({
    plan: subscription?.plan ?? null,
    status: subscription?.status ?? "none",
    currentPeriodEnd: subscription?.current_period_end ?? null,
    gracePeriodEnd: subscription?.grace_period_end ?? null,
  });

  const isExport = request.nextUrl.pathname === `/api/workspaces/${workspaceId}/exports`;
  if (access.mode === "billing_only" && !isExport) {
    return NextResponse.json({ error: "A subscription is required to use this workspace.", code: "subscription_required", access }, { status: 402 });
  }
  if (access.mode === "read_only" && isMutationMethod(request.method) && !isExport) {
    return NextResponse.json({ error: "This workspace is temporarily read-only while billing needs attention.", code: "billing_read_only", access }, { status: 402 });
  }

  const moduleId = workspaceApiModule(request.nextUrl.pathname);
  if (moduleId && !isExport && !planAllowsModule(access.plan, moduleId)) {
    return NextResponse.json({ error: "Upgrade your plan to use this feature.", code: "plan_upgrade_required", module: moduleId, access }, { status: 403 });
  }
  return null;
}
