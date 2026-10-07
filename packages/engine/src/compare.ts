import { fromRon } from "./fx.js";
import type {
  CalculationResult,
  ChainStep,
  ComparedItem,
  CompareResult,
  Currency,
  Growth,
  OfferStatus,
  RegimeId,
  RegimeResult,
} from "./types.js";

export function growthRatio(base: number, next: number): number | null {
  if (!Number.isFinite(base) || base === 0) return null;
  return (next - base) / base;
}

export function growthBetween(
  base: Pick<ComparedItem, "net_monthly_ron" | "gross_monthly_ron" | "net_monthly_display">,
  next: Pick<ComparedItem, "net_monthly_ron" | "gross_monthly_ron" | "net_monthly_display">,
): Growth {
  const net_ron = growthRatio(base.net_monthly_ron, next.net_monthly_ron);
  const gross_ron = growthRatio(base.gross_monthly_ron, next.gross_monthly_ron);
  const net_display = growthRatio(base.net_monthly_display, next.net_monthly_display);
  return {
    net_ron,
    gross_ron,
    net_display,
    fx_effect_net: net_ron == null || net_display == null ? null : net_display - net_ron,
  };
}

export function displayAmount(
  amountRon: number,
  offerCurrency: Currency,
  offerRateToRon: number,
  displayCurrency: Currency,
  displayRateToRon: number,
): number {
  if (displayCurrency === "RON") return fromRon(amountRon, "RON", 1);
  if (displayCurrency === offerCurrency) return fromRon(amountRon, offerCurrency, offerRateToRon);
  return fromRon(amountRon, displayCurrency, displayRateToRon);
}

export function toComparedItem(input: {
  id: string;
  label: string;
  status: OfferStatus;
  is_current: boolean;
  original_amount: number;
  original_rate_type: ComparedItem["original_rate_type"];
  original_currency: Currency;
  result: CalculationResult;
  regime?: RegimeId;
  display_currency: Currency;
  display_rate_to_ron: number;
}): ComparedItem {
  const regime = pickRegime(input.result, input.regime);
  const offerRate = input.result.fx.rate_to_ron;
  const show = (amount: number) =>
    displayAmount(amount, input.original_currency, offerRate, input.display_currency, input.display_rate_to_ron);
  return {
    id: input.id,
    label: input.label,
    contract_type: input.result.contract_type,
    status: input.status,
    is_current: input.is_current,
    regime: regime.regime,
    regime_label: regime.label,
    original_amount: input.original_amount,
    original_rate_type: input.original_rate_type,
    original_currency: input.original_currency,
    gross_monthly_ron: regime.gross_monthly_ron,
    gross_yearly_ron: regime.gross_yearly_ron,
    net_monthly_ron: regime.net_monthly_ron,
    net_yearly_ron: regime.net_yearly_ron,
    taxes_monthly_ron: regime.taxes_monthly_ron,
    contributions_monthly_ron: regime.contributions_monthly_ron,
    employer_cost_monthly_ron: regime.employer_cost_monthly_ron,
    effective_tax_rate: regime.effective_tax_rate,
    gross_monthly_display: show(regime.gross_monthly_ron),
    net_monthly_display: show(regime.net_monthly_ron),
    net_yearly_display: show(regime.net_yearly_ron),
    fx_rate_to_ron: offerRate,
    fx_date: input.result.fx.date,
    fx_source: input.result.fx.source,
  };
}

function pickRegime(result: CalculationResult, regime: RegimeId | undefined): RegimeResult {
  if (regime && regime !== "best") {
    const found = result.regimes.find((item) => item.regime === regime);
    if (found) return found;
  }
  return result.selected;
}

export function compare(input: {
  items: ComparedItem[];
  baseline_id: string | null;
  pair: { a: string; b: string } | null;
  chain: string[];
  display_currency: Currency;
}): CompareResult {
  const byId = new Map(input.items.map((item) => [item.id, item]));
  const versus_baseline: Record<string, Growth> = {};
  const baseline = input.baseline_id ? byId.get(input.baseline_id) : undefined;
  if (baseline) {
    for (const item of input.items) {
      if (item.id === baseline.id) continue;
      versus_baseline[item.id] = growthBetween(baseline, item);
    }
  }

  let pair: CompareResult["pair"] = null;
  if (input.pair) {
    const a = byId.get(input.pair.a);
    const b = byId.get(input.pair.b);
    if (a && b) pair = { a: a.id, b: b.id, ...growthBetween(a, b) };
  }

  const chain: ChainStep[] = [];
  for (let i = 1; i < input.chain.length; i++) {
    const from = byId.get(input.chain[i - 1]);
    const to = byId.get(input.chain[i]);
    if (!from || !to) continue;
    chain.push({
      from_id: from.id,
      to_id: to.id,
      from_label: from.label,
      to_label: to.label,
      ...growthBetween(from, to),
    });
  }

  return {
    items: input.items,
    baseline_id: baseline?.id ?? null,
    versus_baseline,
    pair,
    chain,
    display_currency: input.display_currency,
  };
}
