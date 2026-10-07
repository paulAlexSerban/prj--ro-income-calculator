import { describe, expect, it } from "vitest";
import { calculate } from "./calculate.js";
import { compare, growthBetween, toComparedItem } from "./compare.js";
import { convertPeriods } from "./convert.js";
import { casBase, cassBase } from "./contributions.js";
import { employmentOnGross } from "./employment.js";
import { binarySearch } from "./money.js";
import { resolveRules } from "./rules.js";
import { breakEvenMonth, runTimeline } from "./timeline.js";
import { eurFx, ronFx, rulesOn, seedRuleRows, usdFx } from "./fixture.js";
import type { OfferInput } from "./types.js";

const rules = rulesOn("2026-03-01");
const july = rulesOn("2026-07-01");

function employmentOffer(amount: number, overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    label: "CIM",
    contract_type: "EMPLOYMENT",
    amount,
    rate_type: "MONTHLY_GROSS",
    currency: "RON",
    status: "current",
    is_current: true,
    notes: "",
    ...overrides,
  };
}

describe("employment", () => {
  it("computes gross to net with CAS, CASS and 10% tax", () => {
    const result = employmentOnGross(10000, rules, {
      dependants: 0,
      it_exempt: false,
      min_wage_allowance: false,
      apply_personal_deduction: true,
    });
    expect(result.cas).toBe(2500);
    expect(result.cass).toBe(1000);
    expect(result.taxable).toBe(6500);
    expect(result.income_tax).toBe(650);
    expect(result.net).toBe(5850);
    expect(result.cam).toBe(225);
    expect(result.employer_cost).toBe(10225);
  });

  it("zeroes income tax when the IT exemption is on and keeps contributions", () => {
    const result = employmentOnGross(10000, rules, {
      dependants: 0,
      it_exempt: true,
      min_wage_allowance: false,
      apply_personal_deduction: true,
    });
    expect(result.income_tax).toBe(0);
    expect(result.cas).toBe(2500);
    expect(result.net).toBe(6500);
  });

  it("round-trips net to gross through the same forward function", () => {
    const target = 5850;
    const solved = binarySearch(
      target,
      (gross) =>
        employmentOnGross(gross, rules, {
          dependants: 0,
          it_exempt: false,
          min_wage_allowance: false,
          apply_personal_deduction: true,
        }).net,
    );
    expect(solved).toBe(10000);
    const viaCalculate = calculate({
      offer: employmentOffer(target, { rate_type: "MONTHLY_NET" }),
      rules,
      fx: ronFx(),
      display: ronFx(),
      eur: eurFx(),
      usd: usdFx(),
    });
    expect(viaCalculate.reversed?.solved_gross_or_revenue_ron).toBe(10000);
    expect(viaCalculate.selected.net_monthly_ron).toBe(5850);
  });
});

describe("CAS and CASS tiers", () => {
  const wage = 4050;
  it("uses a zero base under the first tier and fixed bases inside bands", () => {
    expect(cassBase(6 * wage - 1, rules).base_ron).toBe(0);
    expect(cassBase(6 * wage, rules).base_ron).toBe(6 * wage);
    expect(cassBase(12 * wage - 1, rules).base_ron).toBe(6 * wage);
    expect(cassBase(12 * wage, rules).base_ron).toBe(12 * wage);
    expect(cassBase(24 * wage - 1, rules).base_ron).toBe(12 * wage);
    expect(casBase(12 * wage - 1, rules).base_ron).toBe(0);
    expect(casBase(12 * wage, rules).base_ron).toBe(12 * wage);
    expect(casBase(24 * wage - 1, rules).base_ron).toBe(12 * wage);
  });

  it("caps CAS at 24 minimum wages and CASS at 72", () => {
    expect(casBase(24 * wage, rules).base_ron).toBe(24 * wage);
    expect(casBase(200000, rules).base_ron).toBe(24 * wage);
    expect(cassBase(24 * wage, rules).base_ron).toBe(24 * wage);
    expect(cassBase(300000, rules).base_ron).toBe(72 * wage);
  });

  it("picks the July minimum wage when the date is 1 July 2026", () => {
    expect(july.minimum_gross_wage).toBe(4325);
    expect(rules.minimum_gross_wage).toBe(4050);
    expect(cassBase(6 * 4325, july).base_ron).toBe(6 * 4325);
    expect(cassBase(6 * 4325, rules).base_ron).toBe(6 * wage);
  });
});

describe("B2B regimes", () => {
  const revenue = 200000;
  const expenses = 20000;

  function b2b(regime: NonNullable<OfferInput["b2b"]> = {}) {
    return calculate({
      offer: {
        label: "B2B",
        contract_type: "B2B",
        amount: 1000,
        rate_type: "DAILY_GROSS",
        currency: "RON",
        status: "offer",
        is_current: false,
        notes: "",
        assumptions: { billable_days_per_year: 200, working_days_per_month: 20, hours_per_day: 8 },
        b2b: {
          other_deductible_annual: expenses,
          regime: "best",
          ...regime,
        },
      },
      rules,
      fx: ronFx(),
      display: ronFx(),
      eur: eurFx(),
      usd: usdFx(),
    });
  }

  it("taxes PFA actual income and applies the caps", () => {
    const result = b2b({});
    const real = result.regimes.find((item) => item.regime === "pfa_real")!;
    // taxable 180000; CAS base 24*4050=97200; CASS base 180000
    expect(real.taxes_yearly_ron).toBe(18000);
    expect(real.contributions_yearly_ron).toBe(24300 + 18000);
    expect(real.net_yearly_ron).toBe(200000 - 20000 - 18000 - 24300 - 18000);
  });

  it("taxes the norm, not revenue, for PFA norma de venit", () => {
    const result = b2b({ annual_norm: 60000 });
    const norm = result.regimes.find((item) => item.regime === "pfa_norm")!;
    // 60000 is in the 12-wage band. Base = 12*4050 = 48600
    expect(norm.taxes_yearly_ron).toBe(6000);
    expect(norm.contributions_yearly_ron).toBe(12150 + 4860);
    expect(norm.net_yearly_ron).toBe(200000 - 20000 - 6000 - 12150 - 4860);
  });

  it("computes SRL micro and profit side by side and highlights the best net", () => {
    const result = b2b({});
    const micro = result.regimes.find((item) => item.regime === "srl_micro")!;
    const profit = result.regimes.find((item) => item.regime === "srl_profit")!;
    // micro tax 2000; distributable 178000; div tax 28480; CASS 17800
    expect(micro.taxes_yearly_ron).toBe(2000 + 28480);
    expect(micro.contributions_yearly_ron).toBe(17800);
    expect(micro.net_yearly_ron).toBe(178000 - 28480 - 17800);
    // profit 180000; tax 28800; distributable 151200; div tax 24192; CASS 15120
    expect(profit.taxes_yearly_ron).toBe(28800 + 24192);
    expect(profit.net_yearly_ron).toBe(151200 - 24192 - 15120);
    expect(result.regimes.some((item) => item.best)).toBe(true);
    expect(result.selected.regime).toBe(result.regimes.find((item) => item.best)?.regime);
    expect(micro.warnings.some((warning) => warning.includes("cannot return"))).toBe(true);
  });

  it("includes the IP regime only when rules and the offer allow it", () => {
    const disabled = b2b({ pfa_ip: true });
    expect(disabled.regimes.some((item) => item.regime === "pfa_ip40")).toBe(false);
    const enabledRules = resolveRules(
      seedRuleRows().map((row) => (row.key === "pfa_ip_enabled" ? { ...row, value: true } : row)),
      "2026-03-01",
      "2026-10-07",
    );
    const enabled = calculate({
      offer: {
        label: "IP",
        contract_type: "B2B",
        amount: 1000,
        rate_type: "DAILY_GROSS",
        currency: "RON",
        status: "offer",
        is_current: false,
        notes: "",
        assumptions: { billable_days_per_year: 200 },
        b2b: { pfa_ip: true, other_deductible_annual: 0 },
      },
      rules: enabledRules,
      fx: ronFx(),
      display: ronFx(),
      eur: eurFx(),
      usd: usdFx(),
    });
    const ip = enabled.regimes.find((item) => item.regime === "pfa_ip40")!;
    // taxable = 60% of 200000 = 120000; tax 12000; CAS cap 97200; CASS 120000
    expect(ip.taxes_yearly_ron).toBe(12000);
    expect(ip.contributions_yearly_ron).toBe(24300 + 12000);
    expect(ip.net_yearly_ron).toBe(200000 - 12000 - 24300 - 12000);
  });
});

describe("conversions and FX", () => {
  it("chains hourly to daily to monthly to yearly", () => {
    const periods = convertPeriods({
      amountRon: 100,
      rateType: "HOURLY_GROSS",
      contractType: "B2B",
      hoursPerDay: 8,
      workingDaysPerMonth: 21,
      billableDaysPerYear: 220,
    });
    expect(periods.daily_ron).toBe(800);
    expect(periods.monthly_nominal_ron).toBe(16800);
    expect(periods.yearly_ron).toBe(176000);
    const employment = convertPeriods({
      amountRon: 100,
      rateType: "HOURLY_GROSS",
      contractType: "EMPLOYMENT",
      hoursPerDay: 8,
      workingDaysPerMonth: 21,
      billableDaysPerYear: 220,
    });
    expect(employment.yearly_ron).toBe(16800 * 12);
  });

  it("converts EUR with the offer rate and reports it", () => {
    const result = calculate({
      offer: employmentOffer(2000, { currency: "EUR" }),
      rules,
      fx: eurFx(5),
      display: ronFx(),
      eur: eurFx(5),
      usd: usdFx(),
    });
    expect(result.fx.rate_to_ron).toBe(5);
    expect(result.fx.source).toBe("test");
    expect(result.selected.gross_monthly_ron).toBe(10000);
    expect(result.selected.net_monthly_ron).toBe(5850);
  });
});

describe("compare", () => {
  it("splits RON growth from the display-currency FX effect", () => {
    const current = toComparedItem({
      id: "current",
      label: "Current",
      status: "current",
      is_current: true,
      original_amount: 10000,
      original_rate_type: "MONTHLY_GROSS",
      original_currency: "EUR",
      display_currency: "EUR",
      display_rate_to_ron: 5,
      result: calculate({
        offer: employmentOffer(10000, { currency: "EUR", label: "Current" }),
        rules,
        fx: eurFx(5),
        display: eurFx(5),
        eur: eurFx(5),
        usd: usdFx(),
      }),
    });
    const next = toComparedItem({
      id: "next",
      label: "Next",
      status: "offer",
      is_current: false,
      original_amount: 10000,
      original_rate_type: "MONTHLY_GROSS",
      original_currency: "EUR",
      display_currency: "EUR",
      display_rate_to_ron: 5,
      result: calculate({
        offer: employmentOffer(10000, { currency: "EUR", label: "Next", status: "offer", is_current: false }),
        rules,
        fx: eurFx(5.5),
        display: eurFx(5),
        eur: eurFx(5.5),
        usd: usdFx(),
      }),
    });
    const growth = growthBetween(current, next);
    expect(growth.net_ron).toBeCloseTo(0.1, 5);
    expect(growth.net_display).toBeCloseTo(0, 5);
    expect(growth.fx_effect_net).toBeCloseTo(-0.1, 5);
    const report = compare({
      items: [current, next],
      baseline_id: "current",
      pair: { a: "current", b: "next" },
      chain: ["current", "next"],
      display_currency: "EUR",
    });
    expect(report.chain).toHaveLength(1);
    expect(report.versus_baseline.next.net_ron).toBeCloseTo(0.1, 5);
  });
});

describe("timeline", () => {
  it("applies a compounding raise and finds the break-even month", () => {
    const fx = () => eurFx(5);
    const shared = {
      start_date: "2026-01-01",
      horizon_months: 6,
      display_currency: "RON" as const,
      rules_for: () => rules,
      fx_for: () => fx(),
      inflation_for_year: () => 0,
      use_inflation: false,
    };
    const stay = employmentOffer(10000, { label: "Stay" });
    const jump = employmentOffer(8000, { label: "Jump" });
    const result = runTimeline({
      ...shared,
      pair: { a: "stay", b: "jump" },
      tracks: [
        {
          id: "stay",
          label: "Stay",
          color: "#111",
          offer: stay,
          regime: "employment",
          raises: [],
          adjustments: {
            annual_bonus_month: null,
            annual_bonus_gross: 0,
            annual_bonus_currency: "RON",
            one_offs: [],
          },
        },
        {
          id: "jump",
          label: "Jump",
          color: "#222",
          offer: jump,
          regime: "employment",
          raises: [
            {
              effective_month_index: 2,
              kind: "percent",
              base: "gross",
              value: 50,
              compounding: true,
            },
          ],
          adjustments: {
            annual_bonus_month: null,
            annual_bonus_gross: 0,
            annual_bonus_currency: "RON",
            one_offs: [],
          },
        },
      ],
    });
    const stayNet = result.tracks[0].months[0].net_monthly_ron;
    const jumpBefore = result.tracks[1].months[1].net_monthly_ron;
    const jumpAfter = result.tracks[1].months[2].net_monthly_ron;
    expect(stayNet).toBe(5850);
    expect(jumpBefore).toBeLessThan(stayNet);
    expect(jumpAfter).toBeGreaterThan(jumpBefore);
    expect(result.tracks[1].months[2].raise_applied).toBe(true);
    expect(result.tracks[1].aggregates.total_growth).toBeGreaterThan(0);
    expect(result.tracks[1].aggregates.cagr).not.toBeNull();
    expect(result.pair?.break_even_month_index).not.toBeNull();
  });

  it("flags future months that reuse the latest rules", () => {
    const futureRules = rulesOn("2028-01-01", "2026-10-07");
    expect(futureRules.future_rules_assumed).toBe(true);
    expect(futureRules.minimum_gross_wage).toBe(4325);
  });
});

describe("break-even", () => {
  it("returns the first month the second track catches up", () => {
    expect(breakEvenMonth([10, 10, 10], [0, 0, 40])).toEqual({ index: 2, ahead_from_start: false });
    expect(breakEvenMonth([5, 5], [6, 6]).ahead_from_start).toBe(true);
  });
});
