import { NextResponse } from "next/server";
import { requireWorkspaceAccess, WorkspaceAccessError } from "@/data/workspace-access";

type Context = { params: Promise<{ workspaceId: string }> };
const BUSINESS_TYPES = new Set(["solo_agent", "team", "brokerage", "other"]);
const SETUP_METHODS = new Set(["bank", "import", "manual", "later"]);

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { supabase } = await requireWorkspaceAccess(workspaceId);
    const { data, error } = await supabase.from("workspace_onboarding").select("*").eq("workspace_id", workspaceId).maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to load setup progress" }, { status: 500 });
    return NextResponse.json({ onboarding: data });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const { supabase, role } = await requireWorkspaceAccess(workspaceId);
    if (role !== "owner" && role !== "admin") return NextResponse.json({ error: "Only workspace administrators can change setup" }, { status: 403 });
    const body = await request.json();
    const currentStep = Number(body.currentStep);
    const taxYear = body.taxYear === null || body.taxYear === undefined ? null : Number(body.taxYear);
    const openingBalanceCents = body.openingBalanceCents === null || body.openingBalanceCents === undefined ? null : Number(body.openingBalanceCents);
    if (!Number.isInteger(currentStep) || currentStep < 1 || currentStep > 4) return NextResponse.json({ error: "Choose a valid setup step" }, { status: 400 });
    if (body.businessType && !BUSINESS_TYPES.has(body.businessType)) return NextResponse.json({ error: "Choose a valid business type" }, { status: 400 });
    if (taxYear !== null && (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200)) return NextResponse.json({ error: "Choose a valid tax year" }, { status: 400 });
    if (openingBalanceCents !== null && (!Number.isSafeInteger(openingBalanceCents) || openingBalanceCents < 0)) return NextResponse.json({ error: "Enter a valid opening balance" }, { status: 400 });
    if (body.setupMethod && !SETUP_METHODS.has(body.setupMethod)) return NextResponse.json({ error: "Choose a valid setup method" }, { status: 400 });

    const completed = currentStep === 4 && body.completed === true;
    const { data, error } = await supabase.from("workspace_onboarding").upsert({
      workspace_id: workspaceId,
      current_step: currentStep,
      business_type: body.businessType ?? null,
      tax_year: taxYear,
      opening_balance_cents: openingBalanceCents,
      setup_method: body.setupMethod ?? null,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) return NextResponse.json({ error: "Unable to save setup progress" }, { status: 500 });
    return NextResponse.json({ onboarding: data });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
  }
}
