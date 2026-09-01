import { defaultMileageRate, normalizeMileageRate, normalizeMiles, normalizeOdometer } from "../../domain/mileage.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface VehicleInput { name: string; make: string | null; model: string | null; year: number | null; odometerYear: number; beginningOdometer: string | null; endingOdometer: string | null; isPrimary: boolean; deviceId: string }
export interface MileageTripInput { vehicleId: string; clientId: string | null; propertyId: string | null; tripDate: string; purpose: string; startLocation: string | null; endLocation: string | null; startOdometer: string | null; endOdometer: string | null; miles: string; mileageRate: string; mileageRateYear: number; rateSource: "default" | "custom"; parking: string; tolls: string; notes: string | null; deviceId: string }
export interface MileageVoidInput { reason: string; deviceId: string }

export class MileageInputError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) { super("Invalid mileage input"); this.fields = fields; }
}

export function parseVehicleInput(value: unknown): VehicleInput {
  const source=record(value), fields:Record<string,string>={};
  const odometerYear=yearValue(source.odometerYear,"odometerYear",fields) ?? 2026;
  const beginningOdometer=optionalDecimal(source.beginningOdometer,"beginningOdometer",fields);
  const endingOdometer=optionalDecimal(source.endingOdometer,"endingOdometer",fields);
  if(beginningOdometer!==null&&endingOdometer!==null&&Number(endingOdometer)<Number(beginningOdometer)) fields.endingOdometer="Ending odometer cannot be lower than beginning odometer";
  const result={name:requiredText(source.name,"name",120,fields),make:optionalText(source.make,80),model:optionalText(source.model,80),year:yearValue(source.year,"year",fields),odometerYear,beginningOdometer,endingOdometer,isPrimary:typeof source.isPrimary==="boolean"?source.isPrimary:false,deviceId:optionalText(source.deviceId,120)??"web"};
  if(Object.keys(fields).length) throw new MileageInputError(fields); return result;
}

export function parseMileageTripInput(value: unknown): MileageTripInput {
  const source=record(value),fields:Record<string,string>={}; const tripDate=dateValue(source.tripDate,"tripDate",fields); const mileageRateYear=Number.parseInt(tripDate.slice(0,4),10)||2026;
  const startOdometer=optionalDecimal(source.startOdometer,"startOdometer",fields), endOdometer=optionalDecimal(source.endOdometer,"endOdometer",fields);
  if((startOdometer===null)!==(endOdometer===null)){fields.startOdometer="Enter both trip odometers or neither";fields.endOdometer="Enter both trip odometers or neither";}
  if(startOdometer!==null&&endOdometer!==null&&Number(endOdometer)<=Number(startOdometer)) fields.endOdometer="Ending odometer must be greater than starting odometer";
  let miles="0.00"; try { miles=normalizeMiles(source.miles); } catch { fields.miles="Enter miles greater than zero"; }
  if(startOdometer!==null&&endOdometer!==null&&Math.abs(Number(miles)-(Number(endOdometer)-Number(startOdometer)))>0.011) fields.miles="Miles must equal the trip odometer difference";
  let mileageRate=defaultMileageRate(tripDate); let rateSource:"default"|"custom"="default";
  if(source.mileageRate!==undefined&&source.mileageRate!==null&&source.mileageRate!==""){try{mileageRate=normalizeMileageRate(source.mileageRate);rateSource=mileageRate===defaultMileageRate(tripDate)?"default":"custom";}catch{fields.mileageRate="Enter a valid rate greater than zero";}}
  const result={vehicleId:uuid(source.vehicleId,"vehicleId",fields)??"",clientId:uuid(source.clientId,"clientId",fields),propertyId:uuid(source.propertyId,"propertyId",fields),tripDate,purpose:requiredText(source.purpose,"purpose",240,fields),startLocation:optionalText(source.startLocation,240),endLocation:optionalText(source.endLocation,240),startOdometer,endOdometer,miles,mileageRate,mileageRateYear,rateSource,parking:money(source.parking,"parking",fields),tolls:money(source.tolls,"tolls",fields),notes:optionalText(source.notes,2000),deviceId:optionalText(source.deviceId,120)??"web"};
  if(Object.keys(fields).length) throw new MileageInputError(fields); return result;
}

export function parseMileageVoidInput(value:unknown):MileageVoidInput{const source=record(value),fields:Record<string,string>={};const reason=requiredText(source.reason,"reason",500,fields);if(reason&&reason.length<5)fields.reason="Explain why this record is being removed";if(Object.keys(fields).length)throw new MileageInputError(fields);return{reason,deviceId:optionalText(source.deviceId,120)??"web"};}
function record(v:unknown):Record<string,unknown>{return typeof v==="object"&&v!==null&&!Array.isArray(v)?v as Record<string,unknown>:{};} function optionalText(v:unknown,max:number){if(typeof v!=="string")return null;const t=v.trim();return t?t.slice(0,max):null;} function requiredText(v:unknown,f:string,m:number,e:Record<string,string>){const t=optionalText(v,m);if(!t)e[f]="This field is required";return t??"";}
function uuid(v:unknown,f:string,e:Record<string,string>){const t=optionalText(v,36);if(!t){if(f==="vehicleId")e[f]="This field is required";return null;}if(!UUID.test(t))e[f]="Must be a valid identifier";return t;}
function dateValue(v:unknown,f:string,e:Record<string,string>){const t=optionalText(v,10)??"";const d=ISO_DATE.test(t)?new Date(`${t}T00:00:00Z`):null;if(!d||Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==t)e[f]="Use YYYY-MM-DD";return t;}
function yearValue(v:unknown,f:string,e:Record<string,string>){if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isInteger(n)||n<1900||n>2100)e[f]="Enter a year from 1900 through 2100";return n;}
function optionalDecimal(v:unknown,f:string,e:Record<string,string>){if(v===null||v===undefined||v==="")return null;try{return normalizeOdometer(v);}catch{e[f]="Enter a valid non-negative odometer";return null;}}
function money(v:unknown,f:string,e:Record<string,string>){if(v===null||v===undefined||v==="")return"0.00";const t=String(v).trim();if(!/^\d+(?:\.\d{1,2})?$/.test(t)||Number(t)>9e12){e[f]="Enter a valid non-negative amount";return"0.00";}return Number(t).toFixed(2);}
