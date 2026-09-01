import { NextResponse } from "next/server";
import { listClients, mutateDirectoryRecord } from "@/data/directory";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseClientInput } from "@/features/directory/input";
import { directoryError, mutationId, pagination } from "@/features/directory/http";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    return NextResponse.json(await listClients(supabase, { workspaceId, ...pagination(request) }));
  } catch (error) {
    return directoryError(error, "Clients");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    const record = parseClientInput(await request.json());
    const result = await mutateDirectoryRecord({
      workspaceId,
      actorId: user.id,
      clientMutationId: mutationId(request),
      entity: "client",
      operation: "create",
      record,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return directoryError(error, "Clients");
  }
}
