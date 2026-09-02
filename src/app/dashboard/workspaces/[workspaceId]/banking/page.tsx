import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import BankConnections from "./bank-connections";

export default async function BankingPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, role } = await requireWorkspaceAccess(workspaceId);
  const { data: workspace } = await supabase.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle();
  if (!workspace) notFound();
  return <BankConnections workspaceId={workspace.id} workspaceName={workspace.name} canConnect={role === "owner" || role === "admin"} canSync={role !== "accountant"} />;
}
