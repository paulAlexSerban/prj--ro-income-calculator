import { round2 } from "./money.js";
import type { Currency, FxOverride, FxQuote } from "./types.js";

export function identityQuote(): FxQuote {
  return { currency: "RON", rate_to_ron: 1, date: null, source: "identity" };
}

export function toRon(amount: number, currency: Currency, quote: FxQuote): number {
  if (currency === "RON") return round2(amount);
  return round2(amount * quote.rate_to_ron);
}

export function fromRon(amountRon: number, currency: Currency, rateToRon: number): number {
  if (currency === "RON") return round2(amountRon);
  if (!rateToRon) return 0;
  return round2(amountRon / rateToRon);
}

export function pickOverride(override: FxOverride | null | undefined, currency: Currency): number | null {
  if (!override || currency === "RON") return null;
  const rate = override[currency];
  return typeof rate === "number" && rate > 0 ? rate : null;
}

/**
 * Offer override, then global override, then the stored market quote.
 * The quote argument is the market rate already loaded for this currency.
 */
export function resolveQuote(
  currency: Currency,
  market: FxQuote | null,
  offerOverride?: FxOverride | null,
  globalOverride?: FxOverride | null,
): FxQuote {
  if (currency === "RON") return identityQuote();
  const offerRate = pickOverride(offerOverride, currency);
  if (offerRate != null) {
    return { currency, rate_to_ron: offerRate, date: null, source: "offer_override" };
  }
  const globalRate = pickOverride(globalOverride, currency);
  if (globalRate != null) {
    return { currency, rate_to_ron: globalRate, date: null, source: "global_override" };
  }
  if (!market || market.rate_to_ron <= 0) {
    throw new Error(`No FX rate for ${currency}. Refresh rates or set a manual override.`);
  }
  return { ...market, currency };
}

/** Project a rate forward. drift is an annual percent, e.g. 2 means +2%/year. */
export function projectRate(rate: number, years: number, driftPercent: number): number {
  if (years <= 0 || driftPercent === 0) return rate;
  return rate * Math.pow(1 + driftPercent / 100, years);
}

export function yearsBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000);
}
