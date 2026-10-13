import type { MonthPoint, TrackAggregates } from "@offer-compare/engine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { Badge, Button, Card, ConfirmButton, Field, Hint, InfoTip, Input, Select, Switch } from "@/components/ui";
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
    adjustments?: {
      annual_bonus_month?: number | null;
      annual_bonus_gross?: number;
      annual_bonus_currency?: "RON" | "EUR" | "USD";
      one_offs?: { month_index: number; gross: number; currency: "RON" | "EUR" | "USD" }[];
    };
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
      <form
        className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Field label="Label" info="A name for this projection, for example Stay versus Offer B.">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} required />
        </Field>
        <Field label="Start" info="The first month of the projection. Raises and one-offs count from this month.">
          <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
        </Field>
        <Field label="Horizon (months)" info="How many months to simulate. 36 is three years. Each month runs the same tax engine.">
          <Input type="number" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} required min={1} />
        </Field>
        <div className="flex items-end">
          <Button type="submit">Create timeline</Button>
        </div>
      </form>
      <ul className="grid gap-2">
        {(timelines.data ?? []).map((timeline) => (
          <li key={timeline.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <Link to={`/timelines/${timeline.id}`} className="min-w-0 flex-1">
              <div className="font-medium">{timeline.label}</div>
              <div className="text-sm text-zinc-500">
                {String(timeline.start_date).slice(0, 10)} · {timeline.horizon_months} months · {timeline.tracks?.length ?? 0} tracks
              </div>
            </Link>
            <ConfirmButton
              title={`Delete ${timeline.label}?`}
              body="Tracks, raises, and saved runs are removed with the timeline."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await api(`/api/timelines/${timeline.id}`, { method: "DELETE" });
                await client.invalidateQueries({ queryKey: ["timelines"] });
              }}
            >
              <Button variant="destructive" size="sm">Delete</Button>
            </ConfirmButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TimelineDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [dateMode, setDateMode] = useState<"index" | "date">("index");
  const [raiseDate, setRaiseDate] = useState("");
  const [contractChange, setContractChange] = useState("");
  const [trackColor, setTrackColor] = useState("#0f766e");
  const [areaTrack, setAreaTrack] = useState("");
  const [bonusMonth, setBonusMonth] = useState("");
  const [bonusGross, setBonusGross] = useState(0);
  const [oneOffMonth, setOneOffMonth] = useState(6);
  const [oneOffGross, setOneOffGross] = useState(0);

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
        color: trackColor,
      }),
    });
    await client.invalidateQueries({ queryKey: ["timeline", id] });
  }

  function monthIndexFromDate(start: string, date: string) {
    const [sy, sm] = start.slice(0, 7).split("-").map(Number);
    const [dy, dm] = date.slice(0, 7).split("-").map(Number);
    return (dy - sy) * 12 + (dm - sm);
  }

  async function addRaise() {
    const index = dateMode === "date" && raiseDate
      ? monthIndexFromDate(String(timeline.data?.start_date ?? ""), raiseDate)
      : Math.max(0, raiseMonth - 1);
    await api(`/api/tracks/${raiseTrack}/raises`, {
      method: "POST",
      body: JSON.stringify({
        effective_month_index: Math.max(0, index),
        kind: raiseKind,
        base: raiseBase,
        value: raiseValue,
        compounding,
        contract_type_change: contractChange || null,
      }),
    });
    await client.invalidateQueries({ queryKey: ["timeline", id] });
  }

  async function saveAdjustments(trackId: string, adjustments: NonNullable<TimelineDetail["tracks"][number]["adjustments"]>) {
    await api(`/api/tracks/${trackId}`, { method: "PATCH", body: JSON.stringify({ adjustments }) });
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
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <ConfirmButton
            title={`Delete ${data.label}?`}
            body="Tracks, raises, and saved runs are removed with the timeline."
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              await api(`/api/timelines/${id}`, { method: "DELETE" });
              await client.invalidateQueries({ queryKey: ["timelines"] });
              navigate("/timelines");
            }}
          >
            <Button variant="destructive">Delete</Button>
          </ConfirmButton>
        </div>
      </div>
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="FX drift % / year (future months)" info="Past months use the stored rate. Future months move that rate by this percent per year. Zero keeps the last known rate.">
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
        <div className="flex items-end gap-2 text-sm">
          <label className="flex items-center gap-2">
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
          <InfoTip text="Divides later months by cumulative inflation from Settings, so you can compare purchasing power with the nominal paycheck." />
        </div>
        <div className="flex items-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={real} onCheckedChange={setReal} disabled={!data.use_inflation} />
            Chart real (inflation-adjusted) net
          </label>
          <InfoTip text="Switches the net line and the yearly table to inflation-adjusted values. Turn on the inflation series first." />
        </div>
      </Card>
      <form
        className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (offerId) void addTrack();
        }}
      >
        <Field label="Track from offer" info="A track is one offer projected over the horizon. Add several to compare staying with taking an offer.">
          <Select value={offerId} onChange={(event) => setOfferId(event.target.value)}>
            <option value="">Choose offer</option>
            {(offers.data ?? []).map((offer) => (
              <option key={offer.id} value={offer.id}>{offer.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Track label" info="The name on the chart. Defaults to the offer name if you leave it blank.">
          <Input value={trackLabel} onChange={(event) => setTrackLabel(event.target.value)} />
        </Field>
        <Field label="Regime" info="Which tax regime feeds this track. Best net picks the highest personal net each time the offer is B2B.">
          <Select value={regime} onChange={(event) => setRegime(event.target.value)}>
            <option value="best">Best net</option>
            <option value="employment">Employment</option>
            <option value="pfa_real">PFA real</option>
            <option value="pfa_norm">PFA norm</option>
            <option value="srl_micro">SRL micro</option>
            <option value="srl_profit">SRL profit</option>
          </Select>
        </Field>
        <Field label="Color" info="The line color for this track on the charts.">
          <Input type="color" value={trackColor} onChange={(event) => setTrackColor(event.target.value)} aria-label="Track color" />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={!offerId}>Add track</Button>
        </div>
      </form>
      <div className="grid gap-2">
        {data.tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: track.color }} />
              <span className="font-medium">{track.label}</span>
              <Badge>{track.regime}</Badge>
              <ConfirmButton
                title={`Remove ${track.label}?`}
                body="Raises on this track are deleted with it."
                confirmLabel="Remove"
                destructive
                onConfirm={() => api(`/api/tracks/${track.id}`, { method: "DELETE" }).then(() => client.invalidateQueries({ queryKey: ["timeline", id] }))}
              >
                <Button variant="ghost" size="sm">Remove</Button>
              </ConfirmButton>
            </div>
            <ul className="mt-2 text-xs text-zinc-500">
              {track.raises.map((raise) => (
                <li key={raise.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    Month {raise.effective_month_index + 1}
                    {monthLabel(String(data.start_date), raise.effective_month_index)}: {raise.kind} {raise.value} on {raise.base}
                    {raise.compounding ? " (compounding)" : " (on original base)"}
                    {raise.contract_type_change ? ` · switch to ${raise.contract_type_change}` : ""}
                  </span>
                  <ConfirmButton
                    title="Delete this raise?"
                    body="The timeline will be recalculated without it."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => api(`/api/raises/${raise.id}`, { method: "DELETE" }).then(() => client.invalidateQueries({ queryKey: ["timeline", id] }))}
                  >
                    <button className="underline">delete</button>
                  </ConfirmButton>
                </li>
              ))}
            </ul>
            <Adjustments track={track} onSave={(adjustments) => saveAdjustments(track.id, adjustments)} bonusMonth={bonusMonth} setBonusMonth={setBonusMonth} bonusGross={bonusGross} setBonusGross={setBonusGross} oneOffMonth={oneOffMonth} setOneOffMonth={setOneOffMonth} oneOffGross={oneOffGross} setOneOffGross={setOneOffGross} />
          </div>
        ))}
      </div>
      <form
        className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (raiseTrack) void addRaise();
        }}
      >
        <Field label="Raise on track" info="Applies from the chosen month onward. Later months use the raised amount.">
          <Select value={raiseTrack} onChange={(event) => setRaiseTrack(event.target.value)}>
            <option value="">Track</option>
            {data.tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="When" info="Month number counts from the timeline start (1 is the first month). Absolute month is a calendar month, converted to that index.">
          <Select value={dateMode} onChange={(event) => setDateMode(event.target.value as "index" | "date")}>
            <option value="index">Month number</option>
            <option value="date">Absolute month</option>
          </Select>
        </Field>
        {dateMode === "index" ? (
          <Field label="Month number (1 = first)">
            <Input type="number" value={raiseMonth} onChange={(event) => setRaiseMonth(Number(event.target.value))} />
          </Field>
        ) : (
          <Field label="Effective month">
            <Input type="month" value={raiseDate} onChange={(event) => setRaiseDate(event.target.value)} />
          </Field>
        )}
        <Field label="Kind" info="Percent increases the current amount. New amount replaces it with the value you type.">
          <Select value={raiseKind} onChange={(event) => setRaiseKind(event.target.value as "percent" | "flat")}>
            <option value="percent">Percent</option>
            <option value="flat">New amount</option>
          </Select>
        </Field>
        <Field label="Base" info="Gross scales the offered amount. Net solves a new gross so take-home rises by that percent.">
          <Select value={raiseBase} onChange={(event) => setRaiseBase(event.target.value as "gross" | "net")}>
            <option value="gross">Gross</option>
            <option value="net">Net</option>
          </Select>
        </Field>
        <Field label="Value" info="For a percent, 10 means +10%. For a new amount, this is the new gross or net figure.">
          <Input type="number" value={raiseValue} onChange={(event) => setRaiseValue(Number(event.target.value))} />
        </Field>
        <Field label="Contract change" info="Optional. From this month the track is taxed as employment or B2B instead of the original contract.">
          <Select value={contractChange} onChange={(event) => setContractChange(event.target.value)}>
            <option value="">None</option>
            <option value="EMPLOYMENT">Switch to CIM</option>
            <option value="B2B">Switch to B2B</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-2">
              <Switch checked={compounding} onCheckedChange={setCompounding} />
              Compound
            </label>
            <InfoTip text="On: each percent raise stacks on the previous one. Off: the percent is applied to the original amount." />
          </div>
          <Button type="submit" disabled={!raiseTrack}>Add raise</Button>
        </div>
      </form>
      {run.isLoading || run.isFetching ? <p className="text-sm text-zinc-500">Computing the monthly series…</p> : null}
      {run.isError ? <p className="text-sm text-rose-700">{(run.error as Error).message}</p> : null}
      <div className="grid gap-3 md:grid-cols-4">
        {(run.data?.tracks ?? []).map((track) => (
          <Card key={track.id} className="p-3">
            <div className="text-sm text-zinc-500">{track.label}</div>
            <div className="num text-lg">{money(track.aggregates.cumulative_net_ron)}</div>
            <div className="text-xs text-zinc-500">total net ({real ? "chart is real" : "nominal"}) · avg {money(track.aggregates.average_monthly_net_ron)} / mo</div>
            <div className="text-xs">Growth {percent(track.aggregates.total_growth)} · CAGR {percent(track.aggregates.cagr)}</div>
            <div className="text-xs text-zinc-500">Taxes and contributions {money(track.aggregates.cumulative_taxes_ron)}</div>
          </Card>
        ))}
      </div>
      <Card className="grid gap-2 p-4 md:grid-cols-2">
        <Field label="Break-even: track A" info="The baseline, often staying in the current job. Break-even is when track B's cumulative net catches this one.">
          <Select value={pairA} onChange={(event) => setPairA(event.target.value)}>
            <option value="">A</option>
            {data.tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Track B (when it overtakes A)" info="The alternative. The chart marks the first month its running total of net pay is at least track A's.">
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
      <Card className="h-96 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Net vs taxes and contributions</h2>
          <Select aria-label="Area chart track" className="h-8 w-40" value={areaTrack || run.data?.tracks[0]?.id || ""} onChange={(event) => setAreaTrack(event.target.value)}>
            {(run.data?.tracks ?? []).map((track) => (
              <option key={track.id} value={track.id}>{track.label}</option>
            ))}
          </Select>
        </div>
        <ResponsiveContainer width="100%" height="80%">
          <AreaChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            {(run.data?.tracks ?? []).filter((track) => track.id === (areaTrack || run.data?.tracks[0]?.id)).map((track) => (
              <Area key={track.id} dataKey={track.id} name={`${track.label} net`} stackId="1" stroke={track.color} fill={track.color} />
            ))}
            {(run.data?.tracks ?? []).filter((track) => track.id === (areaTrack || run.data?.tracks[0]?.id)).map((track) => (
              <Area key={`${track.id}-tax`} dataKey={`${track.id}-tax`} name="Taxes + contributions" stackId="1" stroke="#b45309" fill="#fdba74" />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        {(run.data?.tracks ?? []).map((track) => (
          <details key={track.id} open>
            <summary className="cursor-pointer bg-zinc-100 px-3 py-2 text-sm font-medium dark:bg-zinc-900">{track.label}</summary>
            {groupYears(track.months).map((group) => {
              const gross = group.months.reduce((sum, month) => sum + month.gross_monthly_ron, 0);
              const net = group.months.reduce((sum, month) => sum + (real ? month.net_monthly_real_ron ?? month.net_monthly_ron : month.net_monthly_ron), 0);
              return (
                <details key={group.year} open className="border-t border-zinc-200 dark:border-zinc-800">
                  <summary className="cursor-pointer px-3 py-2 text-xs">
                    {group.year} · gross {money(gross)} · net {money(net)}
                  </summary>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-zinc-500">
                        {["Month", "Gross", "Net", "Effective", "Rules", "FX"].map((heading) => (
                          <th key={heading} scope="col" className="px-2 py-1">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.months.map((month) => (
                        <tr key={month.month} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="px-2 py-1">{month.month}{month.raise_applied ? " ↑" : ""}</td>
                          <td className="num px-2 py-1">
                            <Hint text={`Gross ${money(month.gross_monthly_ron)}. ${month.rules_label}. FX ${month.fx_source} ${month.fx_rate_to_ron}.${month.future_rules_assumed ? " Future rules assumed." : ""}`}>
                              <span>{money(month.gross_monthly_ron)}</span>
                            </Hint>
                          </td>
                          <td className="num px-2 py-1">
                            <Hint text={`Net ${money(month.net_monthly_ron)}. Effective ${(month.effective_tax_rate ?? 0) * 100}%.`}>
                              <span>{money(real ? month.net_monthly_real_ron ?? month.net_monthly_ron : month.net_monthly_ron)}</span>
                            </Hint>
                          </td>
                          <td className="num px-2 py-1">{percent(month.effective_tax_rate)}</td>
                          <td className="px-2 py-1">{month.rules_label} {month.future_rules_assumed ? <Badge>Future rules assumed</Badge> : null}</td>
                          <td className="px-2 py-1">{month.fx_source} {month.fx_rate_to_ron}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              );
            })}
          </details>
        ))}
      </div>
    </div>
  );
}

function monthLabel(start: string, index: number) {
  const [year, month] = start.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + index, 1));
  return ` (${date.toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" })})`;
}

function groupYears(months: MonthPoint[]) {
  const groups = new Map<string, MonthPoint[]>();
  for (const month of months) {
    const year = month.month.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), month]);
  }
  return [...groups.entries()].map(([year, rows]) => ({ year, months: rows }));
}

function Adjustments({
  track,
  onSave,
  bonusMonth,
  setBonusMonth,
  bonusGross,
  setBonusGross,
  oneOffMonth,
  setOneOffMonth,
  oneOffGross,
  setOneOffGross,
}: {
  track: TimelineDetail["tracks"][number];
  onSave: (adjustments: NonNullable<TimelineDetail["tracks"][number]["adjustments"]>) => Promise<void>;
  bonusMonth: string;
  setBonusMonth: (value: string) => void;
  bonusGross: number;
  setBonusGross: (value: number) => void;
  oneOffMonth: number;
  setOneOffMonth: (value: number) => void;
  oneOffGross: number;
  setOneOffGross: (value: number) => void;
}) {
  const current = track.adjustments ?? {};
  return (
    <div className="mt-3 grid gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <p className="flex items-center gap-1 text-xs font-medium">
        Recurring adjustments
        <InfoTip text="These sit on top of the offer. An annual bonus repeats every year in that calendar month. A one-off is taxed once, in the month you pick." />
      </p>
      {(current.annual_bonus_month || current.annual_bonus_gross) ? (
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span>Annual bonus: month {current.annual_bonus_month ?? "—"}, {money(current.annual_bonus_gross ?? 0)} gross</span>
          <ConfirmButton
            title="Remove the annual bonus?"
            body="Later months will no longer include this bonus."
            confirmLabel="Remove"
            destructive
            onConfirm={() =>
              onSave({
                ...current,
                annual_bonus_month: null,
                annual_bonus_gross: 0,
                annual_bonus_currency: "RON",
                one_offs: current.one_offs ?? [],
              })
            }
          >
            <Button type="button" variant="ghost" size="sm">Remove bonus</Button>
          </ConfirmButton>
        </div>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            ...current,
            annual_bonus_month: bonusMonth ? Number(bonusMonth) : null,
            annual_bonus_gross: bonusGross,
            annual_bonus_currency: "RON",
            one_offs: current.one_offs ?? [],
          });
        }}
      >
        <Field label="Annual bonus month (1–12)" info="Calendar month, not the timeline month. 12 means every December.">
          <Input className="w-24" value={bonusMonth} placeholder={String(current.annual_bonus_month ?? "")} onChange={(event) => setBonusMonth(event.target.value)} />
        </Field>
        <Field label="Bonus gross" info="Gross RON added that month and taxed with the same engine. It is not spread across the year.">
          <Input className="w-28" type="number" value={bonusGross} onChange={(event) => setBonusGross(Number(event.target.value))} />
        </Field>
        <Button type="submit" size="sm" variant="outline">
          Save bonus
        </Button>
      </form>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            annual_bonus_month: current.annual_bonus_month ?? null,
            annual_bonus_gross: current.annual_bonus_gross ?? 0,
            annual_bonus_currency: "RON",
            one_offs: [...(current.one_offs ?? []), { month_index: Math.max(0, oneOffMonth - 1), gross: oneOffGross, currency: "RON" }],
          });
        }}
      >
        <Field label="One-off month number" info="Timeline month, starting at 1. The bonus is added only in that month.">
          <Input className="w-24" type="number" value={oneOffMonth} onChange={(event) => setOneOffMonth(Number(event.target.value))} />
        </Field>
        <Field label="One-off gross" info="Extra gross in RON for that single month. Delete it from the list if you added it by mistake.">
          <Input className="w-28" type="number" value={oneOffGross} onChange={(event) => setOneOffGross(Number(event.target.value))} />
        </Field>
        <Button type="submit" size="sm" variant="outline">
          Add one-off
        </Button>
      </form>
      <ul className="grid gap-1 text-xs text-zinc-500">
        {(current.one_offs ?? []).map((item, index) => (
          <li key={`${item.month_index}-${index}`} className="flex items-center justify-between gap-2">
            <span>One-off month {item.month_index + 1}: {money(item.gross)}</span>
            <ConfirmButton
              title="Remove this one-off?"
              body="That month will be recalculated without this payment."
              confirmLabel="Remove"
              destructive
              onConfirm={() =>
                onSave({
                  annual_bonus_month: current.annual_bonus_month ?? null,
                  annual_bonus_gross: current.annual_bonus_gross ?? 0,
                  annual_bonus_currency: current.annual_bonus_currency ?? "RON",
                  one_offs: (current.one_offs ?? []).filter((_, itemIndex) => itemIndex !== index),
                })
              }
            >
              <Button type="button" variant="ghost" size="sm">Remove</Button>
            </ConfirmButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
