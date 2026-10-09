# Spike 003: Net-to-gross solver

- Status: Closed. Binary search over the forward function.
- Date: 2026-10-07

## Question

Offers sometimes state a monthly net. The gross (employment) or the invoiced revenue (B2B) has to be recovered, and a later gross-to-net pass must land on the same net.

A closed-form inverse is awkward. Personal deduction can phase out as gross rises. B2B contributions jump at wage tiers. Dividend tax and CASS sit on top of profit. An inverse that drifts from the forward function would make the two directions disagree.

## What was checked

Binary search on the forward function:

- Expand the upper bound until the forward net reaches the target.
- Bisect until the gross or revenue is stable to the ban.
- Round to 2 decimals.

For a 10,000 RON monthly gross with the seeded 2026 rates and deductions disabled, the forward net is 5,850 RON (CAS 2,500, CASS 1,000, tax 650). Searching for 5,850 returns 10,000. The engine test locks that round trip.

B2B search treats the unknown as yearly invoiced revenue and calls the selected regime. If the offer asks for the best regime, or for the intellectual-property regime while that rule is off, the search uses PFA actual system and says so. Other regimes are then evaluated on the solved revenue.

A counted yearly bonus is inside the forward check. Meal vouchers and similar benefits are added after the solve, and the formula text says that.

One extra rule came out of the first B2B preview: an income norm of 0 produces a huge "net" because no tax is due, so it won "best regime" by accident. The best-regime pick now ignores a zero norm. The regime is still listed, with a warning to enter the published norm.

## Result in the product

`binarySearch` in `packages/engine/src/money.ts`. The offer preview shows "Equivalent gross" or "Equivalent invoiced revenue" when the rate type is monthly net.
