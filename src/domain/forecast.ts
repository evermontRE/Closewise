import { add, cents, subtract, toCents, toDecimalString, type Cents } from "./money.ts";

export interface ForecastMonthInput { month: string; actualIncome?: string; expectedIncome?: string; actualExpenses?: string; budgetedExpenses?: string; recurringExpenses?: string; taxReserveFunding?: string }
export interface ForecastInput { openingCash: string; months: ForecastMonthInput[] }

export function calculateCashForecast(input: ForecastInput) {
  let balance = toCents(input.openingCash);
  let totalInflows = cents(0), totalOutflows = cents(0), firstNegativeMonth: string | null = null;
  const months = input.months.map((month) => {
    const inflows = add(toCents(month.actualIncome), toCents(month.expectedIncome));
    const outflows = add(toCents(month.actualExpenses), toCents(month.budgetedExpenses), toCents(month.recurringExpenses), toCents(month.taxReserveFunding));
    const opening = balance;
    balance = subtract(add(balance, inflows), outflows);
    totalInflows = add(totalInflows, inflows); totalOutflows = add(totalOutflows, outflows);
    if (balance < 0 && firstNegativeMonth === null) firstNegativeMonth = month.month;
    return { month: month.month, openingCash: money(opening), inflows: money(inflows), outflows: money(outflows), netChange: money(subtract(inflows, outflows)), endingCash: money(balance), isNegative: balance < 0 };
  });
  const averageMonthlyOutflow = months.length ? cents(totalOutflows / months.length) : cents(0);
  const runwayMonths = averageMonthlyOutflow > 0 ? Math.max(Math.round((toCents(input.openingCash) / averageMonthlyOutflow) * 10) / 10, 0) : null;
  return { openingCash: money(toCents(input.openingCash)), endingCash: money(balance), totalInflows: money(totalInflows), totalOutflows: money(totalOutflows), averageMonthlyOutflow: money(averageMonthlyOutflow), runwayMonths, firstNegativeMonth, months, notice: "Forecast based on recorded activity, pipeline dates, budgets, and user-controlled assumptions. Actual timing and amounts may differ." };
}
function money(value: Cents) { return toDecimalString(value); }
