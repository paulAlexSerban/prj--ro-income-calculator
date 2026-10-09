# Offer Compare RO

Salary and job-offer comparison for Romania. Normalize CIM (employment) and B2B offers to net monthly and yearly RON, compare growth, and project income over a timeline.

Design notes, requirements, and decision records are in [_docs](_docs/README.md).

Estimates only, not tax advice. Seeded 2026 tax figures are unverified until you check them against ANAF / Codul Fiscal and mark them verified in Settings.

## Stack

- React, TypeScript, Tailwind, shadcn-style UI
- Fastify API with email login (argon2 + JWT)
- PostgreSQL 16, row-level security per user
- Pure TypeScript tax engine in `packages/engine`

## Run

```bash
docker compose up --build
```

Open http://localhost:8080 and create an account. The API also listens on port 3000. Postgres is on port 5432.

Copy `.env.example` if you want to change passwords or `JWT_SECRET`. Set `ALLOW_REGISTRATION=false` after you create your account.

FX rates are fetched from the BNR XML feed on `curs.bnr.ro`, with Frankfurter as a fallback, on startup and every day at 15:00 UTC.

## Tests

```bash
npm install
npm test
```

The engine tests cover employment gross-to-net and the net-to-gross round trip, each PFA/SRL case, CAS/CASS tier boundaries, currency conversion, and hourly/daily/monthly conversion.

## Tax rules

Rates live in the `tax_rules` table and are edited in Settings. Nothing in the UI hard-codes a rate. CAS/CASS tiers, the personal deduction table, the minimum-wage allowance, and the micro turnover threshold are seeded as editable unverified defaults. The micro threshold defaults to EUR 100,000 because published 2026 sources disagree (100k vs 250k).
