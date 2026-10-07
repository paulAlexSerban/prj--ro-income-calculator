import { calculate } from "./calculate.js";
import { fromRon, identityQuote } from "./fx.js";
import { addMonths, calendarMonth, calendarYear, round2, round4 } from "./money.js";
import type {
  ContractType,
  Currency,
  FxQuote,
  OfferInput,
  RegimeId,
  TaxRules,
} from "./types.js";
import { normalizeOffer } from "./types.js";
import { growthRatio } from "./compare.js";

export type TimelineRaise = {
  effective_month_index: number;
  kind: "percent" | "flat";
  base: "gross" | "net";
  value: number;
  new_rate_type?: OfferInput["rate_type"] | null;
  new_currency?: Currency | null;
  contract_type_change?: ContractType | null;
  compounding: boolean;
};

export type TimelineAdjustments = {
  annual_bonus_month: number | null;
  annual_bonus_gross: number;
  annual_bonus_currency: Currency;
  one_offs: { month_index: number; gross: number; currency: Currency }[];
};

export type TimelineTrackInput = {
  id: string;
  label: string;
  color: string;
  offer: OfferInput;
  regime: RegimeId;
  raises: TimelineRaise[];
  adjustments: TimelineAdjustments;
};

export type MonthPoint = {
  month_index: number;
  month: string;
  gross_monthly_ron: number;
  net_monthly_ron: number;
  taxes_monthly_ron: number;
  contributions_monthly_ron: number;
  effective_tax_rate: number | null;
  net_monthly_display: number;
  gross_monthly_display: number;
  net_monthly_real_ron: number | null;
  rules_label: string;
  rules_verified: boolean;
  future_rules_assumed: boolean;
  fx_rate_to_ron: number;
  fx_date: string | null;
  fx_source: string;
  contract_type: ContractType;
  regime: string;
  raise_applied: boolean;
};

export type TrackAggregates = {
  cumulative_net_ron: number;
  cumulative_gross_ron: number;
  cumulative_taxes_ron: number;
  average_monthly_net_ron: number;
  total_growth: number | null;
  total_growth_display: number | null;
  fx_effect: number | null;
  cagr: number | null;
  cumulative_net_display: number;
  cumulative_net_real_ron: number | null;
};

export type TrackSeries = {
  id: string;
  label: string;
  color: string;
  months: MonthPoint[];
  aggregates: TrackAggregates;
};

export type TimelinePair = {
  a: string;
  b: string;
  cumulative_net_difference_ron: number;
  break_even_month_index: number | null;
  ahead_from_start: boolean;
  monthly_delta_ron: number[];
};

export type TimelineResult = {
  start_date: string;
  horizon_months: number;
  display_currency: Currency;
  tracks: TrackSeries[];
  pair: TimelinePair | null;
};

export type TimelineInput = {
  start_date: string;
  horizon_months: number;
  display_currency: Currency;
  tracks: TimelineTrackInput[];
  rules_for: (monthDate: string) => TaxRules;
  fx_for: (monthDate: string, currency: Currency) => FxQuote;
  /** Annual inflation as a decimal (0.05 = 5%). */
  inflation_for_year: (year: number) => number;
  use_inflation: boolean;
  pair?: { a: string; b: string } | null;
};

function emptyAdjustments(): TimelineAdjustments {
  return {
    annual_bonus_month: null,
    annual_bonus_gross: 0,
    annual_bonus_currency: "RON",
    one_offs: [],
  };
}

function quoteOrIdentity(currency: Currency, quote: FxQuote | null): FxQuote {
  if (currency === "RON") return identityQuote();
  if (!quote) throw new Error(`No FX rate for ${currency}`);
  return quote;
}

export function runTimeline(input: TimelineInput): TimelineResult {
  const start = `${input.start_date.slice(0, 7)}-01`;
  const tracks = input.tracks.map((track) => runTrack(track, input, start));
  return {
    start_date: start,
    horizon_months: input.horizon_months,
    display_currency: input.display_currency,
    tracks,
    pair: input.pair ? pairStats(tracks, input.pair) : null,
  };
}

function runTrack(track: TimelineTrackInput, input: TimelineInput, start: string): TrackSeries {
  const offer = normalizeOffer(structuredClone(track.offer));
  offer.b2b = { ...offer.b2b, regime: track.regime === "employment" ? offer.b2b.regime : track.regime };
  const adjustments = track.adjustments ?? emptyAdjustments();
  let originalAmount = offer.amount;
  let originalGrossMonthly: number | null = null;
  let originalNetMonthly: number | null = null;
  const raises = [...track.raises].sort((a, b) => a.effective_month_index - b.effective_month_index);
  let raiseCursor = 0;
  let inflationFactor = 1;
  const months: MonthPoint[] = [];

  for (let index = 0; index < input.horizon_months; index++) {
    const monthDate = addMonths(start, index);
    let raiseApplied = false;
    while (raiseCursor < raises.length && raises[raiseCursor].effective_month_index === index) {
      const raise = raises[raiseCursor];
      if (raise.contract_type_change) offer.contract_type = raise.contract_type_change;
      if (raise.kind === "flat") {
        offer.amount = raise.value;
        if (raise.new_rate_type) offer.rate_type = raise.new_rate_type;
        if (raise.new_currency) offer.currency = raise.new_currency;
        originalAmount = offer.amount;
        originalGrossMonthly = null;
        originalNetMonthly = null;
      } else {
        const factor = 1 + raise.value / 100;
        if (raise.base === "gross" && offer.rate_type !== "MONTHLY_NET") {
          const base = raise.compounding ? offer.amount : originalAmount;
          offer.amount = round2(base * factor);
        } else {
          const current = calcOffer(offer, track.regime, input, monthDate);
          if (raise.base === "gross") {
            if (originalGrossMonthly == null) originalGrossMonthly = current.nominal_monthly_gross_ron;
            const base = raise.compounding
              ? current.nominal_monthly_gross_ron
              : originalGrossMonthly;
            offer.rate_type = "MONTHLY_GROSS";
            offer.currency = "RON";
            offer.amount = round2(base * factor);
            originalAmount = offer.amount;
          } else {
            if (originalNetMonthly == null) originalNetMonthly = current.net_monthly_ron;
            const base = raise.compounding ? current.net_monthly_ron : originalNetMonthly;
            offer.rate_type = "MONTHLY_NET";
            offer.currency = "RON";
            offer.amount = round2(base * factor);
            originalAmount = offer.amount;
          }
        }
      }
      raiseApplied = true;
      raiseCursor++;
    }

    const base = calcOffer(offer, track.regime, input, monthDate);
    const extraRon = extraGrossThisMonth(adjustments, index, monthDate, input, base.fxQuote);
    let net = base.net_monthly_ron;
    let taxes = base.taxes_monthly_ron;
    let contributions = base.contributions_monthly_ron;
    let gross = base.gross_monthly_ron;
    if (extraRon > 0) {
      const delta = marginalBonus(offer, track.regime, input, monthDate, extraRon);
      net = round2(net + delta.net);
      taxes = round2(taxes + delta.taxes);
      contributions = round2(contributions + delta.contributions);
      gross = round2(gross + extraRon);
    }

    const displayRate = base.display_rate_to_ron;
    const netDisplay = fromRon(net, input.display_currency, displayRate);
    const grossDisplay = fromRon(gross, input.display_currency, displayRate);
    const real = input.use_inflation ? round2(net / inflationFactor) : null;
    months.push({
      month_index: index,
      month: monthDate.slice(0, 7),
      gross_monthly_ron: gross,
      net_monthly_ron: net,
      taxes_monthly_ron: taxes,
      contributions_monthly_ron: contributions,
      effective_tax_rate: gross > 0 ? round4((taxes + contributions) / gross) : null,
      net_monthly_display: netDisplay,
      gross_monthly_display: grossDisplay,
      net_monthly_real_ron: real,
      rules_label: base.rules_label,
      rules_verified: base.rules_verified,
      future_rules_assumed: base.future_rules_assumed,
      fx_rate_to_ron: base.fx_rate_to_ron,
      fx_date: base.fx_date,
      fx_source: base.fx_source,
      contract_type: offer.contract_type,
      regime: base.regime,
      raise_applied: raiseApplied,
    });
    if (input.use_inflation) {
      const annual = input.inflation_for_year(calendarYear(monthDate));
      inflationFactor *= Math.pow(1 + annual, 1 / 12);
    }
  }

  return {
    id: track.id,
    label: track.label,
    color: track.color,
    months,
    aggregates: aggregate(months),
  };
}

type CalcSnap = {
  net_monthly_ron: number;
  gross_monthly_ron: number;
  taxes_monthly_ron: number;
  contributions_monthly_ron: number;
  nominal_monthly_gross_ron: number;
  regime: string;
  rules_label: string;
  rules_verified: boolean;
  future_rules_assumed: boolean;
  fx_rate_to_ron: number;
  fx_date: string | null;
  fx_source: string;
  display_rate_to_ron: number;
  fxQuote: FxQuote;
};

function calcOffer(
  offer: OfferInput,
  regime: RegimeId,
  input: TimelineInput,
  monthDate: string,
): CalcSnap {
  const rules = input.rules_for(monthDate);
  const market = (currency: Currency): FxQuote | null => {
    if (currency === "RON") return identityQuote();
    try {
      return input.fx_for(monthDate, currency);
    } catch {
      return null;
    }
  };
  const overridden = (currency: Currency): FxQuote | null => {
    const rate = offer.fx_override?.[currency];
    if (currency !== "RON" && typeof rate === "number" && rate > 0) {
      return { currency, rate_to_ron: rate, date: null, source: "offer_override" };
    }
    return null;
  };
  const fx = quoteOrIdentity(offer.currency, overridden(offer.currency) ?? market(offer.currency));
  const display = quoteOrIdentity(input.display_currency, market(input.display_currency));
  const eur = overridden("EUR") ?? market("EUR");
  const usd = overridden("USD") ?? market("USD");
  const working = { ...offer, b2b: { ...normalizeOffer(offer).b2b, regime } };
  const result = calculate({ offer: working, rules, fx, display, eur, usd });
  const selected =
    regime !== "best" && regime !== "employment"
      ? (result.regimes.find((item) => item.regime === regime) ?? result.selected)
      : result.selected;
  return {
    net_monthly_ron: selected.net_monthly_ron,
    gross_monthly_ron: selected.gross_monthly_ron,
    taxes_monthly_ron: selected.taxes_monthly_ron,
    contributions_monthly_ron: selected.contributions_monthly_ron,
    nominal_monthly_gross_ron: result.periods.monthly_nominal_ron,
    regime: selected.regime,
    rules_label: result.ruleset.label,
    rules_verified: result.ruleset.verified,
    future_rules_assumed: result.ruleset.future_rules_assumed,
    fx_rate_to_ron: fx.rate_to_ron,
    fx_date: fx.date,
    fx_source: fx.source,
    display_rate_to_ron: display.rate_to_ron,
    fxQuote: fx,
  };
}

function extraGrossThisMonth(
  adjustments: TimelineAdjustments,
  index: number,
  monthDate: string,
  input: TimelineInput,
  offerFx: FxQuote,
): number {
  let total = 0;
  if (
    adjustments.annual_bonus_month != null &&
    calendarMonth(monthDate) === adjustments.annual_bonus_month &&
    adjustments.annual_bonus_gross > 0
  ) {
    total += toCurrency(adjustments.annual_bonus_gross, adjustments.annual_bonus_currency, input, monthDate, offerFx);
  }
  for (const oneOff of adjustments.one_offs) {
    if (oneOff.month_index === index && oneOff.gross > 0) {
      total += toCurrency(oneOff.gross, oneOff.currency, input, monthDate, offerFx);
    }
  }
  return round2(total);
}

function toCurrency(
  amount: number,
  currency: Currency,
  input: TimelineInput,
  monthDate: string,
  offerFx: FxQuote,
): number {
  if (currency === "RON") return amount;
  const quote = currency === offerFx.currency ? offerFx : input.fx_for(monthDate, currency);
  return round2(amount * quote.rate_to_ron);
}

function marginalBonus(
  offer: OfferInput,
  regime: RegimeId,
  input: TimelineInput,
  monthDate: string,
  extraRon: number,
): { net: number; taxes: number; contributions: number } {
  const base = calcOffer(offer, regime, input, monthDate);
  const bumped = normalizeOffer(structuredClone(offer));
  const counted = Boolean(offer.extras?.yearly_bonus_count);
  const existing = counted ? bumped.extras.yearly_bonus_gross : 0;
  const existingCurrency = bumped.extras.yearly_bonus_currency;
  const existingRon = !counted
    ? 0
    : existingCurrency === "RON"
      ? existing
      : round2(
          existing *
            (existingCurrency === offer.currency
              ? base.fx_rate_to_ron
              : input.fx_for(monthDate, existingCurrency).rate_to_ron),
        );
  bumped.extras.yearly_bonus_count = true;
  bumped.extras.yearly_bonus_currency = "RON";
  bumped.extras.yearly_bonus_gross = round2(existingRon + extraRon);
  const next = calcOffer(bumped, regime, input, monthDate);
  return {
    net: round2(next.net_monthly_ron * 12 - base.net_monthly_ron * 12),
    taxes: round2(next.taxes_monthly_ron * 12 - base.taxes_monthly_ron * 12),
    contributions: round2(next.contributions_monthly_ron * 12 - base.contributions_monthly_ron * 12),
  };
}

function aggregate(months: MonthPoint[]): TrackAggregates {
  const cumulative_net_ron = round2(months.reduce((sum, month) => sum + month.net_monthly_ron, 0));
  const cumulative_gross_ron = round2(months.reduce((sum, month) => sum + month.gross_monthly_ron, 0));
  const cumulative_taxes_ron = round2(
    months.reduce((sum, month) => sum + month.taxes_monthly_ron + month.contributions_monthly_ron, 0),
  );
  const cumulative_net_display = round2(months.reduce((sum, month) => sum + month.net_monthly_display, 0));
  const first = months[0];
  const last = months[months.length - 1];
  const total_growth = first && last ? growthRatio(first.net_monthly_ron, last.net_monthly_ron) : null;
  const total_growth_display = first && last ? growthRatio(first.net_monthly_display, last.net_monthly_display) : null;
  const years = months.length > 1 ? (months.length - 1) / 12 : 0;
  let cagr: number | null = null;
  if (first && last && years > 0 && first.net_monthly_ron > 0 && last.net_monthly_ron > 0) {
    cagr = Math.pow(last.net_monthly_ron / first.net_monthly_ron, 1 / years) - 1;
  }
  const realMonths = months.filter((month) => month.net_monthly_real_ron != null);
  return {
    cumulative_net_ron,
    cumulative_gross_ron,
    cumulative_taxes_ron,
    average_monthly_net_ron: months.length ? round2(cumulative_net_ron / months.length) : 0,
    total_growth,
    total_growth_display,
    fx_effect: total_growth == null || total_growth_display == null ? null : total_growth_display - total_growth,
    cagr,
    cumulative_net_display,
    cumulative_net_real_ron:
      realMonths.length === months.length && months.length
        ? round2(realMonths.reduce((sum, month) => sum + (month.net_monthly_real_ron ?? 0), 0))
        : null,
  };
}

export function breakEvenMonth(a: number[], b: number[]): { index: number | null; ahead_from_start: boolean } {
  let cumA = 0;
  let cumB = 0;
  let prev = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    cumA += a[i];
    cumB += b[i];
    const diff = cumB - cumA;
    if (i === 0 && diff >= 0) return { index: 0, ahead_from_start: true };
    if (prev < 0 && diff >= 0) return { index: i, ahead_from_start: false };
    prev = diff;
  }
  return { index: null, ahead_from_start: false };
}

function pairStats(tracks: TrackSeries[], pair: { a: string; b: string }): TimelinePair | null {
  const a = tracks.find((track) => track.id === pair.a);
  const b = tracks.find((track) => track.id === pair.b);
  if (!a || !b) return null;
  const monthly_delta_ron = a.months.map((month, index) =>
    round2((b.months[index]?.net_monthly_ron ?? 0) - month.net_monthly_ron),
  );
  const crossing = breakEvenMonth(
    a.months.map((month) => month.net_monthly_ron),
    b.months.map((month) => month.net_monthly_ron),
  );
  return {
    a: a.id,
    b: b.id,
    cumulative_net_difference_ron: round2(b.aggregates.cumulative_net_ron - a.aggregates.cumulative_net_ron),
    break_even_month_index: crossing.index,
    ahead_from_start: crossing.ahead_from_start,
    monthly_delta_ron,
  };
}
