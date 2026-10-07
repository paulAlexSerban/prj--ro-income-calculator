import type { CalculationResult, OfferInput } from "@offer-compare/engine";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RegimeCard } from "@/components/Breakdown";
import { Badge, Button, Card, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { money, ratePercent } from "@/lib/format";

const statuses = ["idea", "interviewing", "offer", "rejected", "current"] as const;

export function OfferEditor({ initial, id }: { initial: OfferInput; id?: string }) {
  const navigate = useNavigate();
  const [offer, setOffer] = useState<OfferInput>(initial);
  const [preview, setPreview] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      api<CalculationResult>("/api/calculate", { method: "POST", body: JSON.stringify({ offer }) })
        .then((result) => {
          setPreview(result);
          setError(null);
        })
        .catch((err: Error) => setError(err.message));
    }, 350);
    return () => clearTimeout(handle);
  }, [offer]);

  function patch(partial: Partial<OfferInput>) {
    setOffer((current) => ({ ...current, ...partial }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await api<{ id: string }>(id ? `/api/offers/${id}` : "/api/offers", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(offer),
      });
      navigate(`/offers/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const assumptions = offer.assumptions!;
  const extras = offer.extras!;
  const b2b = offer.b2b!;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="grid gap-4 p-4">
        <h1 className="text-lg font-semibold">{id ? "Edit offer" : "New offer"}</h1>
        <Field label="Label (company / role)">
          <Input value={offer.label} onChange={(event) => patch({ label: event.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={offer.status} onChange={(event) => patch({ status: event.target.value as OfferInput["status"] })}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contract">
            <Select
              value={offer.contract_type}
              onChange={(event) => patch({ contract_type: event.target.value as OfferInput["contract_type"] })}
            >
              <option value="EMPLOYMENT">Employment (CIM)</option>
              <option value="B2B">B2B</option>
            </Select>
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              value={offer.amount}
              onChange={(event) => patch({ amount: Number(event.target.value) })}
            />
          </Field>
          <Field label="Rate type">
            <Select value={offer.rate_type} onChange={(event) => patch({ rate_type: event.target.value as OfferInput["rate_type"] })}>
              <option value="HOURLY_GROSS">Hourly gross</option>
              <option value="DAILY_GROSS">Daily gross</option>
              <option value="MONTHLY_GROSS">Monthly gross</option>
              <option value="MONTHLY_NET">Monthly net</option>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={offer.currency} onChange={(event) => patch({ currency: event.target.value as OfferInput["currency"] })}>
              <option>RON</option>
              <option>EUR</option>
              <option>USD</option>
            </Select>
          </Field>
          {offer.currency !== "RON" ? (
            <Field label={`Manual FX override (RON per 1 ${offer.currency})`}>
              <Input
                type="number"
                step="0.0001"
                value={offer.fx_override?.[offer.currency] ?? ""}
                placeholder="Use stored rate"
                onChange={(event) => {
                  const value = event.target.value;
                  patch({
                    fx_override: value
                      ? { ...offer.fx_override, [offer.currency]: Number(value) }
                      : null,
                  });
                }}
              />
            </Field>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={offer.is_current} onCheckedChange={(checked) => patch({ is_current: checked })} />
          This is my current income
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Hours / day">
            <Input
              type="number"
              value={assumptions.hours_per_day}
              onChange={(event) => patch({ assumptions: { ...assumptions, hours_per_day: Number(event.target.value) } })}
            />
          </Field>
          <Field label="Working days / month">
            <Input
              type="number"
              value={assumptions.working_days_per_month}
              onChange={(event) =>
                patch({ assumptions: { ...assumptions, working_days_per_month: Number(event.target.value) } })
              }
            />
          </Field>
          <Field label="B2B billable days / year">
            <Input
              type="number"
              value={assumptions.billable_days_per_year}
              onChange={(event) =>
                patch({ assumptions: { ...assumptions, billable_days_per_year: Number(event.target.value) } })
              }
            />
          </Field>
          <Field label="Dependants (deducere)">
            <Input
              type="number"
              value={assumptions.dependants}
              onChange={(event) => patch({ assumptions: { ...assumptions, dependants: Number(event.target.value) } })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={assumptions.it_exempt}
            onCheckedChange={(checked) => patch({ assumptions: { ...assumptions, it_exempt: checked } })}
          />
          IT-sector income tax exemption (impozit 0). Contributions still apply. Check eligibility.
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={assumptions.min_wage_allowance}
            onCheckedChange={(checked) => patch({ assumptions: { ...assumptions, min_wage_allowance: checked } })}
          />
          Minimum-wage tax-free allowance (only if enabled in tax rules)
        </label>
        <h2 className="text-sm font-medium">Extras</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Meal vouchers RON/day (tichete de masă)">
            <Input
              type="number"
              value={extras.meal_vouchers_daily_ron}
              onChange={(event) => patch({ extras: { ...extras, meal_vouchers_daily_ron: Number(event.target.value) } })}
            />
          </Field>
          <Toggle
            label="Count vouchers as income"
            checked={extras.meal_vouchers_count}
            onChange={(checked) => patch({ extras: { ...extras, meal_vouchers_count: checked } })}
          />
          <Field label="Yearly bonus gross">
            <Input
              type="number"
              value={extras.yearly_bonus_gross}
              onChange={(event) => patch({ extras: { ...extras, yearly_bonus_gross: Number(event.target.value) } })}
            />
          </Field>
          <Toggle
            label="Count bonus as income"
            checked={extras.yearly_bonus_count}
            onChange={(checked) => patch({ extras: { ...extras, yearly_bonus_count: checked } })}
          />
          <Field label="Private health insurance / month">
            <Input
              type="number"
              value={extras.health_insurance_monthly}
              onChange={(event) => patch({ extras: { ...extras, health_insurance_monthly: Number(event.target.value) } })}
            />
          </Field>
          <Toggle
            label="Count insurance as income"
            checked={extras.health_insurance_count}
            onChange={(checked) => patch({ extras: { ...extras, health_insurance_count: checked } })}
          />
          <Field label="Other monthly benefits">
            <Input
              type="number"
              value={extras.other_monthly}
              onChange={(event) => patch({ extras: { ...extras, other_monthly: Number(event.target.value) } })}
            />
          </Field>
          <Toggle
            label="Count other benefits as income"
            checked={extras.other_monthly_count}
            onChange={(checked) => patch({ extras: { ...extras, other_monthly_count: checked } })}
          />
        </div>
        {offer.contract_type === "B2B" ? (
          <div className="grid gap-3">
            <h2 className="text-sm font-medium">B2B inputs</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Annual income norm (normă de venit)">
                <Input
                  type="number"
                  value={b2b.annual_norm}
                  onChange={(event) => patch({ b2b: { ...b2b, annual_norm: Number(event.target.value) } })}
                />
              </Field>
              <Field label="Norm currency">
                <Select
                  value={b2b.annual_norm_currency}
                  onChange={(event) => patch({ b2b: { ...b2b, annual_norm_currency: event.target.value as OfferInput["currency"] } })}
                >
                  <option>RON</option>
                  <option>EUR</option>
                  <option>USD</option>
                </Select>
              </Field>
              <Field label="Accountant / month">
                <Input
                  type="number"
                  value={b2b.accountant_monthly}
                  onChange={(event) => patch({ b2b: { ...b2b, accountant_monthly: Number(event.target.value) } })}
                />
              </Field>
              <Field label="Other deductible expenses / year">
                <Input
                  type="number"
                  value={b2b.other_deductible_annual}
                  onChange={(event) => patch({ b2b: { ...b2b, other_deductible_annual: Number(event.target.value) } })}
                />
              </Field>
              <Field label="Director salary (salariu administrator)">
                <Select
                  value={b2b.director_salary}
                  onChange={(event) =>
                    patch({ b2b: { ...b2b, director_salary: event.target.value as typeof b2b.director_salary } })
                  }
                >
                  <option value="none">None</option>
                  <option value="minimum_wage">Minimum wage</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              {b2b.director_salary === "custom" ? (
                <Field label="Custom director gross / month">
                  <Input
                    type="number"
                    value={b2b.director_salary_monthly}
                    onChange={(event) => patch({ b2b: { ...b2b, director_salary_monthly: Number(event.target.value) } })}
                  />
                </Field>
              ) : null}
              <Field label="Payout">
                <Select
                  value={b2b.payout}
                  onChange={(event) => patch({ b2b: { ...b2b, payout: event.target.value as typeof b2b.payout } })}
                >
                  <option value="all">Distribute all profit</option>
                  <option value="retain">Retain profit</option>
                </Select>
              </Field>
              <Field label="Regime used for net → revenue and comparison default">
                <Select
                  value={b2b.regime}
                  onChange={(event) => patch({ b2b: { ...b2b, regime: event.target.value as typeof b2b.regime } })}
                >
                  <option value="best">Best net</option>
                  <option value="pfa_norm">PFA norm</option>
                  <option value="pfa_real">PFA real</option>
                  <option value="pfa_ip40">PFA IP 40%</option>
                  <option value="srl_micro">SRL micro</option>
                  <option value="srl_profit">SRL profit tax</option>
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={b2b.pfa_ip} onCheckedChange={(checked) => patch({ b2b: { ...b2b, pfa_ip: checked } })} />
              Enable PFA intellectual-property 40% deduction (also requires the tax-rule flag)
            </label>
          </div>
        ) : null}
        <Field label="Notes">
          <Textarea value={offer.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </Field>
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={saving || !offer.label}>
            {saving ? "Saving…" : "Save offer"}
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </Card>
      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">Live preview</h2>
          {preview ? <Badge>{preview.ruleset.label}</Badge> : null}
          {preview && !preview.ruleset.verified ? <Badge>Unverified rules</Badge> : null}
          {preview?.ruleset.future_rules_assumed ? <Badge>Future rules assumed</Badge> : null}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {preview ? (
          <>
            <p className="text-sm text-zinc-500">
              FX {preview.fx.currency}: {preview.fx.rate_to_ron} RON ({preview.fx.source}
              {preview.fx.date ? `, ${preview.fx.date}` : ""})
            </p>
            <p className="num text-2xl">{money(preview.selected.net_monthly_ron)} <span className="text-base text-zinc-500">net / month</span></p>
            <p className="text-sm text-zinc-500">
              {preview.selected.label} · effective {ratePercent(preview.selected.effective_tax_rate)} · gross{" "}
              {money(preview.selected.gross_monthly_ron)} / month
            </p>
            {preview.reversed ? <p className="text-xs text-zinc-500">{preview.reversed.formula}</p> : null}
            <ul className="grid gap-1 text-xs text-zinc-500">
              {preview.periods.formulas.map((formula) => (
                <li key={formula}>{formula}</li>
              ))}
            </ul>
            {preview.warnings.length ? (
              <ul className="grid gap-1 text-xs text-amber-700 dark:text-amber-400">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="grid gap-3">
              {preview.regimes.map((regime) => (
                <RegimeCard key={regime.regime} regime={regime} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Calculating…</p>
        )}
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-end gap-2 pb-1 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
