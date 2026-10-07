import { fmt, round2 } from "./money.js";
import type { ContractType, PeriodBreakdown, RateType } from "./types.js";

export type ConvertInput = {
  amountRon: number;
  rateType: Exclude<RateType, "MONTHLY_NET">;
  contractType: ContractType;
  hoursPerDay: number;
  workingDaysPerMonth: number;
  billableDaysPerYear: number;
};

export function convertPeriods(input: ConvertInput): PeriodBreakdown {
  const { amountRon, rateType, contractType, hoursPerDay, workingDaysPerMonth, billableDaysPerYear } =
    input;
  let hourly: number | null = null;
  let daily: number;
  const formulas: string[] = [];

  let monthlyNominal: number;
  if (rateType === "HOURLY_GROSS") {
    hourly = amountRon;
    daily = round2(amountRon * hoursPerDay);
    monthlyNominal = round2(daily * workingDaysPerMonth);
    formulas.push(`Daily gross = ${fmt(amountRon)} RON/hour x ${hoursPerDay} hours/day = ${fmt(daily)} RON`);
    formulas.push(
      `Monthly gross (nominal) = ${fmt(daily)} RON/day x ${workingDaysPerMonth} days = ${fmt(monthlyNominal)} RON`,
    );
  } else if (rateType === "DAILY_GROSS") {
    daily = amountRon;
    hourly = hoursPerDay > 0 ? round2(amountRon / hoursPerDay) : null;
    monthlyNominal = round2(daily * workingDaysPerMonth);
    formulas.push(`Daily gross = ${fmt(amountRon)} RON`);
    if (hourly != null) {
      formulas.push(`Hourly gross = ${fmt(amountRon)} / ${hoursPerDay} hours = ${fmt(hourly)} RON`);
    }
    formulas.push(
      `Monthly gross (nominal) = ${fmt(daily)} RON/day x ${workingDaysPerMonth} days = ${fmt(monthlyNominal)} RON`,
    );
  } else {
    monthlyNominal = round2(amountRon);
    daily = workingDaysPerMonth > 0 ? round2(amountRon / workingDaysPerMonth) : 0;
    hourly = hoursPerDay > 0 ? round2(daily / hoursPerDay) : null;
    formulas.push(`Monthly gross = ${fmt(monthlyNominal)} RON (entered directly, not rebuilt from a rounded day rate)`);
    formulas.push(
      `Daily gross = ${fmt(monthlyNominal)} / ${workingDaysPerMonth} days = ${fmt(daily)} RON`,
    );
  }

  let yearly: number;
  if (contractType === "B2B") {
    yearly =
      rateType === "MONTHLY_GROSS"
        ? round2((amountRon * billableDaysPerYear) / workingDaysPerMonth)
        : round2(daily * billableDaysPerYear);
    formulas.push(
      `Yearly revenue (B2B) = ${fmt(yearly)} RON using ${billableDaysPerYear} billable days.`,
    );
  } else {
    yearly = round2(monthlyNominal * 12);
    formulas.push(`Yearly gross (CIM) = ${fmt(monthlyNominal)} x 12 = ${fmt(yearly)} RON`);
  }

  const monthlySmoothed = round2(yearly / 12);
  if (contractType === "B2B") {
    formulas.push(
      `Monthly revenue (smoothed) = ${fmt(yearly)} / 12 = ${fmt(monthlySmoothed)} RON. Vacation and unpaid days are in the billable-day count.`,
    );
  }

  return {
    hourly_ron: hourly,
    daily_ron: daily,
    monthly_nominal_ron: monthlyNominal,
    monthly_smoothed_ron: monthlySmoothed,
    yearly_ron: yearly,
    formulas,
  };
}
