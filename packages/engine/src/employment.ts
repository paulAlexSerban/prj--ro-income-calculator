import { fmt, pct, round2 } from "./money.js";
import type { BreakdownLine, TaxRules } from "./types.js";

export type EmploymentOptions = {
  dependants: number;
  it_exempt: boolean;
  min_wage_allowance: boolean;
  apply_personal_deduction: boolean;
};

export type EmploymentResult = {
  gross: number;
  cas: number;
  cass: number;
  personal_deduction: number;
  allowance: number;
  taxable: number;
  income_tax: number;
  net: number;
  cam: number;
  employer_cost: number;
  lines: BreakdownLine[];
  warnings: string[];
};

export function personalDeductionMonthly(
  gross: number,
  dependants: number,
  rules: TaxRules,
): { amount: number; formula: string } {
  const config = rules.personal_deduction;
  if (!config.enabled) {
    return {
      amount: 0,
      formula: "Personal deduction (deducere personală) = 0 (disabled in tax rules)",
    };
  }
  const bands = [...config.bands].sort(
    (a, b) => (a.gross_up_to ?? Number.POSITIVE_INFINITY) - (b.gross_up_to ?? Number.POSITIVE_INFINITY),
  );
  for (const band of bands) {
    if (band.gross_up_to == null || gross <= band.gross_up_to + 0.001) {
      const amount = round2(band.base_deduction + band.per_dependant * dependants);
      const cap = band.gross_up_to == null ? "no cap" : `${fmt(band.gross_up_to)} RON`;
      return {
        amount,
        formula: `Personal deduction = ${fmt(band.base_deduction)} + ${dependants} dependants x ${fmt(band.per_dependant)} = ${fmt(amount)} RON (gross ${fmt(gross)} is within ${cap}). UNVERIFIED table.`,
      };
    }
  }
  return {
    amount: 0,
    formula: `Personal deduction = 0 (gross ${fmt(gross)} RON is above every configured band)`,
  };
}

export function employmentOnGross(
  grossInput: number,
  rules: TaxRules,
  options: EmploymentOptions,
): EmploymentResult {
  const gross = round2(Math.max(0, grossInput));
  const warnings: string[] = [];
  const cas = round2(gross * rules.cas_rate);
  const cass = round2(gross * rules.cass_rate);
  const deduction = options.apply_personal_deduction
    ? personalDeductionMonthly(gross, options.dependants, rules)
    : { amount: 0, formula: "Personal deduction = 0 (not applied to this amount)" };

  let allowance = 0;
  let allowanceFormula = "Minimum-wage tax-free allowance = 0 (toggle off)";
  if (options.min_wage_allowance) {
    if (rules.min_wage_tax_free_allowance.enabled && rules.min_wage_tax_free_allowance.monthly_amount > 0) {
      allowance = round2(rules.min_wage_tax_free_allowance.monthly_amount);
      allowanceFormula = `Minimum-wage tax-free allowance = ${fmt(allowance)} RON (offer toggle on, amount from tax rules). UNVERIFIED.`;
    } else {
      allowanceFormula =
        "Minimum-wage tax-free allowance toggle is on, but the tax rule is disabled or the amount is 0. Nothing was deducted. UNVERIFIED.";
      warnings.push(allowanceFormula);
    }
  }

  const taxable = round2(Math.max(0, gross - cas - cass - deduction.amount - allowance));
  const incomeTax = options.it_exempt ? 0 : round2(taxable * rules.income_tax_rate);
  if (options.it_exempt) {
    warnings.push(
      "IT-sector income tax exemption is on: income tax is 0. CAS and CASS still apply. Confirm eligibility (activity, employer, income cap) before relying on this.",
    );
  }
  const net = round2(gross - cas - cass - incomeTax);
  const cam = round2(gross * rules.cam_rate);
  const employerCost = round2(gross + cam);

  const lines: BreakdownLine[] = [
    {
      key: "gross",
      label: "Gross (brut)",
      amount_ron: gross,
      formula: `Gross = ${fmt(gross)} RON`,
    },
    {
      key: "cas",
      label: "Pension contribution (CAS)",
      amount_ron: cas,
      formula: `CAS = ${fmt(gross)} x ${pct(rules.cas_rate)} = ${fmt(cas)} RON`,
    },
    {
      key: "cass",
      label: "Health contribution (CASS)",
      amount_ron: cass,
      formula: `CASS = ${fmt(gross)} x ${pct(rules.cass_rate)} = ${fmt(cass)} RON`,
    },
    {
      key: "personal_deduction",
      label: "Personal deduction (deducere personală)",
      amount_ron: deduction.amount,
      formula: deduction.formula,
    },
    {
      key: "allowance",
      label: "Minimum-wage allowance (scutire)",
      amount_ron: allowance,
      formula: allowanceFormula,
    },
    {
      key: "taxable",
      label: "Taxable base (bază impozabilă)",
      amount_ron: taxable,
      formula: `Taxable = max(0, ${fmt(gross)} − ${fmt(cas)} − ${fmt(cass)} − ${fmt(deduction.amount)} − ${fmt(allowance)}) = ${fmt(taxable)} RON`,
    },
    {
      key: "income_tax",
      label: "Income tax (impozit pe venit)",
      amount_ron: incomeTax,
      formula: options.it_exempt
        ? "Income tax = 0 (IT-sector exemption toggle)"
        : `Income tax = ${fmt(taxable)} x ${pct(rules.income_tax_rate)} = ${fmt(incomeTax)} RON`,
    },
    {
      key: "net",
      label: "Net (net)",
      amount_ron: net,
      formula: `Net = ${fmt(gross)} − ${fmt(cas)} − ${fmt(cass)} − ${fmt(incomeTax)} = ${fmt(net)} RON`,
    },
    {
      key: "cam",
      label: "Employer labour contribution (CAM)",
      amount_ron: cam,
      formula: `CAM = ${fmt(gross)} x ${pct(rules.cam_rate)} = ${fmt(cam)} RON`,
    },
    {
      key: "employer_cost",
      label: "Employer cost (cost total angajator)",
      amount_ron: employerCost,
      formula: `Employer cost = ${fmt(gross)} + ${fmt(cam)} = ${fmt(employerCost)} RON`,
    },
  ];

  return {
    gross,
    cas,
    cass,
    personal_deduction: deduction.amount,
    allowance,
    taxable,
    income_tax: incomeTax,
    net,
    cam,
    employer_cost: employerCost,
    lines,
    warnings,
  };
}
