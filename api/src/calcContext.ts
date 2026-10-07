import {
  identityQuote,
  resolveQuote,
  resolveRules,
  type Currency,
  type FxOverride,
  type FxQuote,
  type OfferInput,
  type TaxRuleRow,
  type TaxRules,
} from "@offer-compare/engine";
import { db, type OffersTable, type UserSettingsTable } from "./db.js";
import { latestRate } from "./fx.js";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadRules(asOf: string): Promise<TaxRules> {
  const rows = await db.selectFrom("tax_rules").selectAll().orderBy("effective_from", "asc").execute();
  const mapped: TaxRuleRow[] = rows.map((row) => ({
    key: row.key,
    effective_from: row.effective_from,
    value: row.value,
    note: row.note,
    verified: row.verified,
    tax_year: row.tax_year,
  }));
  return resolveRules(mapped, asOf, todayIso());
}

export function asOverride(value: unknown): FxOverride {
  if (!value || typeof value !== "object") return null;
  const record = value as { EUR?: unknown; USD?: unknown };
  const override: { EUR?: number; USD?: number } = {};
  if (typeof record.EUR === "number" && record.EUR > 0) override.EUR = record.EUR;
  if (typeof record.USD === "number" && record.USD > 0) override.USD = record.USD;
  return override;
}

export async function quotesFor(input: {
  asOf: string;
  offerCurrency: Currency;
  displayCurrency: Currency;
  offerOverride?: FxOverride;
  globalOverride?: FxOverride;
}): Promise<{ fx: FxQuote; display: FxQuote; eur: FxQuote | null; usd: FxQuote | null }> {
  const eurMarket = await latestRate("EUR", input.asOf);
  const usdMarket = await latestRate("USD", input.asOf);
  const eur = safeResolve("EUR", eurMarket, input.offerOverride, input.globalOverride);
  const usd = safeResolve("USD", usdMarket, input.offerOverride, input.globalOverride);
  const fx =
    input.offerCurrency === "RON"
      ? identityQuote()
      : resolveQuote(
          input.offerCurrency,
          input.offerCurrency === "EUR" ? eurMarket : usdMarket,
          input.offerOverride,
          input.globalOverride,
        );
  const display =
    input.displayCurrency === "RON"
      ? identityQuote()
      : resolveQuote(
          input.displayCurrency,
          input.displayCurrency === "EUR" ? eurMarket : usdMarket,
          null,
          input.globalOverride,
        );
  return { fx, display, eur, usd };
}

function safeResolve(
  currency: "EUR" | "USD",
  market: FxQuote | null,
  offerOverride?: FxOverride,
  globalOverride?: FxOverride,
): FxQuote | null {
  try {
    return resolveQuote(currency, market, offerOverride, globalOverride);
  } catch {
    return null;
  }
}

export function offerFromRow(row: OffersTable): OfferInput {
  return {
    label: row.label,
    contract_type: row.contract_type,
    amount: row.amount,
    rate_type: row.rate_type,
    currency: row.currency,
    assumptions: (row.assumptions ?? {}) as OfferInput["assumptions"],
    extras: (row.extras ?? {}) as OfferInput["extras"],
    b2b: (row.b2b ?? {}) as OfferInput["b2b"],
    fx_override: asOverride(row.fx_override),
    status: row.status,
    is_current: row.is_current,
    notes: row.notes ?? "",
  };
}

export function settingsOverride(settings: UserSettingsTable | undefined): FxOverride {
  return asOverride(settings?.fx_override);
}
