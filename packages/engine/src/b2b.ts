import { casBase, cassBase } from "./contributions.js";
import { employmentOnGross } from "./employment.js";
import { fmt, pct, round2, round4 } from "./money.js";
import type { BreakdownLine, RegimeResult, TaxRules } from "./types.js";
import { REGIME_LABELS } from "./types.js";

export type DirectorCost = {
  gross_annual: number;
  net_annual: number;
  cas: number;
  cass: number;
  income_tax: number;
  cam: number;
  lines: BreakdownLine[];
  warnings: string[];
  label: string;
};

export function directorCost(grossMonthly: number, rules: TaxRules, label: string): DirectorCost {
  if (grossMonthly <= 0) {
    return {
      gross_annual: 0,
      net_annual: 0,
      cas: 0,
      cass: 0,
      income_tax: 0,
      cam: 0,
      lines: [],
      warnings: [],
      label: "No director salary",
    };
  }
  const month = employmentOnGross(grossMonthly, rules, {
    dependants: 0,
    it_exempt: false,
    min_wage_allowance: false,
    apply_personal_deduction: true,
  });
  const scale = (value: number) => round2(value * 12);
  const cam = rules.director_salary.employer_cam_applies ? scale(month.cam) : 0;
  return {
    gross_annual: scale(month.gross),
    net_annual: scale(month.net),
    cas: scale(month.cas),
    cass: scale(month.cass),
    income_tax: scale(month.income_tax),
    cam,
    label,
    warnings: month.warnings,
    lines: [
      {
        key: "director_gross",
        label: "Director gross salary (salariu brut administrator)",
        amount_ron: scale(month.gross),
        formula: `${label}: ${fmt(month.gross)} RON/month x 12 = ${fmt(scale(month.gross))} RON`,
      },
      {
        key: "director_cas",
        label: "Director pension contribution (CAS)",
        amount_ron: scale(month.cas),
        formula: `Director CAS = ${fmt(month.cas)} x 12 = ${fmt(scale(month.cas))} RON`,
      },
      {
        key: "director_cass",
        label: "Director health contribution (CASS)",
        amount_ron: scale(month.cass),
        formula: `Director CASS = ${fmt(month.cass)} x 12 = ${fmt(scale(month.cass))} RON`,
      },
      {
        key: "director_tax",
        label: "Director income tax (impozit)",
        amount_ron: scale(month.income_tax),
        formula: `Director income tax = ${fmt(month.income_tax)} x 12 = ${fmt(scale(month.income_tax))} RON`,
      },
      {
        key: "director_net",
        label: "Director net salary (salariu net)",
        amount_ron: scale(month.net),
        formula: `Director net = ${fmt(month.net)} x 12 = ${fmt(scale(month.net))} RON`,
      },
      {
        key: "director_cam",
        label: "Employer contribution on director salary (CAM)",
        amount_ron: cam,
        formula: rules.director_salary.employer_cam_applies
          ? `CAM = ${fmt(scale(month.gross))} x ${pct(rules.cam_rate)} = ${fmt(cam)} RON. UNVERIFIED company-cost treatment.`
          : "CAM on director salary = 0 (disabled in tax rules)",
      },
    ],
  };
}

export type RegimeDraft = {
  regime: RegimeResult["regime"];
  revenue: number;
  taxes: number;
  contributions: number;
  net: number;
  employer_cost_yearly: number | null;
  lines: BreakdownLine[];
  warnings: string[];
};

function finish(draft: RegimeDraft, benefitsMonthly: number): RegimeResult {
  const netYearly = round2(draft.net + benefitsMonthly * 12);
  const netMonthly = round2(netYearly / 12);
  const grossYearly = draft.revenue;
  const grossMonthly = round2(grossYearly / 12);
  const rate = grossYearly > 0 ? round4((draft.taxes + draft.contributions) / grossYearly) : null;
  return {
    regime: draft.regime,
    label: REGIME_LABELS[draft.regime],
    applicable: true,
    gross_monthly_ron: grossMonthly,
    gross_yearly_ron: grossYearly,
    net_monthly_ron: netMonthly,
    net_yearly_ron: netYearly,
    taxes_yearly_ron: draft.taxes,
    contributions_yearly_ron: draft.contributions,
    taxes_monthly_ron: round2(draft.taxes / 12),
    contributions_monthly_ron: round2(draft.contributions / 12),
    benefits_monthly_ron: benefitsMonthly,
    effective_tax_rate: rate,
    employer_cost_monthly_ron:
      draft.employer_cost_yearly == null ? null : round2(draft.employer_cost_yearly / 12),
    lines: draft.lines,
    warnings: draft.warnings,
    best: false,
  };
}

function dividendTake(
  distributable: number,
  payout: "all" | "retain",
  rules: TaxRules,
): { gross: number; tax: number; cass: number; net: number; lines: BreakdownLine[]; warnings: string[] } {
  const warnings: string[] = [];
  if (payout === "retain") {
    warnings.push("Payout strategy is retain: dividends are 0. Retained profit is not included in personal net.");
    return {
      gross: 0,
      tax: 0,
      cass: 0,
      net: 0,
      warnings,
      lines: [
        {
          key: "dividends",
          label: "Dividends distributed (dividende)",
          amount_ron: 0,
          formula: "Dividends = 0 (payout strategy: retain)",
        },
      ],
    };
  }
  const gross = round2(Math.max(0, distributable));
  const tax = round2(gross * rules.dividend_tax_rate);
  const base = cassBase(gross, rules);
  const cass = round2(base.base_ron * rules.cass_rate);
  const net = round2(gross - tax - cass);
  return {
    gross,
    tax,
    cass,
    net,
    warnings,
    lines: [
      {
        key: "dividends",
        label: "Dividends distributed (dividende)",
        amount_ron: gross,
        formula: `Dividends = distributable profit ${fmt(gross)} RON (payout: all)`,
      },
      {
        key: "dividend_tax",
        label: "Dividend tax (impozit pe dividende)",
        amount_ron: tax,
        formula: `Dividend tax = ${fmt(gross)} x ${pct(rules.dividend_tax_rate)} = ${fmt(tax)} RON`,
      },
      {
        key: "dividend_cass",
        label: "Health contribution on dividends (CASS)",
        amount_ron: cass,
        formula: `${base.formula}. CASS = ${fmt(base.base_ron)} x ${pct(rules.cass_rate)} = ${fmt(cass)} RON. CAS is not applied to dividends in this model. UNVERIFIED.`,
      },
      {
        key: "dividend_net",
        label: "Net dividends",
        amount_ron: net,
        formula: `Net dividends = ${fmt(gross)} − ${fmt(tax)} − ${fmt(cass)} = ${fmt(net)} RON`,
      },
    ],
  };
}

const VAT_WARNING = "VAT (TVA) is ignored. Revenue is treated as exclusive of VAT.";

export function pfaNorm(input: {
  revenue: number;
  norm: number;
  expenses: number;
  rules: TaxRules;
  benefitsMonthly: number;
}): RegimeResult {
  const { rules } = input;
  const tax = round2(input.norm * rules.income_tax_rate);
  const casInfo = casBase(input.norm, rules);
  const cassInfo = cassBase(input.norm, rules);
  const cas = round2(casInfo.base_ron * rules.cas_rate);
  const cass = round2(cassInfo.base_ron * rules.cass_rate);
  const net = round2(input.revenue - input.expenses - tax - cas - cass);
  const warnings = [VAT_WARNING];
  if (input.norm <= 0) {
    warnings.push("Annual income norm (norma de venit) is 0. Enter the norm published for your activity.");
  }
  warnings.push(
    "Norm expenses are a cash cost and do not change the tax base. The tax base is the norm, not actual profit. UNVERIFIED.",
  );
  return finish(
    {
      regime: "pfa_norm",
      revenue: input.revenue,
      taxes: tax,
      contributions: round2(cas + cass),
      net,
      employer_cost_yearly: null,
      warnings,
      lines: [
        {
          key: "revenue",
          label: "Invoiced revenue (venituri)",
          amount_ron: input.revenue,
          formula: `Revenue = ${fmt(input.revenue)} RON / year`,
        },
        {
          key: "norm",
          label: "Income norm (normă de venit)",
          amount_ron: input.norm,
          formula: `Norm = ${fmt(input.norm)} RON / year (your input)`,
        },
        {
          key: "income_tax",
          label: "Income tax (impozit pe venit)",
          amount_ron: tax,
          formula: `Income tax = norm ${fmt(input.norm)} x ${pct(rules.income_tax_rate)} = ${fmt(tax)} RON`,
        },
        {
          key: "cas",
          label: "Pension contribution (CAS)",
          amount_ron: cas,
          formula: `${casInfo.formula}. CAS = ${fmt(casInfo.base_ron)} x ${pct(rules.cas_rate)} = ${fmt(cas)} RON`,
        },
        {
          key: "cass",
          label: "Health contribution (CASS)",
          amount_ron: cass,
          formula: `${cassInfo.formula}. CASS = ${fmt(cassInfo.base_ron)} x ${pct(rules.cass_rate)} = ${fmt(cass)} RON`,
        },
        {
          key: "expenses",
          label: "Cash expenses (accountant and other)",
          amount_ron: input.expenses,
          formula: `Cash expenses = ${fmt(input.expenses)} RON. Not deducted from the norm.`,
        },
        {
          key: "net",
          label: "Personal net",
          amount_ron: net,
          formula: `Net = ${fmt(input.revenue)} − ${fmt(input.expenses)} − ${fmt(tax)} − ${fmt(cas)} − ${fmt(cass)} = ${fmt(net)} RON`,
        },
      ],
    },
    input.benefitsMonthly,
  );
}

export function pfaReal(input: {
  revenue: number;
  expenses: number;
  rules: TaxRules;
  benefitsMonthly: number;
}): RegimeResult {
  const taxable = round2(Math.max(0, input.revenue - input.expenses));
  const tax = round2(taxable * input.rules.income_tax_rate);
  const casInfo = casBase(taxable, input.rules);
  const cassInfo = cassBase(taxable, input.rules);
  const cas = round2(casInfo.base_ron * input.rules.cas_rate);
  const cass = round2(cassInfo.base_ron * input.rules.cass_rate);
  const net = round2(input.revenue - input.expenses - tax - cas - cass);
  return finish(
    {
      regime: "pfa_real",
      revenue: input.revenue,
      taxes: tax,
      contributions: round2(cas + cass),
      net,
      employer_cost_yearly: null,
      warnings: [
        VAT_WARNING,
        "CAS and CASS use net annual income (revenue minus deductible expenses), before income tax. UNVERIFIED.",
      ],
      lines: [
        {
          key: "revenue",
          label: "Invoiced revenue (venituri)",
          amount_ron: input.revenue,
          formula: `Revenue = ${fmt(input.revenue)} RON / year`,
        },
        {
          key: "expenses",
          label: "Deductible expenses (cheltuieli deductibile)",
          amount_ron: input.expenses,
          formula: `Expenses = ${fmt(input.expenses)} RON / year`,
        },
        {
          key: "taxable",
          label: "Taxable income (venit net)",
          amount_ron: taxable,
          formula: `Taxable = max(0, ${fmt(input.revenue)} − ${fmt(input.expenses)}) = ${fmt(taxable)} RON`,
        },
        {
          key: "income_tax",
          label: "Income tax (impozit pe venit)",
          amount_ron: tax,
          formula: `Income tax = ${fmt(taxable)} x ${pct(input.rules.income_tax_rate)} = ${fmt(tax)} RON`,
        },
        {
          key: "cas",
          label: "Pension contribution (CAS)",
          amount_ron: cas,
          formula: `${casInfo.formula}. CAS = ${fmt(casInfo.base_ron)} x ${pct(input.rules.cas_rate)} = ${fmt(cas)} RON`,
        },
        {
          key: "cass",
          label: "Health contribution (CASS)",
          amount_ron: cass,
          formula: `${cassInfo.formula}. CASS = ${fmt(cassInfo.base_ron)} x ${pct(input.rules.cass_rate)} = ${fmt(cass)} RON`,
        },
        {
          key: "net",
          label: "Personal net",
          amount_ron: net,
          formula: `Net = ${fmt(input.revenue)} − ${fmt(input.expenses)} − ${fmt(tax)} − ${fmt(cas)} − ${fmt(cass)} = ${fmt(net)} RON`,
        },
      ],
    },
    input.benefitsMonthly,
  );
}

export function pfaIp40(input: {
  revenue: number;
  expenses: number;
  rules: TaxRules;
  benefitsMonthly: number;
  enabledOnOffer: boolean;
}): RegimeResult | null {
  if (!input.rules.pfa_ip_enabled || !input.enabledOnOffer) return null;
  const rate = input.rules.pfa_ip_flat_deduction_rate;
  const deduction = round2(input.revenue * rate);
  const taxable = round2(Math.max(0, input.revenue - deduction));
  const tax = round2(taxable * input.rules.income_tax_rate);
  const casInfo = casBase(taxable, input.rules);
  const cassInfo = cassBase(taxable, input.rules);
  const cas = round2(casInfo.base_ron * input.rules.cas_rate);
  const cass = round2(cassInfo.base_ron * input.rules.cass_rate);
  const net = round2(input.revenue - input.expenses - tax - cas - cass);
  return finish(
    {
      regime: "pfa_ip40",
      revenue: input.revenue,
      taxes: tax,
      contributions: round2(cas + cass),
      net,
      employer_cost_yearly: null,
      warnings: [
        VAT_WARNING,
        "The 40% flat deduction replaces itemised expenses in the tax base. Accountant and other costs are still subtracted from cash net, which can double-count them. UNVERIFIED.",
      ],
      lines: [
        {
          key: "revenue",
          label: "Invoiced revenue (venituri)",
          amount_ron: input.revenue,
          formula: `Revenue = ${fmt(input.revenue)} RON / year`,
        },
        {
          key: "flat_deduction",
          label: "Flat deduction (cheltuială forfetară)",
          amount_ron: deduction,
          formula: `Deduction = ${fmt(input.revenue)} x ${pct(rate)} = ${fmt(deduction)} RON`,
        },
        {
          key: "taxable",
          label: "Taxable income",
          amount_ron: taxable,
          formula: `Taxable = ${fmt(input.revenue)} − ${fmt(deduction)} = ${fmt(taxable)} RON`,
        },
        {
          key: "income_tax",
          label: "Income tax (impozit pe venit)",
          amount_ron: tax,
          formula: `Income tax = ${fmt(taxable)} x ${pct(input.rules.income_tax_rate)} = ${fmt(tax)} RON`,
        },
        {
          key: "cas",
          label: "Pension contribution (CAS)",
          amount_ron: cas,
          formula: `${casInfo.formula}. CAS = ${fmt(casInfo.base_ron)} x ${pct(input.rules.cas_rate)} = ${fmt(cas)} RON`,
        },
        {
          key: "cass",
          label: "Health contribution (CASS)",
          amount_ron: cass,
          formula: `${cassInfo.formula}. CASS = ${fmt(cassInfo.base_ron)} x ${pct(input.rules.cass_rate)} = ${fmt(cass)} RON`,
        },
        {
          key: "expenses",
          label: "Cash expenses still subtracted from net",
          amount_ron: input.expenses,
          formula: `Cash expenses = ${fmt(input.expenses)} RON`,
        },
        {
          key: "net",
          label: "Personal net",
          amount_ron: net,
          formula: `Net = ${fmt(input.revenue)} − ${fmt(input.expenses)} − ${fmt(tax)} − ${fmt(cas)} − ${fmt(cass)} = ${fmt(net)} RON`,
        },
      ],
    },
    input.benefitsMonthly,
  );
}

function microLockWarning(rules: TaxRules): string {
  return `Leaving the micro-enterprise regime generally means you cannot return for ${rules.micro_exit_lock_years} years. Verify against Codul Fiscal.`;
}

export function srlMicro(input: {
  revenue: number;
  expenses: number;
  director: DirectorCost;
  payout: "all" | "retain";
  rules: TaxRules;
  benefitsMonthly: number;
  revenueEur: number | null;
  hasEmployee: boolean;
}): RegimeResult {
  const microTax = round2(input.revenue * input.rules.micro_tax_rate);
  const distributable = round2(
    input.revenue - input.expenses - input.director.gross_annual - input.director.cam - microTax,
  );
  const dividends = dividendTake(distributable, input.payout, input.rules);
  const net = round2(input.director.net_annual + dividends.net);
  const warnings = [VAT_WARNING, microLockWarning(input.rules), ...input.director.warnings, ...dividends.warnings];
  if (input.revenueEur == null) {
    warnings.push("EUR rate is missing, so the micro turnover threshold was not checked.");
  } else if (input.revenueEur > input.rules.micro_turnover_threshold_eur + 0.001) {
    warnings.push(
      `Revenue is about ${fmt(input.revenueEur)} EUR, above the configured micro threshold of ${fmt(input.rules.micro_turnover_threshold_eur)} EUR. Micro may be unavailable. Sources conflict on the 2026 threshold (100k vs 250k). UNVERIFIED.`,
    );
  }
  if (!input.hasEmployee && input.rules.micro_employee_required > 0) {
    warnings.push(
      `Micro rules are configured to require at least ${input.rules.micro_employee_required} employee(s). Director salary is none, so this may fail the employee test. UNVERIFIED.`,
    );
  }
  if (distributable < -0.001) {
    warnings.push("Distributable profit is negative. Dividends are 0. Personal net is the director salary only.");
  }
  const taxes = round2(microTax + dividends.tax + input.director.income_tax);
  const contributions = round2(dividends.cass + input.director.cas + input.director.cass);
  return finish(
    {
      regime: "srl_micro",
      revenue: input.revenue,
      taxes,
      contributions,
      net,
      employer_cost_yearly: input.director.cam,
      warnings,
      lines: [
        {
          key: "revenue",
          label: "Invoiced revenue (cifră de afaceri)",
          amount_ron: input.revenue,
          formula: `Revenue = ${fmt(input.revenue)} RON / year`,
        },
        {
          key: "micro_tax",
          label: "Micro turnover tax (impozit micro)",
          amount_ron: microTax,
          formula: `Micro tax = ${fmt(input.revenue)} x ${pct(input.rules.micro_tax_rate)} = ${fmt(microTax)} RON. Expenses do not reduce this tax.`,
        },
        ...input.director.lines,
        {
          key: "expenses",
          label: "Deductible cash expenses",
          amount_ron: input.expenses,
          formula: `Expenses = ${fmt(input.expenses)} RON`,
        },
        {
          key: "distributable",
          label: "Distributable profit",
          amount_ron: round2(Math.max(0, distributable)),
          formula: `Distributable = ${fmt(input.revenue)} − ${fmt(input.expenses)} − director gross ${fmt(input.director.gross_annual)} − CAM ${fmt(input.director.cam)} − micro tax ${fmt(microTax)} = ${fmt(distributable)} RON`,
        },
        ...dividends.lines,
        {
          key: "net",
          label: "Personal net",
          amount_ron: net,
          formula: `Personal net = director net ${fmt(input.director.net_annual)} + net dividends ${fmt(dividends.net)} = ${fmt(net)} RON`,
        },
      ],
    },
    input.benefitsMonthly,
  );
}

export function srlProfit(input: {
  revenue: number;
  expenses: number;
  director: DirectorCost;
  payout: "all" | "retain";
  rules: TaxRules;
  benefitsMonthly: number;
}): RegimeResult {
  const profit = round2(
    input.revenue - input.expenses - input.director.gross_annual - input.director.cam,
  );
  const profitTax = round2(Math.max(0, profit) * input.rules.profit_tax_rate);
  const distributable = round2(profit - profitTax);
  const dividends = dividendTake(distributable, input.payout, input.rules);
  const net = round2(input.director.net_annual + dividends.net);
  const taxes = round2(profitTax + dividends.tax + input.director.income_tax);
  const contributions = round2(dividends.cass + input.director.cas + input.director.cass);
  const warnings = [
    VAT_WARNING,
    microLockWarning(input.rules),
    "Switching between micro and profit tax has eligibility and lock-in rules. UNVERIFIED.",
    ...input.director.warnings,
    ...dividends.warnings,
  ];
  if (distributable < -0.001) {
    warnings.push("Distributable profit is negative. Dividends are 0. Personal net is the director salary only.");
  }
  return finish(
    {
      regime: "srl_profit",
      revenue: input.revenue,
      taxes,
      contributions,
      net,
      employer_cost_yearly: input.director.cam,
      warnings,
      lines: [
        {
          key: "revenue",
          label: "Invoiced revenue (venituri)",
          amount_ron: input.revenue,
          formula: `Revenue = ${fmt(input.revenue)} RON / year`,
        },
        ...input.director.lines,
        {
          key: "expenses",
          label: "Deductible expenses (cheltuieli)",
          amount_ron: input.expenses,
          formula: `Expenses = ${fmt(input.expenses)} RON`,
        },
        {
          key: "profit",
          label: "Accounting profit before tax",
          amount_ron: profit,
          formula: `Profit = ${fmt(input.revenue)} − ${fmt(input.expenses)} − director gross ${fmt(input.director.gross_annual)} − CAM ${fmt(input.director.cam)} = ${fmt(profit)} RON`,
        },
        {
          key: "profit_tax",
          label: "Profit tax (impozit pe profit)",
          amount_ron: profitTax,
          formula: `Profit tax = max(0, ${fmt(profit)}) x ${pct(input.rules.profit_tax_rate)} = ${fmt(profitTax)} RON`,
        },
        {
          key: "distributable",
          label: "Distributable profit",
          amount_ron: round2(Math.max(0, distributable)),
          formula: `Distributable = ${fmt(profit)} − ${fmt(profitTax)} = ${fmt(distributable)} RON`,
        },
        ...dividends.lines,
        {
          key: "net",
          label: "Personal net",
          amount_ron: net,
          formula: `Personal net = director net ${fmt(input.director.net_annual)} + net dividends ${fmt(dividends.net)} = ${fmt(net)} RON`,
        },
      ],
    },
    input.benefitsMonthly,
  );
}
