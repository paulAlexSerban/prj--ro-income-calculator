import type { ComparedItem, CompareResult, Currency, Growth, RegimeId } from "@offer-compare/engine";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, Hint, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { daysSince, downloadCsv, money, moneyCompact, percent, ratePercent } from "@/lib/format";
import type { OfferRecord } from "@/lib/offers";

type Settings = { display_currency: Currency };

const FX_HELP =
  "FX effect is display-currency growth minus RON growth. A non-zero figure is the part of the change caused by the exchange rate, not by the offer itself.";

export function DashboardPage() {
  return <Comparison showCharts />;
}

export function PrintPage() {
  return (
    <div className="print-page">
      <h1 className="mb-2 text-xl font-semibold">Offer comparison</h1>
      <Comparison showCharts={false} />
    </div>
  );
}

function Comparison({ showCharts }: { showCharts: boolean }) {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/api/settings") });
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => api<OfferRecord[]>("/api/offers") });
  const [regimes, setRegimes] = useState<Record<string, RegimeId>>({});
  const [sort, setSort] = useState<"label" | "net" | "growth">("net");
  const [status, setStatus] = useState("all");
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [chain, setChain] = useState<string[]>([]);
  const display = settings.data?.display_currency ?? "RON";
  const dark = document.documentElement.classList.contains("dark");

  const compare = useQuery({
    queryKey: ["compare", display, regimes, pairA, pairB, chain],
    enabled: Boolean(offers.data),
    queryFn: () =>
      api<CompareResult>("/api/compare", {
        method: "POST",
        body: JSON.stringify({
          regimes,
          display_currency: display,
          pair: pairA && pairB ? { a: pairA, b: pairB } : null,
          chain,
        }),
      }),
  });

  const rows = useMemo(() => {
    const items = (compare.data?.items ?? []).filter((item) => status === "all" || item.status === status);
    const baseline = compare.data?.versus_baseline ?? {};
    return [...items].sort((a, b) => {
      if (sort === "net") return b.net_monthly_display - a.net_monthly_display;
      if (sort === "growth") return (baseline[b.id]?.net_ron ?? -999) - (baseline[a.id]?.net_ron ?? -999);
      return a.label.localeCompare(b.label);
    });
  }, [compare.data, sort, status]);

  if (offers.data?.length === 0) {
    return (
      <Card className="grid gap-3 p-6">
        <h1 className="text-xl font-semibold">Start with your current income</h1>
        <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-300">
          Add what you earn today, then each offer shows up beside it as net monthly, yearly, and growth. Tax rules are seeded defaults until you verify them in Settings.
        </p>
        <Button asChild className="w-fit">
          <Link to="/offers/new">Add your current income</Link>
        </Button>
      </Card>
    );
  }

  function exportCsv() {
    const header = ["Metric", ...rows.map((row) => row.label)];
    const line = (label: string, pick: (row: ComparedItem) => string | number | null) => [label, ...rows.map(pick)];
    downloadCsv("offer-compare.csv", [
      header,
      line("Original", (row) => `${row.original_amount} ${row.original_currency} ${row.original_rate_type}`),
      line("Gross monthly RON", (row) => row.gross_monthly_ron),
      line("Taxes monthly RON", (row) => row.taxes_monthly_ron),
      line("Contributions monthly RON", (row) => row.contributions_monthly_ron),
      line("Net monthly RON", (row) => row.net_monthly_ron),
      line("Net yearly RON", (row) => row.net_yearly_ron),
      line(`Net monthly ${display}`, (row) => row.net_monthly_display),
      line(`Net yearly ${display}`, (row) => row.net_yearly_display),
      line("Employer cost", (row) => row.employer_cost_monthly_ron),
      line("Effective tax", (row) => row.effective_tax_rate),
      line("Net growth vs current", (row) => compare.data?.versus_baseline[row.id]?.net_ron ?? null),
      line("FX source", (row) => `${row.fx_source} ${row.fx_date ?? ""} @ ${row.fx_rate_to_ron}`),
    ]);
  }

  const chartData = rows.map((row) => ({
    name: row.label,
    net: row.net_monthly_display,
    taxes: display === "RON" ? row.taxes_monthly_ron : row.taxes_monthly_ron / (row.fx_rate_to_ron || 1),
    contributions: display === "RON" ? row.contributions_monthly_ron : row.contributions_monthly_ron / (row.fx_rate_to_ron || 1),
  }));
  const grid = dark ? "#3f3f46" : "#e4e4e7";
  const axis = dark ? "#d4d4d8" : "#3f3f46";

  const metrics: { key: string; label: string; render: (row: ComparedItem) => ReactNode }[] = [
    {
      key: "original",
      label: "Original offer",
      render: (row) => (
        <Hint text={[row.formulas?.original, row.formulas?.fx].filter(Boolean).join("\n\n")}>
          <span>
            {moneyCompact(row.original_amount, row.original_currency)}
            <span className="block text-xs text-zinc-500">{row.original_rate_type.replaceAll("_", " ").toLowerCase()}</span>
            <FxNote row={row} />
          </span>
        </Hint>
      ),
    },
    { key: "gross_monthly", label: "Gross monthly", render: (row) => <Hint text={row.formulas?.gross_monthly}><span>{moneyCompact(row.gross_monthly_ron)}</span></Hint> },
    { key: "taxes", label: "Taxes", render: (row) => <Hint text={row.formulas?.taxes}><span>{moneyCompact(row.taxes_monthly_ron)}</span></Hint> },
    { key: "contributions", label: "Contributions", render: (row) => <Hint text={row.formulas?.contributions}><span>{moneyCompact(row.contributions_monthly_ron)}</span></Hint> },
    { key: "net_monthly", label: "Net monthly", render: (row) => <Hint text={money(row.net_monthly_ron) + (row.formulas?.net_monthly ? `\n${row.formulas.net_monthly}` : "")}><span className="font-medium">{moneyCompact(row.net_monthly_ron)}</span></Hint> },
    { key: "net_yearly", label: "Net yearly (RON)", render: (row) => <Hint text={money(row.net_yearly_ron)}><span>{moneyCompact(row.net_yearly_ron)}</span></Hint> },
    { key: "net_display", label: `Net monthly (${display})`, render: (row) => <Hint text={money(row.net_monthly_display, display)}><span>{moneyCompact(row.net_monthly_display, display)}</span></Hint> },
    { key: "net_year_display", label: `Net yearly (${display})`, render: (row) => <Hint text={money(row.net_yearly_display, display)}><span>{moneyCompact(row.net_yearly_display, display)}</span></Hint> },
    { key: "employer", label: "Employer cost", render: (row) => <Hint text={row.formulas?.employer}><span>{row.employer_cost_monthly_ron == null ? "—" : moneyCompact(row.employer_cost_monthly_ron)}</span></Hint> },
    { key: "effective", label: "Effective tax", render: (row) => <Hint text={row.formulas?.effective}><span>{ratePercent(row.effective_tax_rate)}</span></Hint> },
    {
      key: "growth",
      label: "Growth vs current",
      render: (row) =>
        row.is_current ? (
          <span className="text-zinc-500">Baseline</span>
        ) : (
          <span className="grid gap-1">
            <GrowthChip value={compare.data?.versus_baseline[row.id]?.net_ron ?? null} label="net" />
            <GrowthChip value={compare.data?.versus_baseline[row.id]?.gross_ron ?? null} label="gross" />
          </span>
        ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comparison</h1>
          <p className="text-sm text-zinc-500">Offers are columns. Hover a figure for the formula. Amounts in the last rows follow the display currency in the header.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="w-40">
            <option value="net">Sort by net</option>
            <option value="growth">Sort by growth</option>
            <option value="label">Sort by label</option>
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-36">
            <option value="all">All statuses</option>
            <option value="current">Current</option>
            <option value="offer">Offer</option>
            <option value="interviewing">Interviewing</option>
            <option value="idea">Idea</option>
            <option value="rejected">Rejected</option>
          </Select>
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <Button variant="outline" asChild>
            <Link to="/print" target="_blank">Print / PDF</Link>
          </Button>
        </div>
      </div>
      {compare.isError ? <p className="text-sm text-red-700">{(compare.error as Error).message}</p> : null}
      {compare.isLoading ? <p className="text-sm text-zinc-500">Comparing offers…</p> : null}

      <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 md:block dark:border-zinc-800">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Offer comparison</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-zinc-100 px-3 py-2 text-xs uppercase text-zinc-500 dark:bg-zinc-900">Metric</th>
              {rows.map((row) => (
                <th scope="col" key={row.id} className="min-w-40 bg-zinc-100 px-3 py-2 align-top font-medium dark:bg-zinc-900">
                  <Link to={`/offers/${row.id}`} className="hover:underline">{row.label}</Link>
                  <div className="mt-1 flex flex-wrap gap-1 font-normal">
                    {row.is_current ? <Badge>Current</Badge> : null}
                    <Badge>{row.regime_label}</Badge>
                  </div>
                  {row.contract_type === "B2B" ? (
                    <Select
                      className="mt-2 h-7 text-xs font-normal"
                      aria-label={`Regime for ${row.label}`}
                      value={regimes[row.id] ?? "best"}
                      onChange={(event) => setRegimes({ ...regimes, [row.id]: event.target.value as RegimeId })}
                    >
                      <option value="best">Best net</option>
                      <option value="pfa_norm">PFA norm</option>
                      <option value="pfa_real">PFA real</option>
                      <option value="pfa_ip40">PFA IP</option>
                      <option value="srl_micro">SRL micro</option>
                      <option value="srl_profit">SRL profit</option>
                    </Select>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.key}>
                <th scope="row" className="sticky left-0 z-10 border-t border-zinc-200 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">{metric.label}</th>
                {rows.map((row) => (
                  <td key={row.id} className="num border-t border-zinc-200 px-3 py-2 align-top dark:border-zinc-800">{metric.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="grid gap-2 p-3 text-sm">
              <Link to={`/offers/${row.id}`} className="font-medium">{row.label}</Link>
              {metrics.map((metric) => (
                <div key={metric.key} className="flex items-start justify-between gap-3">
                  <span className="text-zinc-500">{metric.label}</span>
                  <span className="num text-right">{metric.render(row)}</span>
                </div>
              ))}
            </Card>
          </li>
        ))}
      </ul>

      <Card className="no-print grid gap-3 p-4">
        <h2 className="font-medium">Offer A versus offer B</h2>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Offer A" value={pairA} onChange={(event) => setPairA(event.target.value)} className="w-48">
            <option value="">Offer A</option>
            {(compare.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
          <Select aria-label="Offer B" value={pairB} onChange={(event) => setPairB(event.target.value)} className="w-48">
            <option value="">Offer B</option>
            {(compare.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
        </div>
        {compare.data?.pair ? <PairCard growth={compare.data.pair} items={compare.data.items} /> : <p className="text-sm text-zinc-500">Pick two offers to see net growth, gross growth, and the FX effect.</p>}
        <h2 className="font-medium">Sequential chain</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Add chain step"
            className="w-48"
            value=""
            onChange={(event) => {
              if (event.target.value) setChain([...chain, event.target.value]);
            }}
          >
            <option value="">Add step…</option>
            {(compare.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
          <ol className="flex flex-wrap items-center gap-2">
            {chain.map((id, index) => {
              const label = compare.data?.items.find((item) => item.id === id)?.label ?? "Offer";
              return (
                <li key={`${id}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
                  {label}
                  <button type="button" aria-label={`Move ${label} earlier`} onClick={() => index > 0 && setChain(swap(chain, index, index - 1))}>↑</button>
                  <button type="button" aria-label={`Move ${label} later`} onClick={() => index < chain.length - 1 && setChain(swap(chain, index, index + 1))}>↓</button>
                  <button type="button" aria-label={`Remove ${label}`} onClick={() => setChain(chain.filter((_, i) => i !== index))}><X size={12} /></button>
                </li>
              );
            })}
          </ol>
        </div>
        <ol className="grid gap-1 text-sm">
          {(compare.data?.chain ?? []).map((step) => (
            <li key={`${step.from_id}-${step.to_id}`} className="flex flex-wrap items-center gap-2">
              <span>{step.from_label} → {step.to_label}</span>
              <GrowthChip value={step.net_ron} label="net" />
              <Hint text={FX_HELP}><GrowthChip value={step.fx_effect_net} label="FX effect" /></Hint>
            </li>
          ))}
        </ol>
      </Card>

      {showCharts ? (
        <div className="no-print grid gap-4 lg:grid-cols-2">
          <Card className="h-80 p-4">
            <h2 className="mb-2 text-sm font-medium">Net monthly ({display})</h2>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                <XAxis type="number" stroke={axis} tick={{ fill: axis, fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} stroke={axis} tick={{ fill: axis, fontSize: 11 }} />
                <Tooltip formatter={(value) => money(Number(value), display)} />
                <Bar dataKey="net" fill="#0f766e" name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="h-80 p-4">
            <h2 className="mb-2 text-sm font-medium">Net vs taxes vs contributions ({display})</h2>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                <XAxis type="number" stroke={axis} tick={{ fill: axis, fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} stroke={axis} tick={{ fill: axis, fontSize: 11 }} />
                <Tooltip formatter={(value) => money(Number(value), display)} />
                <Legend />
                <Bar dataKey="net" stackId="a" fill="#0f766e" name="Net" />
                <Bar dataKey="taxes" stackId="a" fill="#b45309" name="Taxes" />
                <Bar dataKey="contributions" stackId="a" fill="#1d4ed8" name="Contributions" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function FxNote({ row }: { row: ComparedItem }) {
  const age = daysSince(row.fx_date);
  const stale = age != null && age > 5;
  const label = row.fx_source === "offer_override" ? "offer override" : row.fx_source === "global_override" ? "global override" : row.fx_source;
  return (
    <span className="block text-xs text-zinc-500">
      {label} {row.fx_date ?? ""} @ {row.fx_rate_to_ron}
      {stale ? <span className="ml-1 text-amber-700"> · stale ({age}d)</span> : null}
    </span>
  );
}

export function GrowthChip({ value, label }: { value: number | null; label?: string }) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  const up = value > 0.0000001;
  const down = value < -0.0000001;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const tone = up ? "text-emerald-700 dark:text-emerald-400" : down ? "text-rose-700 dark:text-rose-400" : "text-zinc-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone}`}>
      <Icon size={12} aria-hidden />
      <span className="sr-only">{up ? "up" : down ? "down" : "flat"}</span>
      {percent(value)}
      {label ? <span className="font-normal text-zinc-500"> {label}</span> : null}
    </span>
  );
}

function PairCard({ growth, items }: { growth: { a: string; b: string } & Growth; items: ComparedItem[] }) {
  const a = items.find((item) => item.id === growth.a)?.label ?? "A";
  const b = items.find((item) => item.id === growth.b)?.label ?? "B";
  return (
    <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <p className="font-medium">{b} vs {a}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <GrowthChip value={growth.net_ron} label="net" />
        <GrowthChip value={growth.gross_ron} label="gross" />
        <GrowthChip value={growth.net_display} label="display currency" />
        <Hint text={FX_HELP}><GrowthChip value={growth.fx_effect_net} label="FX effect" /></Hint>
      </div>
    </div>
  );
}

function swap<T>(list: T[], i: number, j: number): T[] {
  const next = [...list];
  const tmp = next[i];
  next[i] = next[j];
  next[j] = tmp;
  return next;
}
