import { NextResponse } from "next/server";
import { getProperty, mutateDirectoryRecord } from "@/data/directory";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parsePropertyInput, parseVoidInput } from "@/features/directory/input";
import {
  directoryError,
  expectedVersion,
  mutationId,
  UUID,
} from "@/features/directory/http";

type Context = { params: Promise<{ workspaceId: string; propertyId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId, propertyId } = await context.params;
    if (!UUID.test(propertyId)) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    return NextResponse.json({ property: await getProperty(supabase, workspaceId, propertyId) });
  } catch (error) {
    return directoryError(error, "Property");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, propertyId } = await context.params;
    if (!UUID.test(propertyId)) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    const record = parsePropertyInput(await request.json());
    const result = await mutateDirectoryRecord({
      workspaceId,
      actorId: user.id,
      clientMutationId: mutationId(request),
      entity: "property",
      operation: "update",
      entityId: propertyId,
      expectedVersion: expectedVersion(request),
      record,
    });
    return NextResponse.json(result);
  } catch (error) {
    return directoryError(error, "Property");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceId, propertyId } = await context.params;
    if (!UUID.test(propertyId)) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);
    const record = parseVoidInput(await request.json());
    const result = await mutateDirectoryRecord({
      workspaceId,
      actorId: user.id,
      clientMutationId: mutationId(request),
      entity: "property",
      operation: "void",
      entityId: propertyId,
      expectedVersion: expectedVersion(request),
      record,
    });
    return NextResponse.json(result);
  } catch (error) {
    return directoryError(error, "Property");
  }
}
