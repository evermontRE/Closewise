import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CommissionInputError, parseCommissionInput } from "./input.ts";

describe("parseCommissionInput", () => {
  it("normalizes a valid commission payload", () => {
    const result = parseCommissionInput({
      salesPrice: "500000",
      commissionRatePct: "3",
      brokerageSplitPct: 20,
      status: "pending",
      side: "buyer",
      notes: "  First closing  ",
    });

    assert.equal(result.salesPrice, "500000.00");
    assert.equal(result.commissionRatePct, 3);
    assert.equal(result.notes, "First closing");
    assert.equal(result.deviceId, "web");
  });

  it("accepts a flat commission without a sales price", () => {
    const result = parseCommissionInput({ flatCommission: 3975, side: "referral" });
    assert.equal(result.flatCommission, "3975.00");
    assert.equal(result.salesPrice, "0.00");
  });

  it("rejects invalid money, percentages, identifiers, and dates", () => {
    assert.throws(
      () => parseCommissionInput({
        salesPrice: -1,
        commissionRatePct: 101,
        clientId: "not-a-uuid",
        expectedClosingDate: "09/01/2026",
      }),
      (error: unknown) => {
        assert.ok(error instanceof CommissionInputError);
        assert.ok(error.fields.salesPrice);
        assert.ok(error.fields.commissionRatePct);
        assert.ok(error.fields.clientId);
        assert.ok(error.fields.expectedClosingDate);
        return true;
      },
    );
  });

  it("requires a rate when sales price supplies the commission basis", () => {
    assert.throws(
      () => parseCommissionInput({ salesPrice: 500000 }),
      (error: unknown) => {
        assert.ok(error instanceof CommissionInputError);
        assert.equal(
          error.fields.commissionRatePct,
          "Enter a commission rate or a flat commission",
        );
        return true;
      },
    );
  });

  it("rejects calendar dates that roll into another month", () => {
    assert.throws(
      () => parseCommissionInput({ flatCommission: 1000, expectedClosingDate: "2026-02-31" }),
      CommissionInputError,
    );
  });

  it("rejects deductions that would create a negative commission receipt", () => {
    assert.throws(
      () => parseCommissionInput({ flatCommission: 1000, transactionFee: 1200 }),
      (error: unknown) => {
        assert.ok(error instanceof CommissionInputError);
        assert.equal(
          error.fields.deductions,
          "Total deductions cannot exceed gross commission",
        );
        return true;
      },
    );
  });
});
