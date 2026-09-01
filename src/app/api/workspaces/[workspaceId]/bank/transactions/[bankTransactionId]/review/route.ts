import { NextResponse } from "next/server";
import { reviewBankTransaction } from "@/data/bank";
import { requireFinancialWriter, requireWorkspaceAccess } from "@/data/workspace-access";
import { parseBankReviewInput } from "@/features/bank/input";
import { bankError, expectedVersion, mutationId, UUID } from "@/features/bank/http";

type Context = { params: Promise<{ workspaceId: string; bankTransactionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId, bankTransactionId } = await context.params;
    if (!UUID.test(bankTransactionId)) return NextResponse.json({ error: "Bank transaction not found" }, { status: 404 });
    const { user, role } = await requireWorkspaceAccess(workspaceId); requireFinancialWriter(role);
    return NextResponse.json(await reviewBankTransaction({
      workspaceId, actorId: user.id, bankTransactionId, clientMutationId: mutationId(request),
      expectedVersion: expectedVersion(request), review: parseBankReviewInput(await request.json()),
    }));
  } catch (error) { return bankError(error, "Bank review"); }
}
