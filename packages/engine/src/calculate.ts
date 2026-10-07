import { directorCost, pfaIp40, pfaNorm, pfaReal, srlMicro, srlProfit } from "./b2b.js";
import { convertPeriods } from "./convert.js";
import { employmentOnGross } from "./employment.js";
import { fromRon, toRon } from "./fx.js";
import { binarySearch, fmt, round2, round4 } from "./money.js";
import type {
  BreakdownLine,
  CalculationResult,
  Currency,
  FxQuote,
  NormalizedOffer,
  OfferInput,
  RegimeId,
  RegimeResult,
  TaxRules,
} from "./types.js";
import { REGIME_LABELS, normalizeOffer } from "./types.js";

export type CalculateInput = {
  offer: OfferInput;
  rules: TaxRules;
  /** RON-per-unit quote for the offer currency. Identity when the offer is in RON. */
  fx: FxQuote;
  display: FxQuote;
  eur: FxQuote | null;
  usd: FxQuote | null;
};

type MoneyFn = (amount: number, currency: Currency) => number;

function benefitLines(offer: NormalizedOffer, money: MoneyFn): {
  monthly: number;
  bonusGross: number;
  lines: BreakdownLine[];
} {
  const days = offer.assumptions.working_days_per_month;
  const meal = offer.extras.meal_vouchers_count
    ? round2(offer.extras.meal_vouchers_daily_ron * days)
    : 0;
  const health = offer.extras.health_insurance_count
    ? money(offer.extras.health_insurance_monthly, offer.extras.health_insurance_currency)
    : 0;
  const other = offer.extras.other_monthly_count
    ? money(offer.extras.other_monthly, offer.extras.other_monthly_currency)
    : 0;
  const bonusGross = offer.extras.yearly_bonus_count
    ? money(offer.extras.yearly_bonus_gross, offer.extras.yearly_bonus_currency)
    : 0;
  const lines: BreakdownLine[] = [
    {
      key: "meal",
      label: "Meal vouchers (tichete de masă)",
      amount_ron: meal,
      formula: offer.extras.meal_vouchers_count
        ? `${fmt(offer.extras.meal_vouchers_daily_ron)} RON/day x ${days} days = ${fmt(meal)} RON/month. Added to net as non-taxable. UNVERIFIED tax treatment.`
        : "Meal vouchers are not counted as income.",
    },
    {
      key: "health",
      label: "Private health insurance (asigurare de sănătate)",
      amount_ron: health,
      formula: offer.extras.health_insurance_count
        ? `${fmt(health)} RON/month added to net as non-taxable. UNVERIFIED tax treatment.`
        : "Private health insurance is not counted as income.",
    },
    {
      key: "other",
      label: "Other monthly benefits",
      amount_ron: other,
      formula: offer.extras.other_monthly_count
        ? `${fmt(other)} RON/month added to net as non-taxable. UNVERIFIED tax treatment.`
        : "Other monthly benefits are not counted as income.",
    },
    {
      key: "bonus",
      label: "Yearly bonus (bonus anual, gross)",
      amount_ron: bonusGross,
      formula: offer.extras.yearly_bonus_count
        ? `Gross bonus ${fmt(bonusGross)} RON is taxed with the same engine, then the net is included. UNVERIFIED.`
        : "Yearly bonus is not counted as income.",
    },
  ];
  return { monthly: round2(meal + health + other), bonusGross, lines };
}

function employmentRegime(
  offer: NormalizedOffer,
  rules: TaxRules,
  monthlyGross: number,
  bonusGross: number,
  benefitsMonthly: number,
  benefitLinesList: BreakdownLine[],
): RegimeResult {
  const options = {
    dependants: offer.assumptions.dependants,
    it_exempt: offer.assumptions.it_exempt,
    min_wage_allowance: offer.assumptions.min_wage_allowance,
    apply_personal_deduction: true,
  };
  const month = employmentOnGross(monthlyGross, rules, options);
  const bonus =
    bonusGross > 0
      ? employmentOnGross(bonusGross, rules, {
          dependants: 0,
          it_exempt: offer.assumptions.it_exempt,
          min_wage_allowance: false,
          apply_personal_deduction: false,
        })
      : null;
  const taxesYearly = round2(month.income_tax * 12 + (bonus?.income_tax ?? 0));
  const contributionsYearly = round2((month.cas + month.cass) * 12 + (bonus ? bonus.cas + bonus.cass : 0));
  const salaryNetYearly = round2(month.net * 12 + (bonus?.net ?? 0));
  const netYearly = round2(salaryNetYearly + benefitsMonthly * 12);
  const grossYearly = round2(month.gross * 12 + (bonus?.gross ?? 0));
  const employerYearly = round2(month.employer_cost * 12 + (bonus?.employer_cost ?? 0));
  const lines: BreakdownLine[] = [
    ...month.lines.map((line) =>
      line.key === "gross" || line.key === "net" || line.key === "cas" || line.key === "cass" || line.key === "income_tax"
        ? {
            ...line,
            formula: `${line.formula} Monthly figure. Yearly salary part is x 12.`,
          }
        : line,
    ),
  ];
  if (bonus) {
    lines.push({
      key: "bonus_net",
      label: "Yearly bonus after tax",
      amount_ron: bonus.net,
      formula: `Bonus gross ${fmt(bonus.gross)} → CAS ${fmt(bonus.cas)}, CASS ${fmt(bonus.cass)}, tax ${fmt(bonus.income_tax)}, net ${fmt(bonus.net)} RON. No personal deduction on the bonus.`,
    });
  }
  lines.push(...benefitLinesList);
  lines.push({
    key: "net_yearly",
    label: "Net yearly, benefits included",
    amount_ron: netYearly,
    formula: `Net yearly = salary net ${fmt(month.net)} x 12 + bonus net ${fmt(bonus?.net ?? 0)} + benefits ${fmt(benefitsMonthly)} x 12 = ${fmt(netYearly)} RON`,
  });
  return {
    regime: "employment",
    label: REGIME_LABELS.employment,
    applicable: true,
    gross_monthly_ron: round2(grossYearly / 12),
    gross_yearly_ron: grossYearly,
    net_monthly_ron: round2(netYearly / 12),
    net_yearly_ron: netYearly,
    taxes_yearly_ron: taxesYearly,
    contributions_yearly_ron: contributionsYearly,
    taxes_monthly_ron: round2(taxesYearly / 12),
    contributions_monthly_ron: round2(contributionsYearly / 12),
    benefits_monthly_ron: benefitsMonthly,
    effective_tax_rate: grossYearly > 0 ? round4((taxesYearly + contributionsYearly) / grossYearly) : null,
    employer_cost_monthly_ron: round2(employerYearly / 12),
    lines,
    warnings: [...month.warnings, ...(bonus?.warnings ?? [])],
    best: false,
  };
}

function solvableRegime(regime: RegimeId): RegimeResult["regime"] {
  if (regime === "best" || regime === "employment") return "pfa_real";
  return regime;
}

export function calculate(input: CalculateInput): CalculationResult {
  const offer = normalizeOffer(input.offer);
  const { rules } = input;
  const money: MoneyFn = (amount, currency) => {
    if (currency === "RON") return round2(amount);
    const quote =
      currency === offer.currency
        ? input.fx
        : currency === "EUR"
          ? input.eur
          : currency === "USD"
            ? input.usd
            : null;
    if (!quote) {
      throw new Error(`Cannot convert ${currency} without a rate. Refresh FX or set a manual override.`);
    }
    return toRon(amount, currency, quote);
  };

  const benefits = benefitLines(offer, money);
  const warnings: string[] = [];
  if (!rules.verified) {
    warnings.push("This result uses tax rules that are not marked verified. Check them against ANAF / Codul Fiscal.");
  }
  if (rules.future_rules_assumed) {
    warnings.push("Future rules assumed: no tax ruleset is effective for this month, so the latest known rules were carried forward.");
  }

  let solvedGrossMonthly: number | null = null;
  let solvedRevenue: number | null = null;
  let reverseRegime: RegimeResult["regime"] | null = null;
  let amountRon = toRon(offer.amount, offer.currency, input.fx);

  const expenses = round2(
    money(offer.b2b.accountant_monthly, offer.b2b.accountant_currency) * 12 +
      money(offer.b2b.other_deductible_annual, offer.b2b.other_deductible_currency),
  );
  const norm = money(offer.b2b.annual_norm, offer.b2b.annual_norm_currency);
  let directorMonthly = 0;
  let directorLabel = "No director salary";
  if (offer.b2b.director_salary === "minimum_wage") {
    directorMonthly = rules.minimum_gross_wage;
    directorLabel = `Minimum wage ${fmt(rules.minimum_gross_wage)} RON`;
  } else if (offer.b2b.director_salary === "custom") {
    directorMonthly = money(offer.b2b.director_salary_monthly, offer.b2b.director_salary_currency);
    directorLabel = `Custom ${fmt(directorMonthly)} RON/month`;
  }
  const director = directorCost(directorMonthly, rules, directorLabel);

  const buildB2B = (revenue: number, includeBenefits: boolean): RegimeResult[] => {
    const benefitMonthly = includeBenefits ? benefits.monthly : 0;
    // Contract revenue is the solved/converted amount. A counted bonus is added on top.
    const taxedRevenue = round2(revenue + benefits.bonusGross);
    const eur = input.eur ? fromRon(taxedRevenue, "EUR", input.eur.rate_to_ron) : null;
    const shared = { revenue: taxedRevenue, expenses, rules, benefitsMonthly: benefitMonthly };
    const regimes: RegimeResult[] = [
      pfaNorm({ ...shared, norm }),
      pfaReal(shared),
      srlMicro({
        ...shared,
        director,
        payout: offer.b2b.payout,
        revenueEur: eur,
        hasEmployee: directorMonthly > 0,
      }),
      srlProfit({ ...shared, director, payout: offer.b2b.payout }),
    ];
    const ip = pfaIp40({ ...shared, enabledOnOffer: offer.b2b.pfa_ip });
    if (ip) regimes.push(ip);
    return regimes;
  };

  if (offer.rate_type === "MONTHLY_NET") {
    const targetMonthly = amountRon;
    if (offer.contract_type === "EMPLOYMENT") {
      reverseRegime = "employment";
      solvedGrossMonthly = binarySearch(targetMonthly, (gross) =>
        employmentOnGross(gross, rules, {
          dependants: offer.assumptions.dependants,
          it_exempt: offer.assumptions.it_exempt,
          min_wage_allowance: offer.assumptions.min_wage_allowance,
          apply_personal_deduction: true,
        }).net,
      );
    } else {
      reverseRegime = solvableRegime(offer.b2b.regime);
      if (reverseRegime === "pfa_ip40" && !(rules.pfa_ip_enabled && offer.b2b.pfa_ip)) {
        reverseRegime = "pfa_real";
        warnings.push("IP regime is disabled, so the net was reverse-solved against PFA actual system (sistem real).");
      }
      solvedRevenue = binarySearch(round2(targetMonthly * 12), (revenue) => {
        const found = buildB2B(revenue, false).find((item) => item.regime === reverseRegime);
        return found ? round2(found.net_yearly_ron - found.benefits_monthly_ron * 12) : 0;
      });
    }
  }

  const grossAmountRon =
    offer.rate_type === "MONTHLY_NET"
      ? offer.contract_type === "EMPLOYMENT"
        ? (solvedGrossMonthly ?? 0)
        : 0
      : amountRon;

  const periods =
    offer.contract_type === "B2B" && offer.rate_type === "MONTHLY_NET"
      ? convertPeriods({
          amountRon: (solvedRevenue ?? 0) / Math.max(offer.assumptions.billable_days_per_year, 1),
          rateType: "DAILY_GROSS",
          contractType: "B2B",
          hoursPerDay: offer.assumptions.hours_per_day,
          workingDaysPerMonth: offer.assumptions.working_days_per_month,
          billableDaysPerYear: offer.assumptions.billable_days_per_year,
        })
      : convertPeriods({
          amountRon: offer.contract_type === "EMPLOYMENT" && offer.rate_type === "MONTHLY_NET" ? (solvedGrossMonthly ?? 0) : grossAmountRon,
          rateType: offer.rate_type === "MONTHLY_NET" ? "MONTHLY_GROSS" : offer.rate_type,
          contractType: offer.contract_type,
          hoursPerDay: offer.assumptions.hours_per_day,
          workingDaysPerMonth: offer.assumptions.working_days_per_month,
          billableDaysPerYear: offer.assumptions.billable_days_per_year,
        });

  let regimes: RegimeResult[];
  if (offer.contract_type === "EMPLOYMENT") {
    regimes = [
      employmentRegime(
        offer,
        rules,
        periods.monthly_nominal_ron,
        benefits.bonusGross,
        benefits.monthly,
        benefits.lines,
      ),
    ];
  } else {
    const revenue = offer.rate_type === "MONTHLY_NET" ? (solvedRevenue ?? 0) : periods.yearly_ron;
    regimes = buildB2B(revenue, true);
    if (offer.b2b.pfa_ip && !rules.pfa_ip_enabled) {
      warnings.push("PFA intellectual-property regime is off in tax rules (pfa_ip_enabled). Enable it in Settings to include it.");
    }
  }

  const ranked = regimes.filter((regime) => regime.regime !== "pfa_norm" || norm > 0);
  const pool = ranked.length ? ranked : regimes;
  let bestNet = -Infinity;
  let bestRegime: RegimeResult["regime"] = pool[0].regime;
  for (const regime of pool) {
    if (regime.net_yearly_ron > bestNet) {
      bestNet = regime.net_yearly_ron;
      bestRegime = regime.regime;
    }
  }
  for (const regime of regimes) regime.best = regime.regime === bestRegime;

  const requested: RegimeId =
    offer.contract_type === "EMPLOYMENT" ? "employment" : offer.b2b.regime;
  const selected =
    regimes.find((regime) => regime.regime === requested) ??
    regimes.find((regime) => regime.best) ??
    regimes[0];

  const reversed =
    offer.rate_type === "MONTHLY_NET" && reverseRegime
      ? {
          target_net_monthly_ron: amountRon,
          solved_gross_or_revenue_ron:
            offer.contract_type === "EMPLOYMENT" ? (solvedGrossMonthly ?? 0) : (solvedRevenue ?? 0),
          regime: reverseRegime,
          formula:
            offer.contract_type === "EMPLOYMENT"
              ? `Binary search found gross ${fmt(solvedGrossMonthly ?? 0)} RON/month whose forward net is ${fmt(amountRon)} RON. Benefits and bonus are added after this solve.`
              : `Binary search found invoiced revenue ${fmt(solvedRevenue ?? 0)} RON/year whose ${REGIME_LABELS[reverseRegime]} net is ${fmt(amountRon)} RON/month. Benefits are added after this solve. Bonus, if counted, is included in the forward check.`,
        }
      : null;

  return {
    label: offer.label,
    contract_type: offer.contract_type,
    ruleset: {
      tax_year: rules.tax_year,
      as_of: rules.as_of,
      label: rules.label,
      future_rules_assumed: rules.future_rules_assumed,
      verified: rules.verified,
    },
    fx: {
      currency: offer.currency,
      rate_to_ron: input.fx.rate_to_ron,
      date: input.fx.date,
      source: input.fx.source,
      display_currency: input.display.currency,
      display_rate_to_ron: input.display.rate_to_ron,
      display_date: input.display.date,
      display_source: input.display.source,
    },
    periods,
    reversed,
    regimes,
    selected_regime: selected.regime,
    selected,
    warnings: [...warnings, ...selected.warnings],
  };
}
