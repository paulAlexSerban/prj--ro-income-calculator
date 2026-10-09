# Non-functional requirements

## Privacy

- The app is single-user in intent: one person comparing their own offers.
- Postgres row-level security limits offers, settings, scenarios, and timelines to the signed-in user.
- `tax_rules`, `fx_rates`, and `inflation_assumptions` are shared reference data. Any signed-in user can read and edit them, which matches a single-user deployment.
- Passwords are stored as argon2 hashes. Access tokens are short-lived JWTs. Refresh tokens are stored as SHA-256 hashes and can be revoked.
- Tokens are kept in browser `localStorage`. That is acceptable for this local single-user app and is not a hardened browser-session design.

## Deployment

- The whole system runs with Docker Compose: Postgres 16, a one-shot migration job, the API, and nginx serving the web build and proxying `/api`.
- Default ports are 8080 (web), 3000 (API), and 5432 (Postgres).
- `JWT_SECRET` and database passwords come from the environment. The checked-in defaults are for local use only.

## Correctness of tax math

- All rates, thresholds, and caps used in a calculation are read from `tax_rules`. The interface does not hard-code a rate.
- Seeded 2026 values are stored with `verified = false` and a note to check ANAF / Codul Fiscal.
- The personal deduction and the minimum-wage tax-free allowance are seeded disabled. They do nothing until the user enables them.
- The same pure TypeScript engine calculates employment, every B2B regime, comparison growth, and each timeline month.
- Net-to-gross and net-to-revenue use binary search against that forward function, so both directions agree.
- Engine tests cover the employment round trip, each PFA and SRL case, CAS/CASS tier boundaries, currency conversion, and hourly, daily, and monthly conversion.

## Currency data

- On startup the API fetches BNR rates when today's rows are not already sourced from BNR.
- A daily job runs at 15:00 UTC, after the National Bank of Romania publishes.
- If the XML feed fails, Frankfurter supplies a same-day EUR and USD rate.
- The comparison shows which source and date were used.

## Interface

- The UI is English. Romanian tax terms appear in parentheses, for example "Pension contribution (CAS)".
- Layout works on a narrow screen (cards instead of a wide table) and on a desktop.
- Light and dark themes are available.
- Destructive deletes ask for confirmation.
- Growth and "best regime" are marked with a symbol as well as color.
- Every results screen carries the estimates-only disclaimer.

## What this app does not promise

- It is not tax, legal, or accounting advice.
- It does not file returns or talk to ANAF.
- It does not model VAT.
- Seeded contribution tiers and placeholder deductions are explicit assumptions, documented in the spikes, not a statement of current law.
