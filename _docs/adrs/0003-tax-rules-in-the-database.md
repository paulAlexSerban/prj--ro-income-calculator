# ADR 0003: Tax rules live in the database

- Status: Accepted
- Date: 2026-10-07

## Context

Romanian rates, thresholds, and caps change, and several 2026 figures are disputed or not yet confirmed by the user. Hard-coding a rate in the interface would hide that uncertainty and force a deploy for every correction.

## Decision

Store every rate, threshold, and cap in `tax_rules` as a key, a JSON value, an `effective_from` date, a note, and a `verified` flag. The engine throws if a required key is missing. It does not substitute a built-in rate.

Seed 2026 defaults with `verified = false` and a note to check ANAF / Codul Fiscal. The minimum wage has two rows, January and July. Settings edits the rows. A calculation reports the ruleset date it used and whether every row was verified.

Placeholder rules that are not confirmed, including the personal deduction table and the minimum-wage allowance, are seeded disabled.

## Consequences

- The interface can show an unverified count and refuse to pretend a seeded number is law.
- Mid-year changes are date rows, not code branches. The timeline picks the row effective in each month.
- A bad edit in Settings changes every later calculation. The editor validates JSON and marks unsaved rows.
- The micro turnover threshold is a setting, default EUR 100,000, because published sources disagree with EUR 250,000.
