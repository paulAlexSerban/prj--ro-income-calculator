import { z } from "zod";

export const currencySchema = z.enum(["RON", "EUR", "USD"]);
export type Currency = z.infer<typeof currencySchema>;

export const contractTypeSchema = z.enum(["EMPLOYMENT", "B2B"]);
export type ContractType = z.infer<typeof contractTypeSchema>;

export const rateTypeSchema = z.enum([
  "HOURLY_GROSS",
  "DAILY_GROSS",
  "MONTHLY_GROSS",
  "MONTHLY_NET",
]);
export type RateType = z.infer<typeof rateTypeSchema>;

export const offerStatusSchema = z.enum([
  "idea",
  "interviewing",
  "offer",
  "rejected",
  "current",
]);
export type OfferStatus = z.infer<typeof offerStatusSchema>;

export const regimeIdSchema = z.enum([
  "employment",
  "pfa_norm",
  "pfa_real",
  "pfa_ip40",
  "srl_micro",
  "srl_profit",
  "best",
]);
export type RegimeId = z.infer<typeof regimeIdSchema>;

export const REGIME_LABELS: Record<RegimeId, string> = {
  employment: "Employment (CIM)",
  pfa_norm: "PFA – income norm (norma de venit)",
  pfa_real: "PFA – actual system (sistem real)",
  pfa_ip40: "PFA – intellectual property, 40% flat deduction",
  srl_micro: "SRL – micro-enterprise (microîntreprindere)",
  srl_profit: "SRL – profit tax (impozit pe profit)",
  best: "Best net",
};

export const assumptionsSchema = z.object({
  hours_per_day: z.number().positive().default(8),
  working_days_per_month: z.number().positive().default(21),
  billable_days_per_year: z.number().positive().default(220),
  dependants: z.number().int().min(0).default(0),
  it_exempt: z.boolean().default(false),
  min_wage_allowance: z.boolean().default(false),
});
export type Assumptions = z.infer<typeof assumptionsSchema>;

export const extrasSchema = z.object({
  meal_vouchers_daily_ron: z.number().nonnegative().default(0),
  meal_vouchers_count: z.boolean().default(false),
  yearly_bonus_gross: z.number().nonnegative().default(0),
  yearly_bonus_currency: currencySchema.default("RON"),
  yearly_bonus_count: z.boolean().default(false),
  health_insurance_monthly: z.number().nonnegative().default(0),
  health_insurance_currency: currencySchema.default("RON"),
  health_insurance_count: z.boolean().default(false),
  other_monthly: z.number().nonnegative().default(0),
  other_monthly_currency: currencySchema.default("RON"),
  other_monthly_count: z.boolean().default(false),
});
export type Extras = z.infer<typeof extrasSchema>;

export const b2bSchema = z.object({
  annual_norm: z.number().nonnegative().default(0),
  annual_norm_currency: currencySchema.default("RON"),
  accountant_monthly: z.number().nonnegative().default(0),
  accountant_currency: currencySchema.default("RON"),
  other_deductible_annual: z.number().nonnegative().default(0),
  other_deductible_currency: currencySchema.default("RON"),
  director_salary: z.enum(["none", "minimum_wage", "custom"]).default("none"),
  director_salary_monthly: z.number().nonnegative().default(0),
  director_salary_currency: currencySchema.default("RON"),
  payout: z.enum(["all", "retain"]).default("all"),
  regime: regimeIdSchema.default("best"),
  pfa_ip: z.boolean().default(false),
});
export type B2BInputs = z.infer<typeof b2bSchema>;

export const fxOverrideSchema = z
  .object({
    EUR: z.number().positive().optional(),
    USD: z.number().positive().optional(),
  })
  .partial()
  .nullable()
  .optional();
export type FxOverride = { EUR?: number; USD?: number } | null;

export const offerInputSchema = z.object({
  label: z.string().min(1).default("Offer"),
  contract_type: contractTypeSchema,
  amount: z.number().nonnegative(),
  rate_type: rateTypeSchema,
  currency: currencySchema,
  assumptions: assumptionsSchema.optional(),
  extras: extrasSchema.optional(),
  b2b: b2bSchema.optional(),
  fx_override: fxOverrideSchema,
  status: offerStatusSchema.default("idea"),
  is_current: z.boolean().default(false),
  notes: z.string().default(""),
});
export type OfferInput = z.infer<typeof offerInputSchema>;

export type NormalizedOffer = OfferInput & {
  assumptions: Assumptions;
  extras: Extras;
  b2b: B2BInputs;
};

export function normalizeOffer(input: OfferInput): NormalizedOffer {
  return {
    ...input,
    assumptions: assumptionsSchema.parse(input.assumptions ?? {}),
    extras: extrasSchema.parse(input.extras ?? {}),
    b2b: b2bSchema.parse(input.b2b ?? {}),
    fx_override: input.fx_override ?? null,
    notes: input.notes ?? "",
    status: input.status ?? "idea",
    is_current: input.is_current ?? false,
    label: input.label || "Offer",
  };
}

export type TaxRuleRow = {
  key: string;
  effective_from: string;
  value: unknown;
  note: string;
  verified: boolean;
  tax_year: number;
};

export type PersonalDeductionBand = {
  gross_up_to: number | null;
  base_deduction: number;
  per_dependant: number;
};

export type TaxRules = {
  as_of: string;
  tax_year: number;
  future_rules_assumed: boolean;
  label: string;
  verified: boolean;
  income_tax_rate: number;
  cas_rate: number;
  cass_rate: number;
  cam_rate: number;
  dividend_tax_rate: number;
  profit_tax_rate: number;
  micro_tax_rate: number;
  micro_turnover_threshold_eur: number;
  micro_employee_required: number;
  micro_exit_lock_years: number;
  minimum_gross_wage: number;
  cas_tiers: number[];
  cass_tiers: number[];
  cas_cap_min_wages: number;
  cass_cap_min_wages: number;
  personal_deduction: {
    enabled: boolean;
    bands: PersonalDeductionBand[];
  };
  min_wage_tax_free_allowance: {
    enabled: boolean;
    monthly_amount: number;
  };
  director_salary: {
    employer_cam_applies: boolean;
  };
  pfa_ip_flat_deduction_rate: number;
  pfa_ip_enabled: boolean;
  sources: { key: string; effective_from: string; verified: boolean; note: string }[];
};

export type FxQuote = {
  currency: Currency;
  rate_to_ron: number;
  date: string | null;
  source: string;
};

export type BreakdownLine = {
  key: string;
  label: string;
  amount_ron: number;
  formula: string;
};

export type RegimeResult = {
  regime: Exclude<RegimeId, "best">;
  label: string;
  applicable: boolean;
  gross_monthly_ron: number;
  gross_yearly_ron: number;
  net_monthly_ron: number;
  net_yearly_ron: number;
  taxes_yearly_ron: number;
  contributions_yearly_ron: number;
  taxes_monthly_ron: number;
  contributions_monthly_ron: number;
  benefits_monthly_ron: number;
  effective_tax_rate: number | null;
  employer_cost_monthly_ron: number | null;
  lines: BreakdownLine[];
  warnings: string[];
  best: boolean;
};

export type PeriodBreakdown = {
  hourly_ron: number | null;
  daily_ron: number | null;
  monthly_nominal_ron: number;
  monthly_smoothed_ron: number;
  yearly_ron: number;
  formulas: string[];
};

export type CalculationResult = {
  label: string;
  contract_type: ContractType;
  ruleset: {
    tax_year: number;
    as_of: string;
    label: string;
    future_rules_assumed: boolean;
    verified: boolean;
  };
  fx: {
    currency: Currency;
    rate_to_ron: number;
    date: string | null;
    source: string;
    display_currency: Currency;
    display_rate_to_ron: number;
    display_date: string | null;
    display_source: string;
  };
  periods: PeriodBreakdown;
  reversed: {
    target_net_monthly_ron: number;
    solved_gross_or_revenue_ron: number;
    regime: Exclude<RegimeId, "best">;
    formula: string;
  } | null;
  regimes: RegimeResult[];
  selected_regime: Exclude<RegimeId, "best">;
  selected: RegimeResult;
  warnings: string[];
};

export type ComparedItem = {
  id: string;
  label: string;
  contract_type: ContractType;
  status: OfferStatus;
  is_current: boolean;
  regime: Exclude<RegimeId, "best">;
  regime_label: string;
  original_amount: number;
  original_rate_type: RateType;
  original_currency: Currency;
  gross_monthly_ron: number;
  gross_yearly_ron: number;
  net_monthly_ron: number;
  net_yearly_ron: number;
  taxes_monthly_ron: number;
  contributions_monthly_ron: number;
  employer_cost_monthly_ron: number | null;
  effective_tax_rate: number | null;
  gross_monthly_display: number;
  net_monthly_display: number;
  net_yearly_display: number;
  fx_rate_to_ron: number;
  fx_date: string | null;
  fx_source: string;
  /** Formula text for dashboard tooltips, keyed by metric. */
  formulas: Record<string, string>;
};

export type Growth = {
  net_ron: number | null;
  gross_ron: number | null;
  net_display: number | null;
  fx_effect_net: number | null;
};

export type ChainStep = Growth & {
  from_id: string;
  to_id: string;
  from_label: string;
  to_label: string;
};

export type CompareResult = {
  items: ComparedItem[];
  baseline_id: string | null;
  versus_baseline: Record<string, Growth>;
  pair: ({ a: string; b: string } & Growth) | null;
  chain: ChainStep[];
  display_currency: Currency;
};
