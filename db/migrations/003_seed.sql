-- Seeded 2026 defaults. Every row is unverified until you check it against ANAF / Codul Fiscal.
-- CAS/CASS tier model (UNVERIFIED, editable):
--   Below the first tier, the contribution base is 0.
--   Inside a band, the base is the lower tier times the minimum gross wage.
--   At or above the top tier, the base is actual income capped at cap_min_wages * minimum wage.
--   CAS cap is 24 minimum wages. CASS cap is 72 minimum wages.
--   CAS tiers start at 12 (the 6-wage tier is CASS). Change cas_tiers if you want a different rule.

INSERT INTO tax_rules (tax_year, effective_from, key, value, note, verified) VALUES
  (2026, '2026-01-01', 'income_tax_rate', '0.10',
    'Seeded default. Verify against ANAF / Codul Fiscal. Impozit pe venit.', false),
  (2026, '2026-01-01', 'cas_rate', '0.25',
    'Seeded default. Verify against ANAF / Codul Fiscal. Contributia de asigurari sociale (CAS), employee.', false),
  (2026, '2026-01-01', 'cass_rate', '0.10',
    'Seeded default. Verify against ANAF / Codul Fiscal. Contributia de asigurari sociale de sanatate (CASS).', false),
  (2026, '2026-01-01', 'cam_rate', '0.0225',
    'Seeded default. Verify against ANAF / Codul Fiscal. Contributia asiguratorie pentru munca (CAM), employer.', false),
  (2026, '2026-01-01', 'dividend_tax_rate', '0.16',
    'Seeded default. Verify against ANAF / Codul Fiscal. Impozit pe dividende.', false),
  (2026, '2026-01-01', 'profit_tax_rate', '0.16',
    'Seeded default. Verify against ANAF / Codul Fiscal. Impozit pe profit.', false),
  (2026, '2026-01-01', 'micro_tax_rate', '0.01',
    'Seeded default. Verify against ANAF / Codul Fiscal. Impozit pe veniturile microintreprinderilor.', false),
  (2026, '2026-01-01', 'micro_turnover_threshold_eur', '100000',
    'Seeded default EUR 100000. Sources conflict for 2026 (EUR 100k vs EUR 250k). Verify against ANAF / Codul Fiscal and edit this value.', false),
  (2026, '2026-01-01', 'micro_employee_required', '1',
    'Seeded default. Verify against ANAF / Codul Fiscal. Minimum employees often required to stay on micro.', false),
  (2026, '2026-01-01', 'micro_exit_lock_years', '3',
    'Seeded default. Verify against ANAF / Codul Fiscal. Years you generally cannot return to micro after leaving it.', false),
  (2026, '2026-01-01', 'minimum_gross_wage', '4050',
    'Seeded default. Minimum gross wage (salariu minim brut) until June 2026. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-07-01', 'minimum_gross_wage', '4325',
    'Seeded default. Minimum gross wage (salariu minim brut) from July 2026. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'cas_tiers', '[12, 24]',
    'UNVERIFIED. CAS base tiers in minimum wages. Below 12: base 0. From 12 to 24: base 12. At/above 24: actual income capped by cas_cap_min_wages. The 6-wage tier is used for CASS, not CAS. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'cass_tiers', '[6, 12, 24]',
    'UNVERIFIED. CASS base tiers in minimum wages. Below 6: base 0. Bands use the lower tier as a fixed base. At/above 24: actual income capped by cass_cap_min_wages. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'cas_cap_min_wages', '24',
    'UNVERIFIED. CAS annual cap expressed in minimum gross wages. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'cass_cap_min_wages', '72',
    'UNVERIFIED. CASS annual cap for independent and dividend income, in minimum gross wages. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'personal_deduction',
    '{"enabled":false,"bands":[{"gross_up_to":4050,"base_deduction":810,"per_dependant":100},{"gross_up_to":4500,"base_deduction":500,"per_dependant":80},{"gross_up_to":5000,"base_deduction":200,"per_dependant":40}]}',
    'UNVERIFIED placeholder. Deducere personala is disabled until you confirm the ANAF table and set enabled to true. Above the last band the deduction is 0.', false),
  (2026, '2026-01-01', 'min_wage_tax_free_allowance',
    '{"enabled":false,"monthly_amount":0}',
    'UNVERIFIED placeholder. Minimum-wage tax-free allowance (scutire). Applied to the taxable base only when this object has enabled=true, monthly_amount is set, and the offer toggle is on. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'director_salary',
    '{"options":["none","minimum_wage","custom"],"employer_cam_applies":true}',
    'UNVERIFIED. Director pay uses the employment formula. Employer CAM is a company cost when employer_cam_applies is true. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'pfa_ip_flat_deduction_rate', '0.40',
    'UNVERIFIED. Flat deduction rate for intellectual-property income (norma de cheltuieli 40%). Used only when pfa_ip_enabled is true and the offer opts in. Verify against ANAF / Codul Fiscal.', false),
  (2026, '2026-01-01', 'pfa_ip_enabled', 'false',
    'UNVERIFIED. Gates the optional PFA intellectual-property regime. Leave false until you confirm you want it. Verify against ANAF / Codul Fiscal.', false)
ON CONFLICT (key, effective_from) DO NOTHING;

INSERT INTO inflation_assumptions (year, annual_rate_percent, note) VALUES
  (2026, 0, 'Placeholder. Set the annual inflation percent to see real (inflation-adjusted) timeline values.')
ON CONFLICT (year) DO NOTHING;
