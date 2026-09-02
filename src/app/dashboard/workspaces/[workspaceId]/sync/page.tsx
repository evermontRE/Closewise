import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/data/workspace-access";
import SyncCenter from "./sync-center";

export default async function SyncCenterPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, role } = await requireWorkspaceAccess(workspaceId);
  const { data: workspace } = await supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle();
  if (!workspace) notFound();

  return <SyncCenter workspaceId={workspace.id} workspaceName={workspace.name} canImport={role === "owner" || role === "admin"} />;
}
