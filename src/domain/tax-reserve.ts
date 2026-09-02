import { add, subtract, toCents, toDecimalString, type Cents } from "./money.ts";

export interface TaxReserveMovement { direction: "deposit" | "withdrawal"; amount: string }

export function taxReserveBalance(
  openingBalance: string,
  movements: TaxReserveMovement[],
  taxPayments: string[],
) {
  const deposited = sum(movements.filter((item) => item.direction === "deposit").map((item) => item.amount));
  const withdrawn = sum(movements.filter((item) => item.direction === "withdrawal").map((item) => item.amount));
  const paid = sum(taxPayments);
  const balance = subtract(add(toCents(openingBalance), deposited), add(withdrawn, paid));
  return {
    openingBalance: toDecimalString(toCents(openingBalance)), deposited: toDecimalString(deposited),
    withdrawn: toDecimalString(withdrawn), taxPayments: toDecimalString(paid),
    reserveBalance: toDecimalString(balance), isOverdrawn: balance < 0,
  };
}

function sum(values: string[]) { return values.reduce((total, value) => add(total, toCents(value)), 0 as Cents); }
