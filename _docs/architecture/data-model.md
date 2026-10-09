# Data model

Schema source: `db/migrations/001_schema.sql`. Row-level security is in `002_rls.sql`. The 2026 seed is in `003_seed.sql`.

## Identity

- `users` stores email and an argon2 password hash. No row-level security. The API is the only client.
- `refresh_tokens` stores the SHA-256 hash of the refresh token, an expiry, and `revoked_at`.
- `user_settings` is one row per user: display currency, default hours and days, global FX override, FX drift percent, and a fallback inflation percent.

## Offers and results

- `offers` holds the contract, amount, rate type, currency, assumptions, extras, B2B inputs, optional FX override, status, notes, and `is_current`. A partial unique index allows only one current offer per user.
- `tax_rules` is global. A row is `(tax_year, effective_from, key, value jsonb, note, verified)`. The same key may appear twice when the value changes mid-year. The minimum gross wage does this: 4,050 RON from 1 January 2026 and 4,325 RON from 1 July 2026.
- `fx_rates` is global. Primary key `(date, currency)`. `currency` is EUR or USD. `rate_to_ron` is RON per 1 unit. `source` is `bnr`, `frankfurter`, or another label the fetcher sets.
- `scenarios` copies an offer's inputs, the calculation result, and the rules and FX snapshots onto a user-owned row so a past result can be read without recomputing against newer rules.

## Timelines

- `timelines`: user, label, start date, horizon in months, notes, FX drift percent, inflation toggle.
- `timeline_tracks`: timeline, label, base offer, regime, color, adjustments JSON (annual bonus and one-off bonuses), position.
- `raise_events`: track, zero-based month index, kind (`percent` or `flat`), base (`gross` or `net`), value, optional new rate type and currency, optional contract-type change, compounding flag.
- `timeline_runs`: cached monthly series and aggregates for a track, keyed by `inputs_hash`. The hash covers the track, raises, rules, and FX versions. A matching hash is reused. `force` on the run endpoint ignores the cache.
- `inflation_assumptions`: one annual percent per calendar year. Global, like tax rules.

Ownership of tracks, raises, and runs is enforced by policies that join back to `timelines.user_id`.

## Reference data versus private data

| Private (`user_id`) | Shared |
| --- | --- |
| `user_settings`, `offers`, `scenarios`, `timelines` and children | `tax_rules`, `fx_rates`, `inflation_assumptions` |

`users` and `refresh_tokens` have no row-level security. `schema_migrations` is not granted to `app_user`.
