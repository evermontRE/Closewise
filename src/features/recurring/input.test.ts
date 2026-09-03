import assert from "node:assert/strict";import test from "node:test";
import { RecurringInputError, parseRecurringAdvanceInput, parseRecurringExpenseInput, parseRecurringVoidInput } from "./input.ts";
test("normalizes a monthly subscription and annual cost",()=>{const r=parseRecurringExpenseInput({vendorName:"Canva",productName:"Canva Pro",recurringType:"subscription",amount:"14.99",cadence:"monthly",nextDueDate:"2026-09-15",autoPay:true});assert.equal(r.annualizedAmount,"179.88");assert.equal(r.reminderDays,7);});
test("supports ordinary recurring bills without requiring property detail",()=>{const r=parseRecurringExpenseInput({vendorName:"Office Internet",recurringType:"recurring_bill",amount:"80",cadence:"monthly",nextDueDate:"2026-09-20"});assert.equal(r.categoryId,null);assert.equal(r.productName,null);});
test("validates renewal confirmations",()=>assert.equal(parseRecurringAdvanceInput({paidDate:"2026-09-15"}).paidDate,"2026-09-15"));
test("requires a meaningful void reason",()=>assert.throws(()=>parseRecurringVoidInput({reason:"no"}),RecurringInputError));
