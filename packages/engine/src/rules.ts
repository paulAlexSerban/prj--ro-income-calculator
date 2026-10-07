import type { PersonalDeductionBand, TaxRuleRow, TaxRules } from "./types.js";

const REQUIRED_NUMBER_KEYS = [
  "income_tax_rate",
  "cas_rate",
  "cass_rate",
  "cam_rate",
  "dividend_tax_rate",
  "profit_tax_rate",
  "micro_tax_rate",
  "micro_turnover_threshold_eur",
  "micro_employee_required",
  "micro_exit_lock_years",
  "minimum_gross_wage",
  "cas_cap_min_wages",
  "cass_cap_min_wages",
  "pfa_ip_flat_deduction_rate",
] as const;

function asNumber(value: unknown, key: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new Error(`Tax rule "${key}" is not a number`);
  }
  return n;
}

function asNumberArray(value: unknown, key: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "number")) {
    throw new Error(`Tax rule "${key}" must be a non-empty array of numbers`);
  }
  return [...value].sort((a, b) => a - b);
}

function asBoolean(value: unknown, key: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Tax rule "${key}" is not a boolean`);
}

function pickRows(rows: TaxRuleRow[], asOf: string): Map<string, TaxRuleRow> {
  const chosen = new Map<string, TaxRuleRow>();
  for (const row of rows) {
    if (row.effective_from > asOf) continue;
    const prev = chosen.get(row.key);
    if (!prev || row.effective_from > prev.effective_from) chosen.set(row.key, row);
  }
  const keys = new Set(rows.map((row) => row.key));
  for (const key of keys) {
    if (chosen.has(key)) continue;
    const future = rows
      .filter((row) => row.key === key)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0];
    if (future) chosen.set(key, future);
  }
  return chosen;
}

function requireRow(chosen: Map<string, TaxRuleRow>, key: string): TaxRuleRow {
  const row = chosen.get(key);
  if (!row) throw new Error(`Missing tax rule "${key}"`);
  return row;
}

export function resolveRules(rows: TaxRuleRow[], asOf: string, today: string): TaxRules {
  const chosen = pickRows(rows, asOf);
  const numbers = {} as Record<(typeof REQUIRED_NUMBER_KEYS)[number], number>;
  for (const key of REQUIRED_NUMBER_KEYS) {
    numbers[key] = asNumber(requireRow(chosen, key).value, key);
  }

  const personal = requireRow(chosen, "personal_deduction").value;
  if (!personal || typeof personal !== "object" || Array.isArray(personal)) {
    throw new Error('Tax rule "personal_deduction" must be an object');
  }
  const personalObj = personal as {
    enabled?: unknown;
    bands?: PersonalDeductionBand[];
  };
  const bands = Array.isArray(personalObj.bands) ? personalObj.bands : [];

  const allowance = requireRow(chosen, "min_wage_tax_free_allowance").value;
  if (!allowance || typeof allowance !== "object" || Array.isArray(allowance)) {
    throw new Error('Tax rule "min_wage_tax_free_allowance" must be an object');
  }
  const allowanceObj = allowance as { enabled?: unknown; monthly_amount?: unknown };

  const director = requireRow(chosen, "director_salary").value;
  if (!director || typeof director !== "object" || Array.isArray(director)) {
    throw new Error('Tax rule "director_salary" must be an object');
  }
  const directorObj = director as { employer_cam_applies?: unknown };

  const sources = [...chosen.values()].map((row) => ({
    key: row.key,
    effective_from: row.effective_from,
    verified: row.verified,
    note: row.note,
  }));
  const maxEffective = rows.reduce(
    (max, row) => (row.effective_from > max ? row.effective_from : max),
    "0000-01-01",
  );
  const wageRow = requireRow(chosen, "minimum_gross_wage");
  const future = asOf > today && asOf > maxEffective;
  const taxYear = wageRow.tax_year;

  return {
    as_of: asOf,
    tax_year: taxYear,
    future_rules_assumed: future,
    label: future
      ? `${taxYear} rules carried forward (future rules assumed)`
      : `${taxYear} rules effective ${wageRow.effective_from}`,
    verified: sources.every((source) => source.verified),
    income_tax_rate: numbers.income_tax_rate,
    cas_rate: numbers.cas_rate,
    cass_rate: numbers.cass_rate,
    cam_rate: numbers.cam_rate,
    dividend_tax_rate: numbers.dividend_tax_rate,
    profit_tax_rate: numbers.profit_tax_rate,
    micro_tax_rate: numbers.micro_tax_rate,
    micro_turnover_threshold_eur: numbers.micro_turnover_threshold_eur,
    micro_employee_required: numbers.micro_employee_required,
    micro_exit_lock_years: numbers.micro_exit_lock_years,
    minimum_gross_wage: numbers.minimum_gross_wage,
    cas_tiers: asNumberArray(requireRow(chosen, "cas_tiers").value, "cas_tiers"),
    cass_tiers: asNumberArray(requireRow(chosen, "cass_tiers").value, "cass_tiers"),
    cas_cap_min_wages: numbers.cas_cap_min_wages,
    cass_cap_min_wages: numbers.cass_cap_min_wages,
    personal_deduction: {
      enabled: asBoolean(personalObj.enabled, "personal_deduction.enabled"),
      bands: bands.map((band) => ({
        gross_up_to: band.gross_up_to,
        base_deduction: band.base_deduction,
        per_dependant: band.per_dependant,
      })),
    },
    min_wage_tax_free_allowance: {
      enabled: asBoolean(allowanceObj.enabled, "min_wage_tax_free_allowance.enabled"),
      monthly_amount: asNumber(
        allowanceObj.monthly_amount,
        "min_wage_tax_free_allowance.monthly_amount",
      ),
    },
    director_salary: {
      employer_cam_applies: asBoolean(
        directorObj.employer_cam_applies ?? true,
        "director_salary.employer_cam_applies",
      ),
    },
    pfa_ip_flat_deduction_rate: numbers.pfa_ip_flat_deduction_rate,
    pfa_ip_enabled: asBoolean(requireRow(chosen, "pfa_ip_enabled").value, "pfa_ip_enabled"),
    sources,
  };
}
