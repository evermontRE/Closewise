import "server-only";

import { createHash } from "node:crypto";
import { calculateCommission } from "@/domain/commission.ts";
import {
  toCents,
  toDecimalString,
  type Cents,
  type MoneyInput,
} from "@/domain/money.ts";
import type { CommissionInput } from "@/features/commissions/input.ts";
import { createAdminClient } from "@/lib/supabase/admin";

export const CALCULATION_VERSION = "finance-v1";

export async function createCommissionRecord(input: {
  workspaceId: string;
  actorId: string;
  clientMutationId: string;
  commission: CommissionInput;
}) {
  const calculation = calculateCommission(input.commission);
  const record = {
    ...input.commission,
    grossCommission: toDecimalString(calculation.grossCommission),
    suggestedTaxReserve: toDecimalString(calculation.suggestedTaxReserve),
    netReceived: toDecimalString(calculation.netReceived),
    calculationVersion: CALCULATION_VERSION,
    payloadHash: createHash("sha256")
      .update(JSON.stringify(input.commission))
      .digest("hex"),
  };

  const deductions = [
    calculatedDeduction("referral_fee", "Referral fee", calculation.referralFee),
    calculatedDeduction("brokerage_split", "Brokerage split", calculation.brokerageSplit),
    calculatedDeduction("team_split", "Team split", calculation.teamSplit),
    inputDeduction("franchise_fee", "Franchise fee", input.commission.franchiseFee),
    inputDeduction("transaction_fee", "Transaction fee", input.commission.transactionFee),
    inputDeduction("other", "Errors and omissions", input.commission.errorsAndOmissionsFee),
    inputDeduction("other", "Administrative deductions", input.commission.administrativeDeductions),
    inputDeduction("other", "Concession", input.commission.concession),
    inputDeduction("other", "Closing deductions", input.commission.closingDeductions),
  ].filter((item) => Number(item.amount) > 0);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_commission_record", {
    p_workspace_id: input.workspaceId,
    p_actor_id: input.actorId,
    p_client_mutation_id: input.clientMutationId,
    p_record: record,
    p_deductions: deductions,
  });

  if (error) throw new Error(`Unable to create commission: ${error.message}`);

  return {
    id: String(data),
    calculation: serializeCalculation(calculation),
    calculationVersion: CALCULATION_VERSION,
  };
}

function calculatedDeduction(kind: string, label: string, amount: Cents) {
  return { kind, label, amount: toDecimalString(amount) };
}

function inputDeduction(kind: string, label: string, amount: MoneyInput) {
  return { kind, label, amount: toDecimalString(toCents(amount)) };
}

function serializeCalculation(calculation: ReturnType<typeof calculateCommission>) {
  return {
    grossCommission: toDecimalString(calculation.grossCommission),
    referralFee: toDecimalString(calculation.referralFee),
    brokerageSplit: toDecimalString(calculation.brokerageSplit),
    teamSplit: toDecimalString(calculation.teamSplit),
    fees: toDecimalString(calculation.fees),
    giveback: toDecimalString(calculation.giveback),
    totalDeductions: toDecimalString(calculation.totalDeductions),
    netReceived: toDecimalString(calculation.netReceived),
    suggestedTaxReserve: toDecimalString(calculation.suggestedTaxReserve),
    afterReserve: toDecimalString(calculation.afterReserve),
    keepRatePct: calculation.keepRatePct,
  };
}
