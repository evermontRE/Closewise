import assert from"node:assert/strict";import test from"node:test";import{TaxInputError,parseReserveMovementInput,parseTaxPaymentInput,parseTaxVoidInput}from"./input.ts";
test("normalizes an estimated tax payment",()=>{const p=parseTaxPaymentInput({paymentDate:"2026-04-15",taxYear:2026,quarter:1,jurisdiction:"federal",amount:"5200",paymentMethod:"EFTPS"});assert.equal(p.amount,"5200.00");assert.equal(p.quarter,1);});
test("normalizes a reserve transfer independently",()=>{const m=parseReserveMovementInput({movementDate:"2026-04-01",direction:"deposit",amount:"2500.25"});assert.equal(m.amount,"2500.25");assert.equal(m.paymentMethod,null);});
test("rejects invalid quarter and zero payments",()=>assert.throws(()=>parseTaxPaymentInput({paymentDate:"2026-04-15",taxYear:2026,quarter:5,jurisdiction:"federal",amount:"0"}),TaxInputError));
test("requires a meaningful void reason",()=>assert.throws(()=>parseTaxVoidInput({reason:"no"}),TaxInputError));
