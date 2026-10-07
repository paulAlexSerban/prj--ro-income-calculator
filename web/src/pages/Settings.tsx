import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Select, Switch, Textarea } from "@/components/ui";
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
  }

  if (!settings.data) return <p className="text-sm text-zinc-500">Loading…</p>;
  const data = settings.data;

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-sm text-zinc-500">
        Every seeded tax figure is unverified. Edit the value, then mark it verified after you check ANAF / Codul Fiscal.
        The calculator never hard-codes these rates.
      </p>
      {message ? <p className="text-sm text-teal-700">{message}</p> : null}
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="Display currency">
          <Select
            value={data.display_currency}
            onChange={(event) => void saveSettings({ display_currency: event.target.value as Settings["display_currency"] })}
          >
            <option>RON</option>
            <option>EUR</option>
            <option>USD</option>
          </Select>
        </Field>
        <Field label="Default hours / day">
          <Input type="number" defaultValue={data.hours_per_day} onBlur={(event) => void saveSettings({ hours_per_day: Number(event.target.value) })} />
        </Field>
        <Field label="Default working days / month">
          <Input type="number" defaultValue={data.working_days_per_month} onBlur={(event) => void saveSettings({ working_days_per_month: Number(event.target.value) })} />
        </Field>
        <Field label="Default B2B billable days / year">
          <Input type="number" defaultValue={data.billable_days_per_year} onBlur={(event) => void saveSettings({ billable_days_per_year: Number(event.target.value) })} />
        </Field>
        <Field label="Global EUR override (RON per EUR)">
          <Input
            type="number"
            defaultValue={data.fx_override?.EUR ?? ""}
            onBlur={(event) =>
              void saveSettings({
                fx_override: { ...data.fx_override, EUR: event.target.value ? Number(event.target.value) : undefined },
              })
            }
          />
        </Field>
        <Field label="Global USD override (RON per USD)">
          <Input
            type="number"
            defaultValue={data.fx_override?.USD ?? ""}
            onBlur={(event) =>
              void saveSettings({
                fx_override: { ...data.fx_override, USD: event.target.value ? Number(event.target.value) : undefined },
              })
            }
          />
        </Field>
        <Field label="Default annual FX drift %">
          <Input type="number" defaultValue={data.fx_drift_percent} onBlur={(event) => void saveSettings({ fx_drift_percent: Number(event.target.value) })} />
        </Field>
        <Field label="Fallback inflation % (if a year is missing)">
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
      <div className="grid gap-3">
        {(rules.data ?? []).map((rule) => (
          <RuleEditor key={rule.id} rule={rule} onSave={saveRule} />
        ))}
      </div>
    </div>
  );
}

function RuleEditor({ rule, onSave }: { rule: TaxRule; onSave: (rule: TaxRule, value: string) => Promise<void> }) {
  const [value, setValue] = useState(typeof rule.value === "string" ? rule.value : JSON.stringify(rule.value));
  const [note, setNote] = useState(rule.note);
  const [verified, setVerified] = useState(rule.verified);
  return (
    <Card className="grid gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{rule.key}</span>
        <Badge>{rule.effective_from}</Badge>
        <Badge>{rule.tax_year}</Badge>
        {rule.verified ? <Badge className="border-teal-700 text-teal-700">Verified</Badge> : <Badge>Verify against ANAF / Codul Fiscal</Badge>}
      </div>
      <Textarea value={value} onChange={(event) => setValue(event.target.value)} />
      <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={verified} onCheckedChange={setVerified} />
        I verified this against ANAF / Codul Fiscal
      </label>
      <Button
        variant="outline"
        className="w-fit"
        onClick={() => void onSave({ ...rule, note, verified }, value)}
      >
        Save rule
      </Button>
    </Card>
  );
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
      <h2 className="font-medium">Inflation assumptions</h2>
      <ul className="text-sm text-zinc-500">
        {(rows.data ?? []).map((row) => (
          <li key={row.year}>{row.year}: {row.annual_rate_percent}% {row.note}</li>
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
