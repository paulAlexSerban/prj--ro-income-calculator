# Spike 001: CAS and CASS tier model

- Status: Closed. Implemented as unverified, editable config.
- Date: 2026-10-07

## Question

The product needs CAS and CASS on PFA income and on dividends. The brief names tiers of 6, 12, and 24 minimum wages and a CASS cap of 72 minimum wages. It does not specify the base inside each band. Public descriptions of the 2024-2026 rules disagree.

## What was checked

Common descriptions used while seeding:

- CAS for independent activity is not due below 12 minimum wages, is a fixed base of 12 wages between 12 and 24, and is capped at 24 wages.
- CASS uses 6, 12, and 24 wage bands. Below 6 wages the base is 0. Inside a band the base is the lower tier times the minimum wage. At or above 24 wages the base is actual income, capped at 72 wages.
- CAS is not applied to dividends in this model. CASS is.
- The personal deduction table and the minimum-wage tax-free allowance were not specified. They are stored and left disabled.

The user confirmed seeding the commonly cited rules, all `verified = false`, rather than leaving the amounts blank.

## Result in the product

`tax_rules` keys `cas_tiers` `[12, 24]`, `cass_tiers` `[6, 12, 24]`, `cas_cap_min_wages` `24`, `cass_cap_min_wages` `72`. The engine reads those keys. Settings can change them. Tests cover the boundaries at 6, 12, and 24 times the minimum wage, including the July 2026 wage of 4,325 RON.

This spike is not a reading of the Fiscal Code. The notes on the seeded rows say so.
