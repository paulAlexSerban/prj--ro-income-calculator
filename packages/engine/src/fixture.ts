import { resolveRules } from "./rules.js";
import type { FxQuote, TaxRuleRow, TaxRules } from "./types.js";

const NOTE = "Seeded default. Verify against ANAF / Codul Fiscal.";

function row(key: string, value: unknown, effective_from = "2026-01-01"): TaxRuleRow {
  return { key, value, effective_from, note: NOTE, verified: false, tax_year: 2026 };
}

/** Mirrors db/migrations/003_seed.sql. Keep the two in sync. */
export function seedRuleRows(): TaxRuleRow[] {
  return [
    row("income_tax_rate", 0.1),
    row("cas_rate", 0.25),
    row("cass_rate", 0.1),
    row("cam_rate", 0.0225),
    row("dividend_tax_rate", 0.16),
    row("profit_tax_rate", 0.16),
    row("micro_tax_rate", 0.01),
    row("micro_turnover_threshold_eur", 100000),
    row("micro_employee_required", 1),
    row("micro_exit_lock_years", 3),
    row("minimum_gross_wage", 4050, "2026-01-01"),
    row("minimum_gross_wage", 4325, "2026-07-01"),
    row("cas_tiers", [12, 24]),
    row("cass_tiers", [6, 12, 24]),
    row("cas_cap_min_wages", 24),
    row("cass_cap_min_wages", 72),
    row("personal_deduction", {
      enabled: false,
      bands: [
        { gross_up_to: 4050, base_deduction: 810, per_dependant: 100 },
        { gross_up_to: 4500, base_deduction: 500, per_dependant: 80 },
        { gross_up_to: 5000, base_deduction: 200, per_dependant: 40 },
      ],
    }),
    row("min_wage_tax_free_allowance", { enabled: false, monthly_amount: 0 }),
    row("director_salary", { options: ["none", "minimum_wage", "custom"], employer_cam_applies: true }),
    row("pfa_ip_flat_deduction_rate", 0.4),
    row("pfa_ip_enabled", false),
  ];
}

export function rulesOn(asOf: string, today = "2026-10-07"): TaxRules {
  return resolveRules(seedRuleRows(), asOf, today);
}

export function ronFx(): FxQuote {
  return { currency: "RON", rate_to_ron: 1, date: null, source: "identity" };
}

export function eurFx(rate = 5): FxQuote {
  return { currency: "EUR", rate_to_ron: rate, date: "2026-10-07", source: "test" };
}

export function usdFx(rate = 4): FxQuote {
  return { currency: "USD", rate_to_ron: rate, date: "2026-10-07", source: "test" };
}
