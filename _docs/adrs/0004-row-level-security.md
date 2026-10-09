# ADR 0004: Row-level security with app.user_id

- Status: Accepted
- Date: 2026-10-07

## Context

Offer data is private per user. The API is the only database client, but a missing `WHERE user_id = $1` would leak rows. Supabase-style policies were still wanted after Supabase itself was removed.

## Decision

Migrations run as the database owner and create a login role `app_user` that does not own the tables. The API uses that role, so row-level security applies.

Each authenticated request runs in a transaction:

```sql
SELECT set_config('app.user_id', '<user uuid>', true);
```

Policies compare `user_id` to `current_setting('app.user_id', true)::uuid`. The third argument of `set_config` limits the setting to the transaction, which matters because connections are pooled.

Child tables (`timeline_tracks`, `raise_events`, `timeline_runs`) do not store `user_id`. Their policies require a parent timeline owned by the current user.

`tax_rules`, `fx_rates`, and `inflation_assumptions` are readable and writable by any authenticated request. `users` and `refresh_tokens` have no policies. Registration sets `app.user_id` in the same transaction before inserting `user_settings`, because that table is protected and the new user has no session yet.

## Consequences

- A second account cannot read or write the first account's offers, even if a query forgets a user filter.
- Shared reference data is intentionally global. This deployment assumes one operator.
- Auth queries must not depend on `app.user_id` being set.
