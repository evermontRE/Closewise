import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LedgerInputError, parseCategoryInput, parseLedgerVoidInput, parseTransactionInput } from "./input.ts";

const categoryId = "10000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-4000-8000-000000000002";

describe("ledger input", () => {
  it("normalizes a category", () => {
    assert.deepEqual(parseCategoryInput({ name: " Advertising ", kind: "expense", scheduleCLine: "8" }), {
      name: "Advertising", kind: "expense", scheduleCLine: "8", isActive: true, deviceId: "web",
    });
  });

  it("normalizes a transaction and exact split amounts", () => {
    const result = parseTransactionInput({
      transactionDate: "2026-08-31", type: "expense", description: "Client event",
      amount: "100.005", vendorTaxIdLast4: "1234",
      splits: [
        { categoryId, amount: "60", memo: "Venue" },
        { propertyId, amount: "40.01", memo: "Listing" },
      ],
    });
    assert.equal(result.amount, "100.01");
    assert.deepEqual(result.splits.map((split) => split.amount), ["60.00", "40.01"]);
  });

  it("rejects invalid dates, identifiers, and tax digits", () => {
    assert.throws(
      () => parseTransactionInput({ transactionDate: "2026-02-30", type: "expense", description: "Test", amount: 1, categoryId: "bad", vendorTaxIdLast4: "12x4" }),
      (error) => error instanceof LedgerInputError && Boolean(error.fields.transactionDate) && Boolean(error.fields.categoryId) && Boolean(error.fields.vendorTaxIdLast4),
    );
  });

  it("requires split lines to reconcile exactly", () => {
    assert.throws(
      () => parseTransactionInput({ transactionDate: "2026-08-31", type: "expense", description: "Test", amount: 100, splits: [{ amount: 99 }] }),
      (error) => error instanceof LedgerInputError && Boolean(error.fields.splits),
    );
  });

  it("requires meaningful void reasons", () => {
    assert.throws(() => parseLedgerVoidInput({ reason: "no" }), LedgerInputError);
  });
});
