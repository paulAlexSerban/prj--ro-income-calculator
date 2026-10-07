import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CalculationResult } from "@offer-compare/engine";
import { RegimeCard } from "@/components/Breakdown";
import { Badge, Button, Card } from "@/components/ui";
import { OfferEditor } from "./OfferEditor";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { asOfferInput, blankOffer, type OfferRecord } from "@/lib/offers";

export function OffersPage() {
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => api<OfferRecord[]>("/api/offers") });
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Offers</h1>
        <Button asChild>
          <Link to="/offers/new">Add offer</Link>
        </Button>
      </div>
      <div className="grid gap-2">
        {(offers.data ?? []).map((offer) => (
          <Link key={offer.id} to={`/offers/${offer.id}`} className="rounded-lg border border-zinc-200 p-3 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{offer.label}</span>
              <Badge>{offer.contract_type === "EMPLOYMENT" ? "CIM" : "B2B"}</Badge>
              <Badge>{offer.status}</Badge>
              {offer.is_current ? <Badge className="border-teal-700 text-teal-700">Current</Badge> : null}
            </div>
            <p className="num mt-1 text-sm text-zinc-500">
              {money(Number(offer.amount), offer.currency)} · {offer.rate_type}
            </p>
          </Link>
        ))}
        {offers.data?.length === 0 ? <p className="text-sm text-zinc-500">No offers yet. Add your current income first.</p> : null}
      </div>
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
                alert("Snapshot saved. Past calculations stay reproducible from this rules and FX snapshot."),
              )
            }
          >
            Save snapshot
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              void api(`/api/offers/${row.id}`, { method: "DELETE" }).then(() => navigate("/offers"))
            }
          >
            Delete
          </Button>
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
