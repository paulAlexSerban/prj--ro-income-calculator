import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CalculationResult, CompareResult } from "@offer-compare/engine";
import { RegimeCard } from "@/components/Breakdown";
import { Badge, Button, ConfirmButton, Select } from "@/components/ui";
import { OfferEditor } from "./OfferEditor";
import { api } from "@/lib/api";
import { money, moneyCompact } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { asOfferInput, blankOffer, type OfferRecord } from "@/lib/offers";

export function OffersPage() {
  const client = useQueryClient();
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => api<OfferRecord[]>("/api/offers") });
  const compare = useQuery({
    queryKey: ["compare", "offers-list"],
    enabled: Boolean(offers.data?.length),
    queryFn: () => api<CompareResult>("/api/compare", { method: "POST", body: JSON.stringify({}) }),
  });
  const [sort, setSort] = useState<"label" | "net" | "status">("label");
  const nets = useMemo(() => new Map((compare.data?.items ?? []).map((item) => [item.id, item])), [compare.data]);
  const rows = [...(offers.data ?? [])].sort((a, b) => {
    if (sort === "net") return (nets.get(b.id)?.net_monthly_ron ?? 0) - (nets.get(a.id)?.net_monthly_ron ?? 0);
    if (sort === "status") return a.status.localeCompare(b.status);
    return a.label.localeCompare(b.label);
  });

  async function clone(offer: OfferRecord) {
    const input = asOfferInput(offer);
    await api("/api/offers", {
      method: "POST",
      body: JSON.stringify({ ...input, label: `Copy of ${offer.label}`, is_current: false, status: "idea" }),
    });
    await client.invalidateQueries({ queryKey: ["offers"] });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Offers</h1>
        <div className="flex gap-2">
          <Select aria-label="Sort offers" className="w-36" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="label">Sort by name</option>
            <option value="net">Sort by net</option>
            <option value="status">Sort by status</option>
          </Select>
          <Button asChild>
            <Link to="/offers/new">Add offer</Link>
          </Button>
        </div>
      </div>
      <ul className="grid gap-2">
        {rows.map((offer) => {
          const net = nets.get(offer.id);
          return (
            <li key={offer.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <Link to={`/offers/${offer.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{offer.label}</span>
                  <Badge>{offer.contract_type === "EMPLOYMENT" ? "CIM" : "B2B"}</Badge>
                  <Badge>{offer.status}</Badge>
                  {offer.is_current ? <Badge className="border-teal-700 text-teal-800 dark:text-teal-300">Current</Badge> : null}
                </div>
                <p className="num mt-1 text-sm text-zinc-500">
                  {money(Number(offer.amount), offer.currency)} · {offer.rate_type}
                  {net ? ` · net ${moneyCompact(net.net_monthly_ron)}/mo` : ""}
                </p>
              </Link>
              <Button variant="outline" size="sm" onClick={() => void clone(offer)}>Clone</Button>
            </li>
          );
        })}
      </ul>
      {offers.data?.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No offers yet. <Link className="underline" to="/offers/new">Add your current income</Link> first.
        </p>
      ) : null}
    </div>
  );
}

export function NewOfferPage() {
  return <OfferEditor initial={blankOffer()} />;
}

export function EditOfferPage() {
  const { id } = useParams();
  const offer = useQuery({
    queryKey: ["offer", id],
    queryFn: () => api<OfferRecord>(`/api/offers/${id}`),
    enabled: Boolean(id),
  });
  if (!offer.data) return <p className="text-sm text-zinc-500">Loading…</p>;
  return <OfferEditor id={offer.data.id} initial={asOfferInput(offer.data)} />;
}

export function OfferDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const offer = useQuery({
    queryKey: ["offer", id],
    queryFn: () => api<OfferRecord>(`/api/offers/${id}`),
    enabled: Boolean(id),
  });
  const preview = useQuery({
    queryKey: ["offer-calc", id, offer.data?.updated_at],
    enabled: Boolean(offer.data),
    queryFn: () =>
      api<CalculationResult>("/api/calculate", {
        method: "POST",
        body: JSON.stringify({ offer: asOfferInput(offer.data!) }),
      }),
  });

  if (!offer.data) return <p className="text-sm text-zinc-500">Loading…</p>;
  const row = offer.data;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{row.label}</h1>
        <Badge>{row.contract_type}</Badge>
        {preview.data ? <Badge>{preview.data.ruleset.label}</Badge> : null}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/offers/${row.id}/edit`)}>
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void api(`/api/scenarios`, { method: "POST", body: JSON.stringify({ offer_id: row.id }) }).then(() =>
                toast.push("Snapshot saved. This calculation can be reproduced from the stored rules and FX."),
              )
            }
          >
            Save snapshot
          </Button>
          <ConfirmButton
            title={`Delete ${row.label}?`}
            body="This removes the offer. Saved snapshots keep their copied inputs."
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              await api(`/api/offers/${row.id}`, { method: "DELETE" });
              await client.invalidateQueries({ queryKey: ["offers"] });
              navigate("/offers");
            }}
          >
            <Button variant="destructive">Delete</Button>
          </ConfirmButton>
        </div>
      </div>
      {preview.data?.fx ? (
        <p className="text-sm text-zinc-500">
          Rate used: 1 {preview.data.fx.currency} = {preview.data.fx.rate_to_ron} RON ({preview.data.fx.source}
          {preview.data.fx.date ? `, ${preview.data.fx.date}` : ""})
        </p>
      ) : null}
      {preview.isError ? <p className="text-sm text-red-600">{(preview.error as Error).message}</p> : null}
      <div className="grid gap-3">
        {preview.data?.regimes.map((regime) => (
          <RegimeCard key={regime.regime} regime={regime} />
        ))}
      </div>
    </div>
  );
}
