import assert from "node:assert/strict";import test from "node:test";
import { taxReserveBalance } from "./tax-reserve.ts";
test("keeps reserve transfers separate from tax payments",()=>{const result=taxReserveBalance("1000.00",[{direction:"deposit",amount:"500.25"},{direction:"withdrawal",amount:"100.00"}],["350.10"]);assert.deepEqual(result,{openingBalance:"1000.00",deposited:"500.25",withdrawn:"100.00",taxPayments:"350.10",reserveBalance:"1050.15",isOverdrawn:false});});
test("reports an overdrawn reserve without hiding the signed balance",()=>{const result=taxReserveBalance("0.00",[],["25.00"]);assert.equal(result.reserveBalance,"-25.00");assert.equal(result.isOverdrawn,true);});
