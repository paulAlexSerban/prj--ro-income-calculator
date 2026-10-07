import type { MonthPoint, TrackAggregates } from "@offer-compare/engine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, Card, Field, Input, Select, Switch } from "@/components/ui";
import { api } from "@/lib/api";
import { downloadCsv, money, percent } from "@/lib/format";
import type { OfferRecord } from "@/lib/offers";

type Raise = {
  id: string;
  effective_month_index: number;
  kind: "percent" | "flat";
  base: "gross" | "net";
  value: number;
  compounding: boolean;
  contract_type_change: string | null;
};

type TimelineDetail = {
  id: string;
  label: string;
  start_date: string;
  horizon_months: number;
  notes: string;
  fx_drift_percent: number;
  use_inflation: boolean;
  tracks: {
    id: string;
    label: string;
    color: string;
    regime: string;
    base_offer_id: string | null;
    raises: Raise[];
  }[];
};

type RunTrack = {
  id: string;
  label: string;
  color: string;
  months: MonthPoint[];
  aggregates: TrackAggregates;
};

type RunResult = {
  tracks: RunTrack[];
  display_currency: string;
  pair: {
    a: string;
    b: string;
    break_even_month_index: number | null;
    ahead_from_start: boolean;
    cumulative_net_difference_ron: number;
    monthly_delta_ron: number[];
  } | null;
};

export function TimelinesPage() {
  const client = useQueryClient();
  const timelines = useQuery({ queryKey: ["timelines"], queryFn: () => api<TimelineDetail[]>("/api/timelines") });
  const [label, setLabel] = useState("Stay vs offer");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [horizon, setHorizon] = useState(36);

  async function create() {
    await api("/api/timelines", {
      method: "POST",
      body: JSON.stringify({ label, start_date: start, horizon_months: horizon }),
    });
    await client.invalidateQueries({ queryKey: ["timelines"] });
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Timelines</h1>
      <Card className="grid gap-3 p-4 md:grid-cols-4">
        <Field label="Label">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Field label="Start">
          <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="Horizon (months)">
          <Input type="number" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} />
        </Field>
        <div className="flex items-end">
          <Button onClick={() => void create()}>Create timeline</Button>
        </div>
      </Card>
      <div className="grid gap-2">
        {(timelines.data ?? []).map((timeline) => (
          <Link key={timeline.id} to={`/timelines/${timeline.id}`} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="font-medium">{timeline.label}</div>
            <div className="text-sm text-zinc-500">
              {timeline.start_date} · {timeline.horizon_months} months · {timeline.tracks?.length ?? 0} tracks
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TimelineDetailPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const timeline = useQuery({
    queryKey: ["timeline", id],
    queryFn: () => api<TimelineDetail>(`/api/timelines/${id}`),
    enabled: Boolean(id),
  });
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => api<OfferRecord[]>("/api/offers") });
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [real, setReal] = useState(false);
  const [offerId, setOfferId] = useState("");
  const [trackLabel, setTrackLabel] = useState("");
  const [regime, setRegime] = useState("best");
  const [raiseTrack, setRaiseTrack] = useState("");
  const [raiseMonth, setRaiseMonth] = useState(13);
  const [raiseKind, setRaiseKind] = useState<"percent" | "flat">("percent");
  const [raiseBase, setRaiseBase] = useState<"gross" | "net">("gross");
  const [raiseValue, setRaiseValue] = useState(10);
  const [compounding, setCompounding] = useState(true);

  const run = useQuery({
    queryKey: ["timeline-run", id, pairA, pairB, timeline.data?.updated_at, timeline.data?.tracks],
    enabled: Boolean(timeline.data && timeline.data.tracks.length),
    queryFn: () =>
      api<RunResult>(`/api/timelines/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ pair: pairA && pairB ? { a: pairA, b: pairB } : null }),
      }),
  });

  const chart = useMemo(() => {
    const tracks = run.data?.tracks ?? [];
    const length = tracks[0]?.months.length ?? 0;
    return Array.from({ length }, (_, index) => {
      const point: Record<string, string | number | null> = { month: tracks[0].months[index].month };
      for (const track of tracks) {
        const month = track.months[index];
        point[track.id] = real ? month.net_monthly_real_ron ?? month.net_monthly_ron : month.net_monthly_ron;
        point[`${track.id}-tax`] = month.taxes_monthly_ron + month.contributions_monthly_ron;
        point[`${track.id}-cum`] = track.months.slice(0, index + 1).reduce((sum, item) => sum + item.net_monthly_ron, 0);
      }
      return point;
    });
  }, [run.data, real]);

  async function addTrack() {
    const offer = offers.data?.find((item) => item.id === offerId);
    await api(`/api/timelines/${id}/tracks`, {
      method: "POST",
      body: JSON.stringify({
        label: trackLabel || offer?.label || "Track",
        base_offer_id: offerId,
        regime,
        color: ["#0f766e", "#b45309", "#1d4ed8", "#be123c"][(timeline.data?.tracks.length ?? 0) % 4],
      }),
    });
    await client.invalidateQueries({ queryKey: ["timeline", id] });
  }

  async function addRaise() {
    await api(`/api/tracks/${raiseTrack}/raises`, {
      method: "POST",
      body: JSON.stringify({
        effective_month_index: Math.max(0, raiseMonth - 1),
        kind: raiseKind,
        base: raiseBase,
        value: raiseValue,
        compounding,
      }),
    });
    await client.invalidateQueries({ queryKey: ["timeline", id] });
  }

  function exportCsv() {
    const tracks = run.data?.tracks ?? [];
    const header = ["Month", ...tracks.flatMap((track) => [`${track.label} gross`, `${track.label} net`, `${track.label} tax rate`, `${track.label} rules`, `${track.label} FX`])];
    const rows = (tracks[0]?.months ?? []).map((_, index) => [
      tracks[0].months[index].month,
      ...tracks.flatMap((track) => {
        const month = track.months[index];
        return [month.gross_monthly_ron, month.net_monthly_ron, month.effective_tax_rate, month.rules_label, month.fx_rate_to_ron];
      }),
    ]);
    downloadCsv("timeline.csv", [header, ...rows]);
  }

  if (!timeline.data) return <p className="text-sm text-zinc-500">Loading…</p>;
  const data = timeline.data;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{data.label}</h1>
        <Badge>{data.horizon_months} months from {String(data.start_date).slice(0, 10)}</Badge>
        <Badge>FX drift {data.fx_drift_percent}% / year</Badge>
        <Button className="ml-auto" variant="outline" onClick={exportCsv}>Export CSV</Button>
      </div>
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="FX drift % / year (future months)">
          <Input
            type="number"
            defaultValue={data.fx_drift_percent}
            onBlur={(event) =>
              void api(`/api/timelines/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ fx_drift_percent: Number(event.target.value) }),
              }).then(() => client.invalidateQueries({ queryKey: ["timeline", id] }))
            }
          />
        </Field>
        <label className="flex items-end gap-2 text-sm">
          <Switch
            checked={data.use_inflation}
            onCheckedChange={(checked) =>
              void api(`/api/timelines/${id}`, { method: "PATCH", body: JSON.stringify({ use_inflation: checked }) }).then(() =>
                client.invalidateQueries({ queryKey: ["timeline", id] }),
              )
            }
          />
          Use inflation series for real values
        </label>
        <label className="flex items-end gap-2 text-sm">
          <Switch checked={real} onCheckedChange={setReal} disabled={!data.use_inflation} />
          Chart real (inflation-adjusted) net
        </label>
      </Card>
      <Card className="grid gap-3 p-4 md:grid-cols-4">
        <Field label="Track from offer">
          <Select value={offerId} onChange={(event) => setOfferId(event.target.value)}>
            <option value="">Choose offer</option>
            {(offers.data ?? []).map((offer) => (
              <option key={offer.id} value={offer.id}>{offer.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Track label">
          <Input value={trackLabel} onChange={(event) => setTrackLabel(event.target.value)} />
        </Field>
        <Field label="Regime">
          <Select value={regime} onChange={(event) => setRegime(event.target.value)}>
            <option value="best">Best net</option>
            <option value="employment">Employment</option>
            <option value="pfa_real">PFA real</option>
            <option value="pfa_norm">PFA norm</option>
            <option value="srl_micro">SRL micro</option>
            <option value="srl_profit">SRL profit</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button disabled={!offerId} onClick={() => void addTrack()}>Add track</Button>
        </div>
      </Card>
      <div className="grid gap-2">
        {data.tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: track.color }} />
              <span className="font-medium">{track.label}</span>
              <Badge>{track.regime}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void api(`/api/tracks/${track.id}`, { method: "DELETE" }).then(() => client.invalidateQueries({ queryKey: ["timeline", id] }))}
              >
                Remove
              </Button>
            </div>
            <ul className="mt-2 text-xs text-zinc-500">
              {track.raises.map((raise) => (
                <li key={raise.id}>
                  Month {raise.effective_month_index + 1}: {raise.kind} {raise.value} on {raise.base}
                  {raise.compounding ? " (compounding)" : " (on original base)"}
                  <button
                    className="ml-2 underline"
                    onClick={() => void api(`/api/raises/${raise.id}`, { method: "DELETE" }).then(() => client.invalidateQueries({ queryKey: ["timeline", id] }))}
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Card className="grid gap-3 p-4 md:grid-cols-6">
        <Field label="Raise on track">
          <Select value={raiseTrack} onChange={(event) => setRaiseTrack(event.target.value)}>
            <option value="">Track</option>
            {data.tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Month number">
          <Input type="number" value={raiseMonth} onChange={(event) => setRaiseMonth(Number(event.target.value))} />
        </Field>
        <Field label="Kind">
          <Select value={raiseKind} onChange={(event) => setRaiseKind(event.target.value as "percent" | "flat")}>
            <option value="percent">Percent</option>
            <option value="flat">New amount</option>
          </Select>
        </Field>
        <Field label="Base">
          <Select value={raiseBase} onChange={(event) => setRaiseBase(event.target.value as "gross" | "net")}>
            <option value="gross">Gross</option>
            <option value="net">Net</option>
          </Select>
        </Field>
        <Field label="Value">
          <Input type="number" value={raiseValue} onChange={(event) => setRaiseValue(Number(event.target.value))} />
        </Field>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={compounding} onCheckedChange={setCompounding} />
            Compound
          </label>
          <Button disabled={!raiseTrack} onClick={() => void addRaise()}>Add raise</Button>
        </div>
      </Card>
      {run.isError ? <p className="text-sm text-red-600">{(run.error as Error).message}</p> : null}
      <div className="grid gap-3 md:grid-cols-4">
        {(run.data?.tracks ?? []).map((track) => (
          <Card key={track.id} className="p-3">
            <div className="text-sm text-zinc-500">{track.label}</div>
            <div className="num text-lg">{money(track.aggregates.cumulative_net_ron)}</div>
            <div className="text-xs text-zinc-500">total net · avg {money(track.aggregates.average_monthly_net_ron)} / mo</div>
            <div className="text-xs">Growth {percent(track.aggregates.total_growth)} · CAGR {percent(track.aggregates.cagr)}</div>
            <div className="text-xs text-zinc-500">Taxes and contributions {money(track.aggregates.cumulative_taxes_ron)}</div>
          </Card>
        ))}
      </div>
      <Card className="grid gap-2 p-4 md:grid-cols-2">
        <Field label="Break-even: track A">
          <Select value={pairA} onChange={(event) => setPairA(event.target.value)}>
            <option value="">A</option>
            {data.tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Track B (when it overtakes A)">
          <Select value={pairB} onChange={(event) => setPairB(event.target.value)}>
            <option value="">B</option>
            {data.tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.label}</option>
            ))}
          </Select>
        </Field>
        {run.data?.pair ? (
          <p className="text-sm md:col-span-2">
            Cumulative difference (B − A) {money(run.data.pair.cumulative_net_difference_ron)}.{" "}
            {run.data.pair.ahead_from_start
              ? "B is ahead from the first month."
              : run.data.pair.break_even_month_index == null
                ? "B does not catch A within the horizon."
                : `B overtakes A in month ${run.data.pair.break_even_month_index + 1}.`}
          </p>
        ) : null}
      </Card>
      <Card className="h-80 p-4">
        <h2 className="mb-2 text-sm font-medium">Net monthly</h2>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            {(run.data?.tracks ?? []).map((track) => (
              <Line key={track.id} dataKey={track.id} name={track.label} stroke={track.color} dot={false} />
            ))}
            {(run.data?.tracks ?? []).flatMap((track) =>
              track.months.filter((month) => month.raise_applied).map((month) => (
                <ReferenceLine key={`${track.id}-${month.month}`} x={month.month} stroke={track.color} strokeDasharray="4 4" />
              )),
            )}
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="h-80 p-4">
        <h2 className="mb-2 text-sm font-medium">Cumulative net</h2>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            {(run.data?.tracks ?? []).map((track) => (
              <Line key={track.id} dataKey={`${track.id}-cum`} name={track.label} stroke={track.color} dot={false} />
            ))}
            {run.data?.pair?.break_even_month_index != null && run.data.tracks[0] ? (
              <ReferenceLine
                x={run.data.tracks[0].months[run.data.pair.break_even_month_index]?.month}
                stroke="#be123c"
                label="Break-even"
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="h-80 p-4">
        <h2 className="mb-2 text-sm font-medium">Net vs taxes and contributions</h2>
        <ResponsiveContainer width="100%" height="90%">
          <AreaChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            {(run.data?.tracks ?? []).slice(0, 1).map((track) => (
              <Area key={track.id} dataKey={track.id} name={`${track.label} net`} stackId="1" stroke={track.color} fill={track.color} />
            ))}
            {(run.data?.tracks ?? []).slice(0, 1).map((track) => (
              <Area key={`${track.id}-tax`} dataKey={`${track.id}-tax`} name="Taxes + contributions" stackId="1" stroke="#b45309" fill="#fdba74" />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        {(run.data?.tracks ?? []).map((track) => (
          <details key={track.id} open>
            <summary className="cursor-pointer bg-zinc-100 px-3 py-2 text-sm font-medium dark:bg-zinc-900">{track.label}</summary>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-500">
                  {["Month", "Gross", "Net", "Effective", "Rules", "FX"].map((heading) => (
                    <th key={heading} className="px-2 py-1">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {track.months.map((month) => (
                  <tr key={month.month} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1">{month.month}{month.raise_applied ? " ↑" : ""}</td>
                    <td className="num px-2 py-1">{money(month.gross_monthly_ron)}</td>
                    <td className="num px-2 py-1">{money(real ? month.net_monthly_real_ron ?? month.net_monthly_ron : month.net_monthly_ron)}</td>
                    <td className="num px-2 py-1">{percent(month.effective_tax_rate)}</td>
                    <td className="px-2 py-1">
                      {month.rules_label} {month.future_rules_assumed ? <Badge>Future rules assumed</Badge> : null}
                    </td>
                    <td className="px-2 py-1">{month.fx_source} {month.fx_rate_to_ron}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>
    </div>
  );
}
