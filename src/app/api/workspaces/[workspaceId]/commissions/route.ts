import { NextResponse } from "next/server";
import { createCommissionRecord } from "@/data/commissions";
import {
  requireFinancialWriter,
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from "@/data/workspace-access";
import { CommissionInputError, parseCommissionInput } from "@/features/commissions/input";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    const url = new URL(request.url);
    const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25, 1), 100);
    const from = (page - 1) * pageSize;

    const { data, error, count } = await supabase
      .from("commissions")
      .select(
        "id, client_id, property_id, transaction_reference, side, status, lead_source, expected_closing_date, closed_date, sales_price, gross_commission, net_received, suggested_tax_reserve, calculation_version, created_at, updated_at",
        { count: "exact" },
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return NextResponse.json({ error: "Unable to load commissions" }, { status: 500 });
    return NextResponse.json({ items: data ?? [], page, pageSize, total: count ?? 0 });
  } catch (error) {
    return accessError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { user, role } = await requireWorkspaceAccess(workspaceId);
    requireFinancialWriter(role);

    const clientMutationId = request.headers.get("idempotency-key")?.trim();
    if (!clientMutationId || clientMutationId.length < 8 || clientMutationId.length > 160) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
    }

    const body = await request.json();
    const commission = parseCommissionInput(body);
    const result = await createCommissionRecord({
      workspaceId,
      actorId: user.id,
      clientMutationId,
      commission,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CommissionInputError) {
      return NextResponse.json({ error: error.message, fields: error.fields }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    return accessError(error);
  }
}

function accessError(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Commission API error", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
}

