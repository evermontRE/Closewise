import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateProportionally,
  applyBasisPoints,
  percentToBasisPoints,
  toCents,
  toDecimalString,
} from "./money.ts";

describe("money primitives", () => {
  it("parses and rounds database decimals deterministically", () => {
    assert.equal(toCents("12.344"), 1234);
    assert.equal(toCents("12.345"), 1235);
    assert.equal(toCents("-12.345"), -1235);
    assert.equal(toDecimalString(toCents("1234.50")), "1234.50");
  });

  it("applies percentages as integer basis points", () => {
    assert.equal(percentToBasisPoints(2.5), 250);
    assert.equal(applyBasisPoints(toCents("500000.00"), 250), toCents("12500.00"));
  });

  it("allocates exact remainder cents", () => {
    const shares = allocateProportionally(toCents("10.01"), [1, 1, 1]);
    assert.equal(shares.reduce((total, share) => total + share, 0), toCents("10.01"));
    assert.deepEqual(shares, [334, 334, 333]);
  });
});
