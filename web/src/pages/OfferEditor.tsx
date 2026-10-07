import type { CalculationResult, Currency, OfferInput } from "@offer-compare/engine";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { RegimeCard } from "@/components/Breakdown";
import { Badge, Button, Card, Field, Input, NumberField, Select, Switch, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { money, ratePercent } from "@/lib/format";

const statuses = ["idea", "interviewing", "offer", "rejected", "current"] as const;

export function OfferEditor({ initial, id }: { initial: OfferInput; id?: string }) {
  const navigate = useNavigate();
  const [offer, setOffer] = useState<OfferInput>(initial);
  const [preview, setPreview] = useState<CalculationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openRegime, setOpenRegime] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setPending(true);
      api<CalculationResult>("/api/calculate", { method: "POST", body: JSON.stringify({ offer }) })
        .then((result) => {
          setPreview(result);
          setError(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setPending(false));
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
  const best = preview?.regimes.find((regime) => regime.best) ?? preview?.selected;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
      <div className="grid gap-4">
        <h1 className="text-lg font-semibold">{id ? "Edit offer" : "New offer"}</h1>
        <Section title="Basics">
          <Field label="Label (company / role)">
            <Input value={offer.label} onChange={(event) => patch({ label: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select value={offer.status} onChange={(event) => patch({ status: event.target.value as OfferInput["status"] })}>
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </Select>
            </Field>
            <Field label="Contract">
              <Select value={offer.contract_type} onChange={(event) => patch({ contract_type: event.target.value as OfferInput["contract_type"] })}>
                <option value="EMPLOYMENT">Employment (CIM)</option>
                <option value="B2B">B2B</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={offer.is_current} onCheckedChange={(checked) => patch({ is_current: checked })} />
            This is my current income
          </label>
        </Section>
        <Section title="Pay">
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Amount" value={offer.amount} onChange={(amount) => patch({ amount })} />
            <Field label="Rate type">
              <Select value={offer.rate_type} onChange={(event) => patch({ rate_type: event.target.value as OfferInput["rate_type"] })}>
                <option value="HOURLY_GROSS">Hourly gross</option>
                <option value="DAILY_GROSS">Daily gross</option>
                <option value="MONTHLY_GROSS">Monthly gross</option>
                <option value="MONTHLY_NET">Monthly net</option>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={offer.currency} onChange={(event) => patch({ currency: event.target.value as Currency })}>
                <option>RON</option>
                <option>EUR</option>
                <option>USD</option>
              </Select>
            </Field>
          </div>
          {offer.currency !== "RON" ? (
            <Field label={`Manual FX override (RON per 1 ${offer.currency}). Leave empty to use the stored rate.`}>
              <Input
                inputMode="decimal"
                value={offer.fx_override?.[offer.currency] ?? ""}
                placeholder="Stored rate"
                onChange={(event) => {
                  const value = event.target.value;
                  patch({ fx_override: value ? { ...offer.fx_override, [offer.currency]: Number(value) } : null });
                }}
              />
            </Field>
          ) : null}
        </Section>
        <Section title="Working assumptions">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Hours / day" min={1} value={assumptions.hours_per_day} onChange={(hours_per_day) => patch({ assumptions: { ...assumptions, hours_per_day } })} />
            <NumberField label="Working days / month" min={1} value={assumptions.working_days_per_month} onChange={(working_days_per_month) => patch({ assumptions: { ...assumptions, working_days_per_month } })} />
            <NumberField label="B2B billable days / year" min={1} value={assumptions.billable_days_per_year} onChange={(billable_days_per_year) => patch({ assumptions: { ...assumptions, billable_days_per_year } })} />
            <NumberField label="Dependants (deducere personală)" value={assumptions.dependants} onChange={(dependants) => patch({ assumptions: { ...assumptions, dependants } })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={assumptions.it_exempt} onCheckedChange={(checked) => patch({ assumptions: { ...assumptions, it_exempt: checked } })} />
            IT-sector income tax exemption. Contributions still apply. Check eligibility.
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={assumptions.min_wage_allowance} onCheckedChange={(checked) => patch({ assumptions: { ...assumptions, min_wage_allowance: checked } })} />
            Minimum-wage tax-free allowance (only if enabled in tax rules)
          </label>
        </Section>
        <Section title="Extras">
          <ExtraRow label="Meal vouchers, RON/day (tichete de masă)" amount={extras.meal_vouchers_daily_ron} counted={extras.meal_vouchers_count} onAmount={(meal_vouchers_daily_ron) => patch({ extras: { ...extras, meal_vouchers_daily_ron } })} onCount={(meal_vouchers_count) => patch({ extras: { ...extras, meal_vouchers_count } })} />
          <ExtraRow label="Yearly bonus, gross" amount={extras.yearly_bonus_gross} counted={extras.yearly_bonus_count} onAmount={(yearly_bonus_gross) => patch({ extras: { ...extras, yearly_bonus_gross } })} onCount={(yearly_bonus_count) => patch({ extras: { ...extras, yearly_bonus_count } })} />
          <ExtraRow label="Private health insurance / month" amount={extras.health_insurance_monthly} counted={extras.health_insurance_count} onAmount={(health_insurance_monthly) => patch({ extras: { ...extras, health_insurance_monthly } })} onCount={(health_insurance_count) => patch({ extras: { ...extras, health_insurance_count } })} />
          <ExtraRow label="Other monthly benefits" amount={extras.other_monthly} counted={extras.other_monthly_count} onAmount={(other_monthly) => patch({ extras: { ...extras, other_monthly } })} onCount={(other_monthly_count) => patch({ extras: { ...extras, other_monthly_count } })} />
        </Section>
        {offer.contract_type === "B2B" ? (
          <Section title="B2B">
            <p className="text-xs text-zinc-500">Revenue is treated as exclusive of VAT. Expenses reduce cash and, except for the income norm, the tax base.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Annual income norm (normă de venit)" value={b2b.annual_norm} onChange={(annual_norm) => patch({ b2b: { ...b2b, annual_norm } })} />
              <Field label="Norm currency">
                <Select value={b2b.annual_norm_currency} onChange={(event) => patch({ b2b: { ...b2b, annual_norm_currency: event.target.value as Currency } })}>
                  <option>RON</option><option>EUR</option><option>USD</option>
                </Select>
              </Field>
              <NumberField label="Accountant / month" value={b2b.accountant_monthly} onChange={(accountant_monthly) => patch({ b2b: { ...b2b, accountant_monthly } })} />
              <NumberField label="Other deductible expenses / year" value={b2b.other_deductible_annual} onChange={(other_deductible_annual) => patch({ b2b: { ...b2b, other_deductible_annual } })} />
              <Field label="Director salary (salariu administrator)">
                <Select value={b2b.director_salary} onChange={(event) => patch({ b2b: { ...b2b, director_salary: event.target.value as typeof b2b.director_salary } })}>
                  <option value="none">None</option>
                  <option value="minimum_wage">Minimum wage</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              {b2b.director_salary === "custom" ? (
                <NumberField label="Custom director gross / month" value={b2b.director_salary_monthly} onChange={(director_salary_monthly) => patch({ b2b: { ...b2b, director_salary_monthly } })} />
              ) : null}
              <Field label="Payout">
                <Select value={b2b.payout} onChange={(event) => patch({ b2b: { ...b2b, payout: event.target.value as typeof b2b.payout } })}>
                  <option value="all">Distribute all profit</option>
                  <option value="retain">Retain profit</option>
                </Select>
              </Field>
              <Field label="Regime used to solve a net amount back to revenue">
                <Select value={b2b.regime} onChange={(event) => patch({ b2b: { ...b2b, regime: event.target.value as typeof b2b.regime } })}>
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
              Enable the 40% intellectual-property deduction (also requires the tax-rule flag)
            </label>
          </Section>
        ) : null}
        <Section title="Notes">
          <Textarea value={offer.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </Section>
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={saving || !offer.label.trim()}>
            {saving ? "Saving…" : "Save offer"}
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </div>
      <Card className="grid gap-3 p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">Live preview</h2>
          {pending ? <span className="text-xs text-zinc-500">Updating…</span> : null}
          {preview ? <Badge>{preview.ruleset.label}</Badge> : null}
        </div>
        {error ? <p className="rounded-md bg-rose-50 px-2 py-1 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p> : null}
        {preview && best ? (
          <>
            <p className="num text-3xl">{money(best.net_monthly_ron)} <span className="text-base font-normal text-zinc-500">net / month</span></p>
            <p className="text-sm text-zinc-500">
              {money(best.net_monthly_ron / (preview.fx.display_rate_to_ron || 1), preview.fx.display_currency)} · {best.label} · effective {ratePercent(best.effective_tax_rate)}
            </p>
            <p className="text-xs text-zinc-500">
              1 {preview.fx.currency} = {preview.fx.rate_to_ron} RON ({preview.fx.source}{preview.fx.date ? `, ${preview.fx.date}` : ""})
            </p>
            {preview.reversed ? (
              <p className="rounded-md bg-teal-50 px-2 py-1 text-sm text-teal-950 dark:bg-teal-950 dark:text-teal-100">
                {offer.contract_type === "EMPLOYMENT" ? "Equivalent gross" : "Equivalent invoiced revenue"}: {money(preview.reversed.solved_gross_or_revenue_ron)}
                {offer.contract_type === "B2B" ? " / year" : " / month"}. {preview.reversed.formula}
              </p>
            ) : null}
            {preview.contract_type === "B2B" ? (
              <div className="grid gap-1">
                {preview.regimes.map((regime) => (
                  <button
                    key={regime.regime}
                    type="button"
                    className="flex items-center justify-between rounded-md border border-zinc-200 px-2 py-1 text-left text-sm dark:border-zinc-700"
                    onClick={() => setOpenRegime(openRegime === regime.regime ? null : regime.regime)}
                  >
                    <span>{regime.label}{regime.best ? " ★" : ""}</span>
                    <span className="num">{money(regime.net_monthly_ron)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {(openRegime ? preview.regimes.filter((regime) => regime.regime === openRegime) : [best]).map((regime) => (
              <RegimeCard key={regime.regime} regime={regime} open={regime.regime === openRegime} />
            ))}
          </>
        ) : (
          <p className="text-sm text-zinc-500">{pending ? "Calculating…" : "Enter an amount to preview."}</p>
        )}
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="grid gap-3 p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </Card>
  );
}

function ExtraRow({
  label,
  amount,
  counted,
  onAmount,
  onCount,
}: {
  label: string;
  amount: number;
  counted: boolean;
  onAmount: (value: number) => void;
  onCount: (value: boolean) => void;
}) {
  return (
    <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
      <NumberField label={label} value={amount} onChange={onAmount} />
      <label className="flex items-center gap-2 pb-2 text-sm">
        <Switch checked={counted} onCheckedChange={onCount} />
        Count as income
      </label>
    </div>
  );
}
