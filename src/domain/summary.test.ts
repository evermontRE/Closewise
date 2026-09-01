import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateCommission } from "./commission.ts";
import { toCents } from "./money.ts";
import { summarizeFinancials } from "./summary.ts";

describe("summarizeFinancials", () => {
  it("separates closed GCI from paid cash and excludes voids", () => {
    const paid = calculateCommission({ flatCommission: 10000, brokerageSplitPct: 20, taxReservePct: 30 });
    const closed = calculateCommission({ flatCommission: 5000, brokerageSplitPct: 20 });
    const pending = calculateCommission({ flatCommission: 4000, brokerageSplitPct: 20 });

    const result = summarizeFinancials({
      commissions: [
        { status: "paid", ...mapCommission(paid) },
        { status: "closed", ...mapCommission(closed) },
        { status: "pending", ...mapCommission(pending) },
        { status: "paid", voided: true, ...mapCommission(paid) },
      ],
      transactions: [
        { type: "income", amount: toCents(500) },
        { type: "expense", amount: toCents(1200) },
        { type: "refund", amount: toCents(200) },
        { type: "expense", amount: toCents(9000), voided: true },
        { type: "owner_draw", amount: toCents(1500) },
      ],
      mileageDeduction: toCents(100),
      homeOfficeDeduction: toCents(50),
    });

    assert.equal(result.grossCommissionIncome, toCents(15000));
    assert.equal(result.netCommissionReceived, toCents(8000));
    assert.equal(result.otherIncome, toCents(500));
    assert.equal(result.operatingExpenses, toCents(1000));
    assert.equal(result.netBusinessIncome, toCents(7500));
    assert.equal(result.taxableProfit, toCents(7350));
    assert.equal(result.pendingNetCommission, toCents(3200));
    assert.equal(result.weightedPipelineNet, toCents(2880));
  });

  it("reports a signed loss while flooring only the tax base", () => {
    const result = summarizeFinancials({
      commissions: [],
      transactions: [{ type: "expense", amount: toCents(1200) }],
      mileageDeduction: toCents(100),
    });

    assert.equal(result.netBusinessIncome, toCents(-1200));
    assert.equal(result.taxableProfit, toCents(-1300));
    assert.equal(result.taxBase, 0);
    assert.equal(result.lossAmount, toCents(1300));
  });
});

function mapCommission(result: ReturnType<typeof calculateCommission>) {
  return {
    grossCommission: result.grossCommission,
    netReceived: result.netReceived,
    totalDeductions: result.totalDeductions,
    suggestedTaxReserve: result.suggestedTaxReserve,
  };
}
