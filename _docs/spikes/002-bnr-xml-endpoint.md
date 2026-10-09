# Spike 002: BNR XML endpoint

- Status: Closed. The fetcher uses `curs.bnr.ro`.
- Date: 2026-10-07

## Question

Where does the app download the National Bank of Romania reference rates?

## What was checked

`https://www.bnr.ro/nbrfxrates.xml` returned an HTML page for the public website, not XML. `https://www.bnr.ro/files/xml/years/nbrfxrates2026.xml` returned 404.

BNR's own note on XML access points at a dedicated host:

- Daily: `https://curs.bnr.ro/nbrfxrates.xml`
- Last 10 publishing days: `https://curs.bnr.ro/nbrfxrates10days.xml`
- Year file: `https://curs.bnr.ro/files/xml/years/nbrfxrates2026.xml`

A live daily file on 7 October 2026 contained `<Cube date="2026-10-07">` with `<Rate currency="EUR">5.3501</Rate>` and `<Rate currency="USD">4.7801</Rate>`. Some currencies include a `multiplier` attribute (for example HUF, 100). The RON-per-unit rate is the quoted value divided by that multiplier. EUR and USD use 1.

The yearly file for 2026 was about 260 KB of the same shape and loaded 384 EUR and USD rows.

Frankfurter (`https://api.frankfurter.app/latest?from=EUR&to=RON,USD`) works as a same-day fallback: RON per EUR is `rates.RON`, and RON per USD is `rates.RON / rates.USD`.

## Result in the product

`api/src/fx.ts` tries the yearly file, then the 10-day file, then the daily file. A body without `<DataSet>` is a failure. Frankfurter runs only after those fail. See ADR 0005.
