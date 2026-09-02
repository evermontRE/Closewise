import { add, applyBasisPoints, cents, nonNegative, subtract, toCents, toDecimalString, type Cents } from "./money.ts";

export interface TaxPlanningAssumptions {
  federalRatePct: number; stateRatePct: number; selfEmploymentRatePct: number;
  selfEmploymentTaxableBasePct: number; qbiDeductionPct: number;
  deductHalfSelfEmploymentTax: boolean; additionalDeductions: string;
  safeHarborEnabled: boolean; priorYearAgi: string; priorYearTotalTax: string;
  priorYearFiled: boolean; priorYearFullTwelveMonths: boolean;
  marriedFilingSeparately: boolean;
}

export function calculateTaxPlan(input:{netBusinessIncome:string;mileageDeduction:string;taxPayments:string;reserveBalance:string;assumptions:TaxPlanningAssumptions}){
  const a=input.assumptions,net=toCents(input.netBusinessIncome),mileage=toCents(input.mileageDeduction),additional=toCents(a.additionalDeductions);
  const reportedProfit=subtract(subtract(net,mileage),additional),taxBase=nonNegative(reportedProfit);
  const seBase=applyBasisPoints(taxBase,pctBps(a.selfEmploymentTaxableBasePct));
  const seTax=applyBasisPoints(seBase,pctBps(a.selfEmploymentRatePct));
  const halfSe = a.deductHalfSelfEmploymentTax ? cents(seTax / 2) : cents(0);
  const qbi=applyBasisPoints(taxBase,pctBps(a.qbiDeductionPct));
  const incomeBase=nonNegative(subtract(subtract(taxBase,halfSe),qbi));
  const federal=applyBasisPoints(incomeBase,pctBps(a.federalRatePct)),state=applyBasisPoints(incomeBase,pctBps(a.stateRatePct));
  const totalPlanned=add(seTax,federal,state),paid=toCents(input.taxPayments),reserve=toCents(input.reserveBalance),stillOwed=nonNegative(subtract(totalPlanned,paid));
  const safe=safeHarbor(totalPlanned,a),recommended=safe.eligible?cents(Math.min(safe.currentYearRuleCents,safe.priorYearRuleCents)):totalPlanned;
  return{reportedProfit:money(reportedProfit),taxBase:money(taxBase),isLoss:reportedProfit<0,selfEmploymentTaxableBase:money(seBase),selfEmploymentTax:money(seTax),halfSelfEmploymentTaxDeduction:money(halfSe),qbiPlanningDeduction:money(qbi),incomeTaxBase:money(incomeBase),federalEstimate:money(federal),stateEstimate:money(state),totalPlannedTax:money(totalPlanned),taxPayments:money(paid),stillOwed:money(stillOwed),reserveBalance:money(reserve),reserveGap:money(nonNegative(subtract(stillOwed,reserve))),reserveSurplus:money(nonNegative(subtract(reserve,stillOwed))),coveragePct:stillOwed>0?Math.min(Math.round(reserve/stillOwed*1000)/10,100):100,recommendedPlanningTarget:money(recommended),safeHarbor:{enabled:a.safeHarborEnabled,eligible:safe.eligible,threshold:money(safe.thresholdCents),multiplierPct:safe.multiplierPct,currentYearRule:money(safe.currentYearRuleCents),priorYearRule:money(safe.priorYearRuleCents),recommendedBasis:safe.eligible&&(safe.priorYearRuleCents<safe.currentYearRuleCents)?"prior-year safe harbor":"90% of current-year planning estimate",recommendedQuarterly:money(cents(recommended/4)),warnings:safe.warnings},notice:"Planning estimate based on user-controlled assumptions—not tax advice, a tax return, or a filing calculation."};
}
function safeHarbor(total:Cents,a:TaxPlanningAssumptions){const warnings:string[]=[];const threshold=toCents(a.marriedFilingSeparately?"75000":"150000"),agi=toCents(a.priorYearAgi),priorTax=toCents(a.priorYearTotalTax),high=agi>threshold,multiplier=high?110:100;let eligible=a.safeHarborEnabled;if(a.safeHarborEnabled&&priorTax<=0){warnings.push("Enter prior-year total tax from a filed return.");eligible=false;}if(a.safeHarborEnabled&&!a.priorYearFiled){warnings.push("The prior-year return must be filed before using this planning method.");eligible=false;}if(a.safeHarborEnabled&&!a.priorYearFullTwelveMonths){warnings.push("The prior tax year must cover all 12 months.");eligible=false;}if(a.safeHarborEnabled&&agi<=0){warnings.push("Enter prior-year adjusted gross income to select the planning multiplier.");eligible=false;}return{eligible,thresholdCents:threshold,multiplierPct:multiplier,currentYearRuleCents:cents(total*.9),priorYearRuleCents:cents(priorTax*multiplier/100),warnings};}
function pctBps(value:number){return Math.round(Math.min(Math.max(value,0),100)*100);}function money(value:Cents){return toDecimalString(value);}
