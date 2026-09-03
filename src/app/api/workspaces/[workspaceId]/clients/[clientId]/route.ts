import { NextResponse } from "next/server";
import { getClient, mutateDirectoryRecord } from "@/data/directory";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseClientInput, parseVoidInput } from "@/features/directory/input";
import {
  directoryError,
  expectedVersion,
  mutationId,
  UUID,
} from "@/features/directory/http";

type Context = { params: Promise<{ workspaceId: string; clientId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId, clientId } = await context.params;
    if (!UUID.test(clientId)) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    return NextResponse.json({ client: await getClient(supabase, workspaceId, clientId) });
  } catch (error) {
    return directoryError(error, "Client");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, clientId } = await context.params;
    if (!UUID.test(clientId)) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    const record = parseClientInput(await request.json());
    const result = await mutateDirectoryRecord({
      workspaceId,
      actorId: user.id,
      clientMutationId: mutationId(request),
      entity: "client",
      operation: "update",
      entityId: clientId,
      expectedVersion: expectedVersion(request),
      record,
    });
    return NextResponse.json(result);
  } catch (error) {
    return directoryError(error, "Client");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceId, clientId } = await context.params;
    if (!UUID.test(clientId)) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    const record = parseVoidInput(await request.json());
    const result = await mutateDirectoryRecord({
      workspaceId,
      actorId: user.id,
      clientMutationId: mutationId(request),
      entity: "client",
      operation: "void",
      entityId: clientId,
      expectedVersion: expectedVersion(request),
      record,
    });
    return NextResponse.json(result);
  } catch (error) {
    return directoryError(error, "Client");
  }
}
