import type { CompareResult, Currency, RegimeId } from "@offer-compare/engine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { downloadCsv, money, percent, ratePercent } from "@/lib/format";
import type { OfferRecord } from "@/lib/offers";

type Settings = { display_currency: Currency };

export function DashboardPage() {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/api/settings") });
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => api<OfferRecord[]>("/api/offers") });
  const [regimes, setRegimes] = useState<Record<string, RegimeId>>({});
  const [sort, setSort] = useState<"label" | "net" | "growth">("net");
  const [status, setStatus] = useState("all");
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [chain, setChain] = useState<string[]>([]);
  const display = settings.data?.display_currency ?? "RON";

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
      if (sort === "net") return b.net_monthly_ron - a.net_monthly_ron;
      if (sort === "growth") return (baseline[b.id]?.net_ron ?? -999) - (baseline[a.id]?.net_ron ?? -999);
      return a.label.localeCompare(b.label);
    });
  }, [compare.data, sort, status]);

  async function setCurrency(currency: Currency) {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ display_currency: currency }) });
    await client.invalidateQueries({ queryKey: ["settings"] });
  }

  function exportCsv() {
    const header = [
      "Label",
      "Regime",
      "Original",
      "Gross monthly RON",
      "Taxes monthly RON",
      "Contributions monthly RON",
      "Net monthly RON",
      "Net yearly RON",
      `Net monthly ${display}`,
      `Net yearly ${display}`,
      "Employer cost monthly RON",
      "Effective tax",
      "Net growth vs current",
      "Gross growth vs current",
      "FX effect",
      "FX rate",
      "FX date",
      "FX source",
    ];
    const body = rows.map((row) => {
      const growth = compare.data?.versus_baseline[row.id];
      return [
        row.label,
        row.regime_label,
        `${row.original_amount} ${row.original_currency} ${row.original_rate_type}`,
        row.gross_monthly_ron,
        row.taxes_monthly_ron,
        row.contributions_monthly_ron,
        row.net_monthly_ron,
        row.net_yearly_ron,
        row.net_monthly_display,
        row.net_yearly_display,
        row.employer_cost_monthly_ron,
        row.effective_tax_rate,
        growth?.net_ron,
        growth?.gross_ron,
        growth?.fx_effect_net,
        row.fx_rate_to_ron,
        row.fx_date,
        row.fx_source,
      ];
    });
    downloadCsv("offer-compare.csv", [header, ...body]);
  }

  const chartData = rows.map((row) => ({
    name: row.label,
    net: row.net_monthly_ron,
    taxes: row.taxes_monthly_ron,
    contributions: row.contributions_monthly_ron,
  }));

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comparison</h1>
          <p className="text-sm text-zinc-500">Net and gross in RON, plus the display currency. Growth is versus current income.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={display} onChange={(event) => void setCurrency(event.target.value as Currency)} className="w-28">
            <option>RON</option>
            <option>EUR</option>
            <option>USD</option>
          </Select>
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
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      </div>
      {compare.isError ? <p className="text-sm text-red-600">{(compare.error as Error).message}</p> : null}
      {offers.data?.length === 0 ? (
        <Card className="p-4 text-sm">
          Add your current income on the <Link className="underline" to="/offers/new">offers page</Link> to start a comparison.
        </Card>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              {["Offer", "Original", "Gross / mo", "Taxes", "Contributions", "Net / mo", "Net / yr", `Net / mo ${display}`, "Employer cost", "Effective", "Growth net", "Growth gross"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const growth = compare.data?.versus_baseline[row.id];
              return (
                <tr key={row.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-2 py-2">
                    <Link to={`/offers/${row.id}`} className="font-medium hover:underline">{row.label}</Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.is_current ? <Badge>Current</Badge> : null}
                      <Badge>{row.regime_label}</Badge>
                      {row.contract_type === "B2B" ? (
                        <Select
                          className="mt-1 h-7 text-xs"
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
                    </div>
                  </td>
                  <td className="num px-2 py-2">{row.original_amount} {row.original_currency}<div className="text-xs text-zinc-500">{row.original_rate_type}</div><div className="text-xs text-zinc-500">{row.fx_source} {row.fx_date ?? ""} @ {row.fx_rate_to_ron}</div></td>
                  <td className="num px-2 py-2">{money(row.gross_monthly_ron)}</td>
                  <td className="num px-2 py-2">{money(row.taxes_monthly_ron)}</td>
                  <td className="num px-2 py-2">{money(row.contributions_monthly_ron)}</td>
                  <td className="num px-2 py-2">{money(row.net_monthly_ron)}</td>
                  <td className="num px-2 py-2">{money(row.net_yearly_ron)}</td>
                  <td className="num px-2 py-2">{money(row.net_monthly_display, display)}</td>
                  <td className="num px-2 py-2">{row.employer_cost_monthly_ron == null ? "—" : money(row.employer_cost_monthly_ron)}</td>
                  <td className="num px-2 py-2">{ratePercent(row.effective_tax_rate)}</td>
                  <td className="num px-2 py-2">{row.is_current ? "—" : percent(growth?.net_ron)}</td>
                  <td className="num px-2 py-2">{row.is_current ? "—" : percent(growth?.gross_ron)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Card className="no-print grid gap-3 p-4">
        <h2 className="font-medium">Growth between two offers</h2>
        <div className="flex flex-wrap gap-2">
          <Select value={pairA} onChange={(event) => setPairA(event.target.value)} className="w-48">
            <option value="">Offer A</option>
            {(compare.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
          <Select value={pairB} onChange={(event) => setPairB(event.target.value)} className="w-48">
            <option value="">Offer B</option>
            {(compare.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
        </div>
        {compare.data?.pair ? (
          <p className="text-sm">
            Net growth {percent(compare.data.pair.net_ron)} · gross growth {percent(compare.data.pair.gross_ron)} · display-currency growth {percent(compare.data.pair.net_display)} · FX effect {percent(compare.data.pair.fx_effect_net)}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Pick two offers. FX effect is the gap between RON growth and display-currency growth.</p>
        )}
        <h2 className="font-medium">Sequential chain</h2>
        <div className="flex flex-wrap gap-2">
          <Select
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
          <Button variant="ghost" onClick={() => setChain([])}>Clear</Button>
        </div>
        <ol className="grid gap-1 text-sm">
          {(compare.data?.chain ?? []).map((step) => (
            <li key={`${step.from_id}-${step.to_id}`}>
              {step.from_label} → {step.to_label}: net {percent(step.net_ron)}, display {percent(step.net_display)}, FX effect {percent(step.fx_effect_net)}
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-80 p-4">
          <h2 className="mb-2 text-sm font-medium">Net monthly (RON)</h2>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="net" fill="#0f766e" name="Net" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="h-80 p-4">
          <h2 className="mb-2 text-sm font-medium">Net vs taxes vs contributions</h2>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="net" stackId="a" fill="#0f766e" name="Net" />
              <Bar dataKey="taxes" stackId="a" fill="#b45309" name="Taxes" />
              <Bar dataKey="contributions" stackId="a" fill="#1d4ed8" name="Contributions" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
