import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlaidTransaction, reconciliationScore } from "./bank-connectivity.ts";

test("normalizes Plaid's debit-positive convention into signed bookkeeping money", () => {
  const expense = normalizePlaidTransaction("workspace", { transaction_id: "plaid-1", account_id: "account-1", date: "2026-09-01", name: "MLS dues", amount: 129.5, iso_currency_code: "usd" });
  const deposit = normalizePlaidTransaction("workspace", { transaction_id: "plaid-2", account_id: "account-1", date: "2026-09-02", name: "Commission", amount: -2500 });
  assert.equal(expense.amount, "-129.50");
  assert.equal(expense.direction, "outflow");
  assert.equal(deposit.amount, "2500.00");
  assert.equal(deposit.direction, "inflow");
  assert.notEqual(expense.fingerprint, deposit.fingerprint);
});

test("builds high-confidence suggestions only for exact amounts near the bank date", () => {
  assert.equal(reconciliationScore({ bankAmount: "2500.00", bankDate: "2026-09-02", bankDescription: "Evermont Title Commission", targetAmount: "2500", targetDate: "2026-09-01", targetDescription: "Commission" }), 99);
  assert.equal(reconciliationScore({ bankAmount: "2500.00", bankDate: "2026-09-02", bankDescription: "Commission", targetAmount: "2499.99", targetDate: "2026-09-02" }), 0);
  assert.equal(reconciliationScore({ bankAmount: "2500.00", bankDate: "2026-09-30", bankDescription: "Commission", targetAmount: "2500", targetDate: "2026-09-01" }), 0);
});
