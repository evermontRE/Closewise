import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import OnboardingFlow from "./onboarding-flow";

export default async function OnboardingPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase } = await requireWorkspaceAccess(workspaceId);
  const [{ data: workspace }, { data: onboarding }] = await Promise.all([
    supabase.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_onboarding").select("current_step,business_type,tax_year,opening_balance_cents,setup_method,completed_at").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!workspace) notFound();
  return <OnboardingFlow workspaceId={workspaceId} workspaceName={workspace.name} initial={onboarding} />;
}
