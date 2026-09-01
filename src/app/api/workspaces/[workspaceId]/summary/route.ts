import { NextResponse } from "next/server";
import { requireWorkspaceAccess, WorkspaceAccessError } from "@/data/workspace-access";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    const requestedYear = Number.parseInt(new URL(request.url).searchParams.get("year") ?? "", 10);
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
      ? requestedYear
      : new Date().getUTCFullYear();

    const { data, error } = await supabase.rpc("workspace_financial_summary", {
      p_workspace_id: workspaceId,
      p_year: year,
    });

    if (error) return NextResponse.json({ error: "Unable to calculate workspace summary" }, { status: 500 });
    return NextResponse.json({ summary: data });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Summary API error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
  }
}

