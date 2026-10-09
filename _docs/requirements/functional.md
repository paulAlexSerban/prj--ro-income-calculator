# Functional requirements

Offer Compare RO normalizes Romanian job offers so they can be compared as net income. These requirements describe the behavior that is implemented. Tax figures are estimates until the user marks the matching `tax_rules` rows verified.

## Accounts

- A person registers and signs in with email and password.
- Registration can be closed with `ALLOW_REGISTRATION=false`.
- Each user sees only their own offers, settings, scenarios, and timelines.
- Logout revokes the refresh token.

## Offers

- An offer has a label, notes, and a status: idea, interviewing, offer, rejected, or current.
- At most one offer per user is marked current income.
- Contract type is employment (CIM) or B2B.
- The amount uses one rate type: hourly gross, daily gross, monthly gross, or monthly net.
- Currency is RON, EUR, or USD. The original amount is kept and converted for comparison.
- Working assumptions default to 8 hours per day, 21 working days per month, and 220 B2B billable days per year. They are editable per offer.
- Optional extras: meal vouchers (RON per day), yearly bonus (gross), private health insurance, and other monthly benefits. Each has a "count as income" toggle.
- B2B offers also store an income norm, accountant cost, other deductible expenses, director salary (none, minimum wage, or custom), payout (distribute all profit or retain), and the regime used when solving a net amount back to revenue.
- The offer form previews the result as the user types. The previous result stays on screen while a new one is calculated.
- A monthly net amount is reverse-solved to gross (employment) or invoiced revenue (B2B) with the same forward calculation. The solved figure is shown as equivalent gross or equivalent invoiced revenue.
- Offers can be created, edited, cloned, and deleted. Delete asks for confirmation.
- The offers list can be sorted by name, net monthly, or status, and shows a net preview.

## Tax calculation

- Employment: employee CAS and CASS come off gross, then personal deduction and the minimum-wage allowance (both off unless enabled in tax rules), then income tax. An IT-sector toggle sets income tax to 0 and leaves contributions in place. Employer cost is gross plus CAM.
- Every B2B offer is calculated under these regimes side by side:
  - PFA income norm (norma de venit)
  - PFA actual system (sistem real)
  - SRL micro-enterprise
  - SRL profit tax
  - PFA intellectual-property 40% deduction, only when the tax rule and the offer both enable it
- A zero income norm is shown but is not chosen as the best regime.
- Each regime reports net monthly and yearly, taxes, contributions, effective rate, and warnings (micro threshold, employee requirement, regime-switch lock).
- The best net regime is marked. Formula lines are expandable.
- Counted benefits are added after tax and labelled as non-taxable pending verification.
- VAT is ignored. B2B revenue is treated as exclusive of VAT.

## Currency

- RON, EUR, and USD are supported. Romanian tax is computed in RON.
- A header switcher sets the display currency (RON, EUR, or USD) for the signed-in user and re-renders comparison numbers.
- Rate order: per-offer manual override, then the global override in settings, then the stored daily rate.
- The comparison shows the rate, date, and source. A rate older than five days is marked stale.
- Stored rates come from the BNR XML feed. If that feed fails, the app uses Frankfurter.

## Comparison

- The dashboard is a table with offers as columns and metrics as rows: original offer, gross monthly, taxes, contributions, net monthly, net yearly in RON and in the display currency, employer cost, effective rate, and growth versus current income.
- On a narrow screen each offer is a card instead of a column. The metric column stays sticky on wider screens.
- Hovering a figure shows the formula text from the calculation.
- Growth versus current income is shown for net and gross, with an arrow as well as color.
- Any two offers can be compared. The card shows net growth, gross growth, display-currency growth, and the FX effect (display-currency growth minus RON growth).
- A sequential chain of offers can be built, reordered, and trimmed. Each step shows net growth and the FX effect.
- B2B columns can switch which regime feeds the comparison. The default is the best net.
- The table can be sorted and filtered, exported to CSV, and opened in a print view that hides navigation and charts.
- An empty dashboard asks the user to add current income first.

## Timelines

- A timeline has a label, start date, and horizon in months.
- A track is one offer plus a regime and a color. Several tracks can run side by side.
- A raise is a percent or a new flat amount, on gross or net, compounding or applied to the original base. It can also change the contract type from that month on.
- The effective month is entered as a month number (1 is the first month) or as a calendar month.
- A track can store an annual bonus month and one-off bonuses.
- Each simulated month uses the tax rules effective that month. If a future month has no newer rules, the latest rules are carried forward and badged "future rules assumed".
- Past months use stored FX. Future months can apply a yearly FX drift percent (default 0).
- When an inflation series is turned on, charts can show nominal or inflation-adjusted net.
- Results include cumulative net, average monthly net, growth from the first month to the last, and a CAGR-style annualized growth.
- Two tracks can be compared. The app reports the month when the second track's cumulative net overtakes the first, and draws that point on the cumulative chart.
- Charts: net over time with raise markers, cumulative net, and a stacked area of net versus taxes and contributions for a selected track.
- The monthly table groups by year and shows a yearly subtotal.
- The full series can be exported to CSV.
- A timeline, a track, and a raise can be deleted. Each delete asks for confirmation. Deleting a timeline removes its tracks, raises, and saved runs, and the detail page returns to the list.

## Settings and snapshots

- Tax rules are grouped: rates, minimum wage, CAS/CASS tiers, micro-enterprise, deduction and allowances, optional regimes.
- Tier lists and the personal-deduction table have structured editors. Raw JSON remains available. Invalid JSON is rejected.
- A rule shows an unsaved marker and a saved confirmation. A section can be marked verified only after confirmation.
- The count of unverified rules is shown on Settings and in a warning strip under the header. The strip can be dismissed for the browser session and returns on the next session until the rules are verified.
- Global defaults cover hours, working days, billable days, FX overrides, FX drift, and a fallback inflation rate.
- FX can be refreshed from the BNR feed on demand. Recent rates are listed with their source.
- Saving a scenario stores the offer inputs, the result, and the tax-rule and FX snapshots used, so that calculation can be reproduced later.

## Disclaimer

The footer states that results are estimates, not tax advice, and that figures should be checked with an accountant and against ANAF / Codul Fiscal.
