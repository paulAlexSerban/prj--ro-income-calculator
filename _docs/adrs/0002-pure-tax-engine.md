# ADR 0002: A pure tax engine package

- Status: Accepted
- Date: 2026-10-07

## Context

Employment tax, five B2B regimes, currency conversion, comparison growth, and a month-by-month timeline all need the same formulas. The timeline calls that math once per month per track. Tests must prove gross-to-net and net-to-gross agree without a database.

## Decision

Put the math in `packages/engine`, a pure TypeScript package with no database or network imports. The API loads rules and FX, then calls `calculate`, `compare`, and `runTimeline`. Vitest targets the package directly.

Net inputs are solved by binary search over the forward function rather than a separate inverse formula.

## Consequences

- One formula change updates the preview, the dashboard, the timeline, and the tests together.
- The web app does not reimplement tax. It displays numbers and formula strings the engine returns.
- The API stays a loader and a store. Timeline caching in `timeline_runs` is an API concern. The engine only computes.
