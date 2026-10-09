# ADR 0005: BNR rates with a Frankfurter fallback

- Status: Accepted
- Date: 2026-10-07

## Context

Offers arrive in RON, EUR, and USD and must be taxed in RON. The National Bank of Romania publishes the official reference rates. The original `www.bnr.ro/nbrfxrates.xml` URL no longer returns XML. See `spikes/002-bnr-xml-endpoint.md`.

Users also need a manual rate when the feed is down or when they want to lock a comparison to a rate from an offer letter.

## Decision

Fetch EUR and USD from `curs.bnr.ro`: the yearly file for backfill, then the 10-day and daily files. Store `(date, currency, rate_to_ron, source)` with `source = 'bnr'`.

If those URLs fail or do not contain a `DataSet`, call Frankfurter and store `source = 'frankfurter'` for that day.

Refresh on startup when today's rows are not already from BNR, and every day at 15:00 UTC. A manual override on the offer, then the global override in settings, wins over the stored rate. The comparison shows the source and date. Rates older than five days are marked stale in the UI.

## Consequences

- A working day of rates survives a later BNR outage.
- A Frankfurter day is replaced the next time the BNR fetch succeeds, because startup retries until today's source is `bnr`.
- Overrides are not written into `fx_rates`, so a refresh cannot erase a rate the user typed.
- Only EUR and USD are fetched. Other currencies are out of scope.
