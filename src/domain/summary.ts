import { add, cents, nonNegative, subtract, type Cents } from "./money.ts";

export type CommissionLifecycleStatus =
  | "prospective"
  | "under_contract"
  | "pending"
  | "closed"
  | "paid"
  | "fell_through"
  | "terminated"
  | "lost"
  | "void";

export interface SummaryCommission {
  status: CommissionLifecycleStatus;
  grossCommission: Cents;
  netReceived: Cents;
  totalDeductions: Cents;
  suggestedTaxReserve: Cents;
  voided?: boolean;
}

export interface SummaryTransaction {
  type: "income" | "expense" | "owner_contribution" | "owner_draw" | "transfer" | "refund" | "reimbursement";
  amount: Cents;
  voided?: boolean;
}

export interface FinancialSummaryInput {
  commissions: SummaryCommission[];
  transactions: SummaryTransaction[];
  mileageDeduction?: Cents;
  homeOfficeDeduction?: Cents;
}

export interface FinancialSummary {
  grossCommissionIncome: Cents;
  netCommissionReceived: Cents;
  commissionDeductions: Cents;
  otherIncome: Cents;
  collectedIncome: Cents;
  operatingExpenses: Cents;
  netBusinessIncome: Cents;
  mileageDeduction: Cents;
  homeOfficeDeduction: Cents;
  taxableProfit: Cents;
  taxBase: Cents;
  lossAmount: Cents;
  suggestedTaxReserve: Cents;
  pendingGrossCommission: Cents;
  pendingNetCommission: Cents;
  weightedPipelineNet: Cents;
}

const PIPELINE_PROBABILITY_BPS: Partial<Record<CommissionLifecycleStatus, number>> = {
  prospective: 2_000,
  under_contract: 7_500,
  pending: 9_000,
};

function sum(values: Cents[]): Cents {
  return add(...values);
}

export function summarizeFinancials(input: FinancialSummaryInput): FinancialSummary {
  const commissions = input.commissions.filter((record) => !record.voided && record.status !== "void");
  const transactions = input.transactions.filter((record) => !record.voided);
  const closed = commissions.filter((record) => record.status === "closed" || record.status === "paid");
  const paid = commissions.filter((record) => record.status === "paid");
  const pipeline = commissions.filter((record) => record.status in PIPELINE_PROBABILITY_BPS);

  const grossCommissionIncome = sum(closed.map((record) => record.grossCommission));
  const netCommissionReceived = sum(paid.map((record) => record.netReceived));
  const commissionDeductions = sum(paid.map((record) => record.totalDeductions));
  const suggestedTaxReserve = sum(paid.map((record) => record.suggestedTaxReserve));
  const otherIncome = sum(
    transactions.filter((record) => record.type === "income").map((record) => record.amount),
  );
  const grossExpenses = sum(
    transactions.filter((record) => record.type === "expense").map((record) => record.amount),
  );
  const expenseOffsets = sum(
    transactions
      .filter((record) => record.type === "refund" || record.type === "reimbursement")
      .map((record) => record.amount),
  );
  const operatingExpenses = nonNegative(subtract(grossExpenses, expenseOffsets));
  const collectedIncome = add(netCommissionReceived, otherIncome);
  const netBusinessIncome = subtract(collectedIncome, operatingExpenses);
  const mileageDeduction = input.mileageDeduction ?? (0 as Cents);
  const homeOfficeDeduction = input.homeOfficeDeduction ?? (0 as Cents);
  const taxableProfit = subtract(subtract(netBusinessIncome, mileageDeduction), homeOfficeDeduction);
  const taxBase = nonNegative(taxableProfit);

  const pendingGrossCommission = sum(pipeline.map((record) => record.grossCommission));
  const pendingNetCommission = sum(pipeline.map((record) => record.netReceived));
  const weightedPipelineNet = cents(
    pipeline.reduce((total, record) => {
      const probability = PIPELINE_PROBABILITY_BPS[record.status] ?? 5_000;
      return total + Math.round((record.netReceived * probability) / 10_000);
    }, 0),
  );

  return {
    grossCommissionIncome,
    netCommissionReceived,
    commissionDeductions,
    otherIncome,
    collectedIncome,
    operatingExpenses,
    netBusinessIncome,
    mileageDeduction,
    homeOfficeDeduction,
    taxableProfit,
    taxBase,
    lossAmount: taxableProfit < 0 ? cents(Math.abs(taxableProfit)) : (0 as Cents),
    suggestedTaxReserve,
    pendingGrossCommission,
    pendingNetCommission,
    weightedPipelineNet,
  };
}
