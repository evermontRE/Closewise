import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateCommission } from "./commission.ts";
import { toCents } from "./money.ts";

describe("calculateCommission", () => {
  it("matches the legacy referral-before-split fixture", () => {
    const result = calculateCommission({
      salesPrice: "500000.00",
      commissionRatePct: 3,
      referralPct: 25,
      brokerageSplitPct: 20,
      franchiseFee: 100,
      transactionFee: 400,
      errorsAndOmissionsFee: 50,
      taxReservePct: 30,
    });

    assert.equal(result.grossCommission, toCents("15000.00"));
    assert.equal(result.referralFee, toCents("3750.00"));
    assert.equal(result.brokerageSplit, toCents("2250.00"));
    assert.equal(result.netReceived, toCents("8450.00"));
    assert.equal(result.suggestedTaxReserve, toCents("2535.00"));
    assert.equal(result.grossCommission - result.totalDeductions, result.netReceived);
  });

  it("uses a flat commission when supplied", () => {
    const result = calculateCommission({
      salesPrice: 530000,
      commissionRatePct: 0,
      flatCommission: 3975,
      brokerageSplitPct: 10,
    });

    assert.equal(result.grossCommission, toCents(3975));
    assert.equal(result.brokerageSplit, toCents(397.5));
    assert.equal(result.netReceived, toCents(3577.5));
  });

  it("caps combined splits at post-referral commission", () => {
    const result = calculateCommission({
      flatCommission: 1000,
      brokerageSplitPct: 80,
      teamSplitPct: 80,
    });

    assert.equal(result.splitTotal, result.afterReferral);
    assert.equal(result.brokerageSplit + result.teamSplit, result.afterReferral);
    assert.equal(result.netReceived, 0);
  });

  it("does not let negative imported values create revenue", () => {
    const result = calculateCommission({
      salesPrice: -500000,
      commissionRatePct: 300,
      referralFee: -1000,
      franchiseFee: -20,
      taxReservePct: 200,
    });

    assert.equal(result.salesPrice, 0);
    assert.equal(result.grossCommission, 0);
    assert.equal(result.fees, 0);
    assert.equal(result.suggestedTaxReserve, 0);
  });

  const fixtures = [
    {
      name: "Hartleys seller closing",
      input: {
        salesPrice: 685000,
        commissionRatePct: 2.5,
        brokerageSplitPct: 20,
        franchiseFee: 180,
        transactionFee: 395,
        errorsAndOmissionsFee: 45,
        administrativeDeductions: 75,
        taxReservePct: 28,
      },
      gross: "17125.00",
      net: "13005.00",
      reserve: "3641.40",
    },
    {
      name: "Reyes buyer closing with concession",
      input: {
        salesPrice: 412000,
        commissionRatePct: 2.5,
        brokerageSplitPct: 20,
        franchiseFee: 150,
        transactionFee: 395,
        errorsAndOmissionsFee: 45,
        administrativeDeductions: 75,
        concession: 500,
        taxReservePct: 28,
      },
      gross: "10300.00",
      net: "7075.00",
      reserve: "1981.00",
    },
    {
      name: "Anand dual closing with team split",
      input: {
        salesPrice: 915000,
        commissionRatePct: 5,
        brokerageSplitPct: 20,
        teamSplitPct: 5,
        franchiseFee: 260,
        transactionFee: 395,
        errorsAndOmissionsFee: 45,
        administrativeDeductions: 75,
        taxReservePct: 30,
      },
      gross: "45750.00",
      net: "33537.50",
      reserve: "10061.25",
    },
  ];

  for (const { name, input, gross, net, reserve } of fixtures) {
    it(`matches the legacy sample for ${name}`, () => {
      const result = calculateCommission(input);
      assert.equal(result.grossCommission, toCents(gross));
      assert.equal(result.netReceived, toCents(net));
      assert.equal(result.suggestedTaxReserve, toCents(reserve));
    });
  }
});
