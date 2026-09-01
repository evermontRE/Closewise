import { RECURRING_CADENCES, annualizedRecurringAmount, type RecurringCadence } from "../../domain/recurring.ts";
import { toCents, toDecimalString } from "../../domain/money.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RECURRING_TYPES = ["subscription", "recurring_bill"] as const;

export interface RecurringExpenseInput {
  categoryId: string | null; vendorName: string; productName: string | null;
  purpose: string | null; recurringType: (typeof RECURRING_TYPES)[number]; amount: string;
  cadence: RecurringCadence; annualizedAmount: string; nextDueDate: string;
  autoPay: boolean; reminderDays: number; websiteUrl: string | null; notes: string | null;
  isActive: boolean; deviceId: string;
}
export interface RecurringAdvanceInput { paidDate: string; deviceId: string }
export interface RecurringVoidInput { reason: string; deviceId: string }
export class RecurringInputError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) { super("Invalid recurring expense input"); this.fields = fields; }
}

export function parseRecurringExpenseInput(value: unknown): RecurringExpenseInput {
  const source = record(value), fields: Record<string, string> = {};
  const amount = money(source.amount, "amount", fields);
  const cadence = enumValue(source.cadence, RECURRING_CADENCES, "cadence", fields, "monthly");
  const websiteUrl = optionalText(source.websiteUrl, 500);
  if (websiteUrl) { try { const url = new URL(websiteUrl); if (!['https:', 'http:'].includes(url.protocol)) throw new Error(); } catch { fields.websiteUrl = "Enter a valid HTTP or HTTPS address"; } }
  const reminderDays = source.reminderDays === undefined ? 7 : Number(source.reminderDays);
  if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 90) fields.reminderDays = "Enter 0 through 90 days";
  const result: RecurringExpenseInput = {
    categoryId: optionalUuid(source.categoryId, "categoryId", fields),
    vendorName: requiredText(source.vendorName, "vendorName", 160, fields),
    productName: optionalText(source.productName, 160), purpose: optionalText(source.purpose, 500),
    recurringType: enumValue(source.recurringType, RECURRING_TYPES, "recurringType", fields, "subscription"),
    amount, cadence, annualizedAmount: annualizedRecurringAmount(amount, cadence),
    nextDueDate: dateValue(source.nextDueDate, "nextDueDate", fields),
    autoPay: typeof source.autoPay === "boolean" ? source.autoPay : false,
    reminderDays, websiteUrl, notes: optionalText(source.notes, 2_000),
    isActive: typeof source.isActive === "boolean" ? source.isActive : true,
    deviceId: optionalText(source.deviceId, 120) ?? "web",
  };
  if (Object.keys(fields).length) throw new RecurringInputError(fields); return result;
}
export function parseRecurringAdvanceInput(value: unknown): RecurringAdvanceInput { const s=record(value),f:Record<string,string>={};const paidDate=dateValue(s.paidDate,"paidDate",f);if(Object.keys(f).length)throw new RecurringInputError(f);return{paidDate,deviceId:optionalText(s.deviceId,120)??"web"}; }
export function parseRecurringVoidInput(value: unknown): RecurringVoidInput { const s=record(value),f:Record<string,string>={};const reason=requiredText(s.reason,"reason",500,f);if(reason&&reason.length<5)f.reason="Explain why this obligation is being removed";if(Object.keys(f).length)throw new RecurringInputError(f);return{reason,deviceId:optionalText(s.deviceId,120)??"web"}; }
function record(v:unknown):Record<string,unknown>{return typeof v==="object"&&v!==null&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function optionalText(v:unknown,max:number){if(typeof v!=="string")return null;const t=v.trim();return t?t.slice(0,max):null;}
function requiredText(v:unknown,f:string,m:number,e:Record<string,string>){const t=optionalText(v,m);if(!t)e[f]="This field is required";return t??"";}
function optionalUuid(v:unknown,f:string,e:Record<string,string>){const t=optionalText(v,36);if(!t)return null;if(!UUID.test(t))e[f]="Must be a valid identifier";return t;}
function dateValue(v:unknown,f:string,e:Record<string,string>){const t=optionalText(v,10)??"";const d=ISO_DATE.test(t)?new Date(`${t}T00:00:00Z`):null;if(!d||Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==t)e[f]="Use YYYY-MM-DD";return t;}
function money(v:unknown,f:string,e:Record<string,string>){try{const c=toCents(v as string|number|null|undefined);if(c<=0||c>900_000_000_000_000)throw new Error();return toDecimalString(c);}catch{e[f]="Enter an amount greater than zero";return"0.00";}}
function enumValue<T extends readonly string[]>(v:unknown,a:T,f:string,e:Record<string,string>,fallback:T[number]):T[number]{if(typeof v==="string"&&a.includes(v))return v as T[number];if(v!==undefined&&v!==null&&v!=="")e[f]="Unsupported value";return fallback;}
