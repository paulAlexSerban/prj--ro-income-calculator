import { XMLParser } from "fast-xml-parser";
import { projectRate, yearsBetween, type Currency, type FxQuote } from "@offer-compare/engine";
import { db } from "./db.js";

type ParsedRate = { date: string; currency: "EUR" | "USD"; rate_to_ron: number };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  isArray: (name) => name === "Cube" || name === "Rate",
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseBnrXml(xml: string): ParsedRate[] {
  const doc = parser.parse(xml) as {
    DataSet?: { Body?: { Cube?: Array<{ date?: string; Rate?: Array<Record<string, string> | string> }> } };
  };
  const cubes = doc.DataSet?.Body?.Cube ?? [];
  const rows: ParsedRate[] = [];
  for (const cube of cubes) {
    const date = cube.date;
    if (!date) continue;
    for (const rate of asArray(cube.Rate)) {
      if (typeof rate === "string" || typeof rate === "number") continue;
      const currency = rate.currency;
      if (currency !== "EUR" && currency !== "USD") continue;
      const raw = Number(rate["#text"] ?? rate);
      const multiplier = Number(rate.multiplier ?? 1) || 1;
      if (!Number.isFinite(raw) || raw <= 0) continue;
      rows.push({ date, currency, rate_to_ron: raw / multiplier });
    }
  }
  return rows;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function upsertRates(rows: ParsedRate[], source: string): Promise<number> {
  if (rows.length === 0) return 0;
  let count = 0;
  for (const row of rows) {
    await db
      .insertInto("fx_rates")
      .values({
        date: row.date,
        currency: row.currency,
        rate_to_ron: row.rate_to_ron,
        source,
      })
      .onConflict((conflict) =>
        conflict.columns(["date", "currency"]).doUpdateSet({
          rate_to_ron: row.rate_to_ron,
          source,
        }),
      )
      .execute();
    count++;
  }
  return count;
}

async function fromBnr(): Promise<{ count: number; source: string }> {
  const year = new Date().getUTCFullYear();
  const urls = [
    `https://curs.bnr.ro/files/xml/years/nbrfxrates${year}.xml`,
    "https://curs.bnr.ro/nbrfxrates10days.xml",
    "https://curs.bnr.ro/nbrfxrates.xml",
  ];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const xml = await fetchText(url);
      if (!xml.includes("<DataSet")) throw new Error(`${url} did not return BNR XML`);
      const rows = parseBnrXml(xml);
      if (rows.length === 0) throw new Error(`No EUR/USD rates in ${url}`);
      const count = await upsertRates(rows, "bnr");
      return { count, source: "bnr" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("BNR fetch failed");
}

async function fromFallback(): Promise<{ count: number; source: string }> {
  const response = await fetch("https://api.frankfurter.app/latest?from=EUR&to=RON,USD", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Frankfurter returned ${response.status}`);
  const body = (await response.json()) as { date?: string; rates?: { RON?: number; USD?: number } };
  const ron = body.rates?.RON;
  const usd = body.rates?.USD;
  const date = body.date;
  if (!ron || !usd || !date) throw new Error("Frankfurter payload was incomplete");
  const count = await upsertRates(
    [
      { date, currency: "EUR", rate_to_ron: ron },
      { date, currency: "USD", rate_to_ron: ron / usd },
    ],
    "frankfurter",
  );
  return { count, source: "frankfurter" };
}

export async function refreshFx(): Promise<{ count: number; source: string }> {
  try {
    return await fromBnr();
  } catch (bnrError) {
    console.error("BNR FX fetch failed, trying fallback", bnrError);
    return fromFallback();
  }
}

export async function latestRate(currency: "EUR" | "USD", asOf: string): Promise<FxQuote | null> {
  const row = await db
    .selectFrom("fx_rates")
    .selectAll()
    .where("currency", "=", currency)
    .where("date", "<=", asOf)
    .orderBy("date", "desc")
    .limit(1)
    .executeTakeFirst();
  const chosen =
    row ??
    (await db
      .selectFrom("fx_rates")
      .selectAll()
      .where("currency", "=", currency)
      .orderBy("date", "desc")
      .limit(1)
      .executeTakeFirst());
  if (!chosen) return null;
  return {
    currency,
    rate_to_ron: chosen.rate_to_ron,
    date: chosen.date,
    source: chosen.source,
  };
}

export async function rateForMonth(
  currency: Currency,
  monthDate: string,
  driftPercent: number,
): Promise<FxQuote> {
  if (currency === "RON") {
    return { currency: "RON", rate_to_ron: 1, date: null, source: "identity" };
  }
  const market = await latestRate(currency, monthDate);
  if (!market || !market.date) {
    throw new Error(`No FX rate for ${currency}`);
  }
  if (monthDate <= market.date || driftPercent === 0) return market;
  const years = yearsBetween(market.date, monthDate);
  return {
    currency,
    rate_to_ron: projectRate(market.rate_to_ron, years, driftPercent),
    date: market.date,
    source: `${market.source}+drift`,
  };
}

export async function hasBnrToday(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db
    .selectFrom("fx_rates")
    .select("source")
    .where("date", ">=", today)
    .where("source", "=", "bnr")
    .limit(1)
    .executeTakeFirst();
  return Boolean(row);
}
