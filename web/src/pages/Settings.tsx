import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ConfirmButton, Field, InfoTip, Input, Select, Switch, Textarea } from "@/components/ui";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";

type Settings = {
  display_currency: "RON" | "EUR" | "USD";
  hours_per_day: number;
  working_days_per_month: number;
  billable_days_per_year: number;
  fx_override: { EUR?: number; USD?: number } | null;
  fx_drift_percent: number;
  inflation_rate_percent: number;
};

type TaxRule = {
  id: string;
  tax_year: number;
  effective_from: string;
  key: string;
  value: unknown;
  note: string;
  verified: boolean;
};

type FxRow = { date: string; currency: string; rate_to_ron: number; source: string };

export function SettingsPage() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/api/settings") });
  const rules = useQuery({ queryKey: ["tax-rules"], queryFn: () => api<TaxRule[]>("/api/tax-rules") });
  const fx = useQuery({ queryKey: ["fx"], queryFn: () => api<FxRow[]>("/api/fx?limit=8") });
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);

  async function saveSettings(partial: Partial<Settings>) {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(partial) });
    await client.invalidateQueries({ queryKey: ["settings"] });
  }

  async function saveRule(rule: TaxRule, valueText: string) {
    let value: unknown = valueText;
    try {
      value = JSON.parse(valueText);
    } catch {
      if (valueText === "true" || valueText === "false") value = valueText === "true";
      else if (valueText.trim() !== "" && !Number.isNaN(Number(valueText))) value = Number(valueText);
    }
    await api(`/api/tax-rules/${rule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ value, note: rule.note, verified: rule.verified }),
    });
    await client.invalidateQueries({ queryKey: ["tax-rules"] });
    toast.push(`Saved ${rule.key}`);
  }

  async function verifySection(section: TaxRule[]) {
    for (const rule of section.filter((item) => !item.verified)) {
      await api(`/api/tax-rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ verified: true }) });
    }
    await client.invalidateQueries({ queryKey: ["tax-rules"] });
    toast.push("Marked the section verified");
  }

  if (!settings.data) return <p className="text-sm text-zinc-500">Loading…</p>;
  const data = settings.data;

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        {(rules.data ?? []).filter((rule) => !rule.verified).length} rules are unverified. The calculator reads these values and does not hard-code rates. Check each one against ANAF / Codul Fiscal before you rely on it.
      </p>
      {message ? <p className="text-sm text-teal-700">{message}</p> : null}
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="Display currency" info="Converts comparison and timeline totals into this currency. Tax is still calculated in RON.">
          <Select
            value={data.display_currency}
            onChange={(event) => void saveSettings({ display_currency: event.target.value as Settings["display_currency"] })}
          >
            <option>RON</option>
            <option>EUR</option>
            <option>USD</option>
          </Select>
        </Field>
        <Field label="Default hours / day" info="Starting value for a new offer. Each offer can override it.">
          <Input type="number" defaultValue={data.hours_per_day} onBlur={(event) => void saveSettings({ hours_per_day: Number(event.target.value) })} />
        </Field>
        <Field label="Default working days / month" info="Used to turn a daily rate into a month. Employment yearly pay is that month times 12.">
          <Input type="number" defaultValue={data.working_days_per_month} onBlur={(event) => void saveSettings({ working_days_per_month: Number(event.target.value) })} />
        </Field>
        <Field label="Default B2B billable days / year" info="B2B yearly revenue uses this instead of 12 full months, so unpaid leave is included.">
          <Input type="number" defaultValue={data.billable_days_per_year} onBlur={(event) => void saveSettings({ billable_days_per_year: Number(event.target.value) })} />
        </Field>
        <Field label="Global EUR override (RON per EUR)" info="Used when an offer has no rate of its own. Clear it to go back to the stored National Bank rate.">
          <div className="flex gap-2">
            <Input
              type="number"
              defaultValue={data.fx_override?.EUR ?? ""}
              onBlur={(event) =>
                void saveSettings({
                  fx_override: event.target.value
                    ? { ...data.fx_override, EUR: Number(event.target.value) }
                    : withoutOverride(data.fx_override, "EUR"),
                })
              }
            />
            <Button type="button" variant="ghost" size="sm" disabled={data.fx_override?.EUR == null} onClick={() => void saveSettings({ fx_override: withoutOverride(data.fx_override, "EUR") })}>
              Clear
            </Button>
          </div>
        </Field>
        <Field label="Global USD override (RON per USD)" info="Same as the EUR override, for US dollar offers.">
          <div className="flex gap-2">
            <Input
              type="number"
              defaultValue={data.fx_override?.USD ?? ""}
              onBlur={(event) =>
                void saveSettings({
                  fx_override: event.target.value
                    ? { ...data.fx_override, USD: Number(event.target.value) }
                    : withoutOverride(data.fx_override, "USD"),
                })
              }
            />
            <Button type="button" variant="ghost" size="sm" disabled={data.fx_override?.USD == null} onClick={() => void saveSettings({ fx_override: withoutOverride(data.fx_override, "USD") })}>
              Clear
            </Button>
          </div>
        </Field>
        <Field label="Default annual FX drift %" info="Default yearly change applied to future timeline months. Zero keeps the last known rate.">
          <Input type="number" defaultValue={data.fx_drift_percent} onBlur={(event) => void saveSettings({ fx_drift_percent: Number(event.target.value) })} />
        </Field>
        <Field label="Fallback inflation % (if a year is missing)" info="Used for a timeline year that has no row in the inflation list below.">
          <Input type="number" defaultValue={data.inflation_rate_percent} onBlur={(event) => void saveSettings({ inflation_rate_percent: Number(event.target.value) })} />
        </Field>
      </Card>
      <Card className="grid gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">FX rates</h2>
          <Button
            variant="outline"
            onClick={() =>
              void api("/api/fx/refresh", { method: "POST" })
                .then(() => {
                  setMessage("Rates refreshed.");
                  return client.invalidateQueries({ queryKey: ["fx"] });
                })
                .catch((error: Error) => setMessage(error.message))
            }
          >
            Refresh from BNR
          </Button>
        </div>
        <ul className="text-sm text-zinc-500">
          {(fx.data ?? []).map((row) => (
            <li key={`${row.date}-${row.currency}`}>
              {row.date} {row.currency} = {row.rate_to_ron} RON ({row.source})
            </li>
          ))}
        </ul>
      </Card>
      <InflationEditor />
      {GROUPS.map((group) => {
        const section = (rules.data ?? []).filter((rule) => group.keys.includes(rule.key));
        if (!section.length) return null;
        const open = section.some((rule) => !rule.verified);
        return (
          <details key={group.id} open={open} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer px-4 py-3 font-medium">
              {group.title}
              <span className="ml-2 text-sm font-normal text-zinc-500">
                {section.filter((rule) => !rule.verified).length} unverified
              </span>
            </summary>
            <div className="grid gap-3 px-4 pb-4">
              <ConfirmButton
                title={`Verify every rule in ${group.title}?`}
                body="Only do this after you have checked each value against ANAF / Codul Fiscal."
                confirmLabel="Mark verified"
                onConfirm={() => verifySection(section)}
              >
                <Button variant="outline" size="sm">Verify all in this section</Button>
              </ConfirmButton>
              {section.map((rule) => (
                <RuleEditor key={rule.id} rule={rule} onSave={saveRule} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

const GROUPS: { id: string; title: string; keys: string[] }[] = [
  { id: "rates", title: "Rates", keys: ["income_tax_rate", "cas_rate", "cass_rate", "cam_rate", "dividend_tax_rate", "profit_tax_rate"] },
  { id: "wage", title: "Minimum wage", keys: ["minimum_gross_wage"] },
  { id: "tiers", title: "CAS / CASS tiers", keys: ["cas_tiers", "cass_tiers", "cas_cap_min_wages", "cass_cap_min_wages"] },
  { id: "micro", title: "Micro-enterprise", keys: ["micro_tax_rate", "micro_turnover_threshold_eur", "micro_employee_required", "micro_exit_lock_years"] },
  { id: "deduction", title: "Deduction and allowances", keys: ["personal_deduction", "min_wage_tax_free_allowance"] },
  { id: "optional", title: "Optional regimes", keys: ["director_salary", "pfa_ip_enabled", "pfa_ip_flat_deduction_rate"] },
];

function RuleEditor({ rule, onSave }: { rule: TaxRule; onSave: (rule: TaxRule, value: string) => Promise<void> }) {
  const initial = typeof rule.value === "string" ? rule.value : JSON.stringify(rule.value);
  const [value, setValue] = useState(initial);
  const [note, setNote] = useState(rule.note);
  const [verified, setVerified] = useState(rule.verified);
  const [raw, setRaw] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== initial || note !== rule.note || verified !== rule.verified;
  const tiers = rule.key === "cas_tiers" || rule.key === "cass_tiers";
  const deduction = rule.key === "personal_deduction" && isDeduction(rule.value);
  return (
    <Card className="grid gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{rule.key}</span>
        <Badge>{String(rule.effective_from).slice(0, 10)}</Badge>
        {rule.verified ? <Badge className="border-teal-700 text-teal-800 dark:text-teal-300">Verified</Badge> : <Badge className="border-amber-500 text-amber-800 dark:text-amber-300">Unverified</Badge>}
        {dirty ? <Badge>Unsaved</Badge> : null}
        {saved ? <span className="text-xs text-teal-700">Saved</span> : null}
      </div>
      {deduction && !raw ? <DeductionForm value={value} onChange={setValue} /> : null}
      {tiers && !raw ? (
        <Field label="Tiers, minimum wages, comma-separated">
          <Input
            value={parseTiers(value).join(", ")}
            onChange={(event) => {
              const nums = event.target.value.split(",").map((part) => Number(part.trim())).filter((n) => Number.isFinite(n));
              setValue(JSON.stringify(nums));
            }}
          />
        </Field>
      ) : null}
      {(!deduction && !tiers) || raw ? (
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} aria-label={`${rule.key} value`} />
      ) : null}
      {(deduction || tiers) ? (
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <Switch checked={raw} onCheckedChange={setRaw} />
          Edit raw JSON
        </label>
      ) : null}
      <Textarea value={note} onChange={(event) => setNote(event.target.value)} aria-label={`${rule.key} note`} />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={verified} onCheckedChange={setVerified} />
        I verified this against ANAF / Codul Fiscal
      </label>
      <Button
        variant="outline"
        className="w-fit"
        onClick={() => {
          const parsed = parseValue(value);
          if (parsed.error) {
            setError(parsed.error);
            return;
          }
          setError(null);
          void onSave({ ...rule, note, verified }, value).then(() => {
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
          });
        }}
      >
        Save rule
      </Button>
    </Card>
  );
}

function parseValue(text: string): { error?: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
    } catch {
      return { error: "This value is not valid JSON." };
    }
  }
  return {};
}

function parseTiers(text: string): number[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "number") : [];
  } catch {
    return [];
  }
}

function isDeduction(value: unknown): value is { enabled: boolean; bands: { gross_up_to: number | null; base_deduction: number; per_dependant: number }[] } {
  return Boolean(value && typeof value === "object" && "bands" in value);
}

function DeductionForm({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  let parsed: { enabled: boolean; bands: { gross_up_to: number | null; base_deduction: number; per_dependant: number }[] };
  try {
    parsed = JSON.parse(value);
  } catch {
    return <p className="text-xs text-rose-700">Switch to raw JSON to fix this value.</p>;
  }
  function write(next: typeof parsed) {
    onChange(JSON.stringify(next));
  }
  return (
    <div className="grid gap-2">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={Boolean(parsed.enabled)} onCheckedChange={(enabled) => write({ ...parsed, enabled })} />
        Deduction enabled
      </label>
      {parsed.bands.map((band, index) => (
        <div key={index} className="grid grid-cols-3 gap-2">
          <Field label="Gross up to">
            <Input
              inputMode="decimal"
              value={band.gross_up_to ?? ""}
              onChange={(event) => {
                const bands = [...parsed.bands];
                bands[index] = { ...band, gross_up_to: event.target.value === "" ? null : Number(event.target.value) };
                write({ ...parsed, bands });
              }}
            />
          </Field>
          <Field label="Base">
            <Input
              inputMode="decimal"
              value={band.base_deduction}
              onChange={(event) => {
                const bands = [...parsed.bands];
                bands[index] = { ...band, base_deduction: Number(event.target.value) };
                write({ ...parsed, bands });
              }}
            />
          </Field>
          <Field label="Per dependant">
            <Input
              inputMode="decimal"
              value={band.per_dependant}
              onChange={(event) => {
                const bands = [...parsed.bands];
                bands[index] = { ...band, per_dependant: Number(event.target.value) };
                write({ ...parsed, bands });
              }}
            />
          </Field>
        </div>
      ))}
    </div>
  );
}

function withoutOverride(
  override: { EUR?: number; USD?: number } | null | undefined,
  currency: "EUR" | "USD",
) {
  const next = { ...(override ?? {}) };
  delete next[currency];
  return next.EUR == null && next.USD == null ? null : next;
}

function InflationEditor() {
  const client = useQueryClient();
  const rows = useQuery({
    queryKey: ["inflation"],
    queryFn: () => api<{ year: number; annual_rate_percent: number; note: string }[]>("/api/inflation"),
  });
  const [year, setYear] = useState(2026);
  const [rate, setRate] = useState(0);
  return (
    <Card className="grid gap-3 p-4">
      <h2 className="flex items-center gap-1 font-medium">
        Inflation assumptions
        <InfoTip text="Annual percent used when a timeline is set to inflation-adjusted values. Remove a year to fall back to the default percent." />
      </h2>
      <ul className="grid gap-1 text-sm text-zinc-500">
        {(rows.data ?? []).map((row) => (
          <li key={row.year} className="flex items-center justify-between gap-2">
            <span>{row.year}: {row.annual_rate_percent}% {row.note}</span>
            <ConfirmButton
              title={`Remove inflation for ${row.year}?`}
              body="Timelines will use the fallback inflation percent for that year."
              confirmLabel="Remove"
              destructive
              onConfirm={async () => {
                await api(`/api/inflation/${row.year}`, { method: "DELETE" });
                await client.invalidateQueries({ queryKey: ["inflation"] });
              }}
            >
              <Button type="button" variant="ghost" size="sm">Remove</Button>
            </ConfirmButton>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input className="w-28" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
        <Input className="w-28" type="number" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
        <Button
          variant="outline"
          onClick={() =>
            void api(`/api/inflation/${year}`, {
              method: "PUT",
              body: JSON.stringify({ annual_rate_percent: rate, note: "Edited in Settings." }),
            }).then(() => client.invalidateQueries({ queryKey: ["inflation"] }))
          }
        >
          Save year
        </Button>
      </div>
    </Card>
  );
}
