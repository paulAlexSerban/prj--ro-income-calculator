# ADR 0001: Postgres and Fastify instead of Supabase

- Status: Accepted
- Date: 2026-10-07

## Context

The first sketch of Offer Compare RO used Supabase for Postgres, Auth, row-level security, and Edge Functions. The deployment constraint changed: the database had to be plain PostgreSQL in Docker, with the whole solution orchestrated by Compose. Supabase services (GoTrue, PostgREST, Kong, the edge runtime) were dropped.

## Decision

Run official `postgres:16`. Put HTTP, auth, FX refresh, and calculation endpoints in a Fastify service. Email and password use argon2. Sessions are a short-lived JWT plus a refresh token stored as a hash. Scheduled FX refresh uses `node-cron` inside the API instead of `pg_cron`.

The calculation, compare, FX refresh, and timeline-run behaviors that were going to be Edge Functions are ordinary routes: `POST /api/calculate`, `POST /api/compare`, `POST /api/fx/refresh`, and `POST /api/timelines/:id/run`.

## Consequences

- One process owns auth and SQL. There is no second auth product to operate.
- Row-level security is still used, but the API must set `app.user_id` itself. See ADR 0004.
- The API connects as a non-owner role so policies apply.
- Registration can be closed with an environment flag after the first account, which fits a single-user app.
