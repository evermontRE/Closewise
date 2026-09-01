import {
  add,
  allocateProportionally,
  applyBasisPoints,
  cents,
  nonNegative,
  percentToBasisPoints,
  subtract,
  toCents,
  type Cents,
  type MoneyInput,
} from "./money.ts";

export interface CommissionCalculationInput {
  salesPrice?: MoneyInput;
  commissionRatePct?: number | string | null;
  flatCommission?: MoneyInput;
  referralFee?: MoneyInput;
  referralPct?: number | string | null;
  brokerageSplitPct?: number | string | null;
  teamSplitPct?: number | string | null;
  franchiseFee?: MoneyInput;
  transactionFee?: MoneyInput;
  errorsAndOmissionsFee?: MoneyInput;
  administrativeDeductions?: MoneyInput;
  concession?: MoneyInput;
  closingDeductions?: MoneyInput;
  taxReservePct?: number | string | null;
}

export interface CommissionCalculation {
  salesPrice: Cents;
  grossCommission: Cents;
  referralFee: Cents;
  afterReferral: Cents;
  brokerageSplit: Cents;
  teamSplit: Cents;
  splitTotal: Cents;
  fees: Cents;
  giveback: Cents;
  totalDeductions: Cents;
  netReceived: Cents;
  suggestedTaxReserve: Cents;
  afterReserve: Cents;
  keepRatePct: number;
}

function cleanMoney(value: MoneyInput): Cents {
  return nonNegative(toCents(value));
}

/**
 * Canonical gross-to-net commission calculation.
 *
 * Referral deductions are applied before brokerage and team splits. Combined
 * splits cannot exceed post-referral commission, and negative imported inputs
 * cannot create revenue. This preserves the legacy Finance Studio invariants
 * while reconciling every result to the cent.
 */
export function calculateCommission(input: CommissionCalculationInput): CommissionCalculation {
  const salesPrice = cleanMoney(input.salesPrice);
  const flatCommission = cleanMoney(input.flatCommission);
  const grossCommission = flatCommission > 0
    ? flatCommission
    : applyBasisPoints(salesPrice, percentToBasisPoints(input.commissionRatePct));

  const referralFromPercent = applyBasisPoints(
    grossCommission,
    percentToBasisPoints(input.referralPct),
  );
  const referralFee = cents(Math.min(add(cleanMoney(input.referralFee), referralFromPercent), grossCommission));
  const afterReferral = subtract(grossCommission, referralFee);

  const brokerageWeight = percentToBasisPoints(input.brokerageSplitPct);
  const teamWeight = percentToBasisPoints(input.teamSplitPct);
  let brokerageSplit = applyBasisPoints(afterReferral, brokerageWeight);
  let teamSplit = applyBasisPoints(afterReferral, teamWeight);

  if (add(brokerageSplit, teamSplit) > afterReferral) {
    [brokerageSplit, teamSplit] = allocateProportionally(afterReferral, [brokerageWeight, teamWeight]);
  }

  const splitTotal = add(brokerageSplit, teamSplit);
  const fees = add(
    cleanMoney(input.franchiseFee),
    cleanMoney(input.transactionFee),
    cleanMoney(input.errorsAndOmissionsFee),
    cleanMoney(input.administrativeDeductions),
  );
  const giveback = add(cleanMoney(input.concession), cleanMoney(input.closingDeductions));
  const totalDeductions = add(referralFee, splitTotal, fees, giveback);
  const netReceived = subtract(grossCommission, totalDeductions);
  const suggestedTaxReserve = applyBasisPoints(
    nonNegative(netReceived),
    percentToBasisPoints(input.taxReservePct),
  );

  return {
    salesPrice,
    grossCommission,
    referralFee,
    afterReferral,
    brokerageSplit,
    teamSplit,
    splitTotal,
    fees,
    giveback,
    totalDeductions,
    netReceived,
    suggestedTaxReserve,
    afterReserve: subtract(netReceived, suggestedTaxReserve),
    keepRatePct: grossCommission > 0 ? (netReceived / grossCommission) * 100 : 0,
  };
}
