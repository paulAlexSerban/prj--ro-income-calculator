import { fmt, round2 } from "./money.js";
import type { TaxRules } from "./types.js";

export type ContributionBase = {
  base_ron: number;
  formula: string;
};

/**
 * Tier model (stored in tax rules, unverified until you confirm it):
 * - Income below the first tier: base 0.
 * - Inside a band: base is the lower tier times the minimum wage (fixed base).
 * - At or above the top tier: base is actual income, capped at capWages * minimum wage.
 */
export function contributionBase(
  incomeRon: number,
  minWageMonthly: number,
  tiers: number[],
  capWages: number,
  label: string,
): ContributionBase {
  const income = round2(Math.max(0, incomeRon));
  const sorted = [...tiers].sort((a, b) => a - b);
  if (income <= 0 || sorted.length === 0 || minWageMonthly <= 0) {
    return { base_ron: 0, formula: `${label} base = 0 (no income or no tiers configured)` };
  }

  let matched = 0;
  for (const tier of sorted) {
    if (income + 0.001 >= tier * minWageMonthly) matched = tier;
  }
  if (matched === 0) {
    const first = sorted[0] * minWageMonthly;
    return {
      base_ron: 0,
      formula: `${label} base = 0 because ${fmt(income)} RON is under ${sorted[0]} x ${fmt(minWageMonthly)} = ${fmt(first)} RON`,
    };
  }

  const top = sorted[sorted.length - 1];
  const cap = round2(capWages * minWageMonthly);
  if (income + 0.001 >= top * minWageMonthly) {
    const base = round2(Math.min(income, cap));
    return {
      base_ron: base,
      formula: `${label} base = min(${fmt(income)} RON, ${capWages} x ${fmt(minWageMonthly)} = ${fmt(cap)} RON) = ${fmt(base)} RON`,
    };
  }

  const base = round2(matched * minWageMonthly);
  return {
    base_ron: base,
    formula: `${label} base = ${matched} x minimum wage ${fmt(minWageMonthly)} = ${fmt(base)} RON (income ${fmt(income)} RON is in this tier)`,
  };
}

export function casBase(incomeRon: number, rules: TaxRules): ContributionBase {
  return contributionBase(
    incomeRon,
    rules.minimum_gross_wage,
    rules.cas_tiers,
    rules.cas_cap_min_wages,
    "CAS",
  );
}

export function cassBase(incomeRon: number, rules: TaxRules): ContributionBase {
  return contributionBase(
    incomeRon,
    rules.minimum_gross_wage,
    rules.cass_tiers,
    rules.cass_cap_min_wages,
    "CASS",
  );
}
