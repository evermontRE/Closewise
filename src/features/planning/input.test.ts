import test from"node:test";import assert from"node:assert/strict";import{parseBudgetInput,parseGoalInput,PlanningInputError}from"./input.ts";
test("normalizes goals and budgets",()=>{assert.equal(parseGoalInput({year:2026,gciTarget:100000,closedTransactionsTarget:12,targetExpenseRatioPct:25}).gciTarget,"100000.00");assert.equal(parseBudgetInput({year:2026,lines:[{month:1,amount:500}]}).lines[0].amount,"500.00");});
test("rejects duplicate budget lines",()=>assert.throws(()=>parseBudgetInput({year:2026,lines:[{month:1,amount:1},{month:1,amount:2}]}),PlanningInputError));
