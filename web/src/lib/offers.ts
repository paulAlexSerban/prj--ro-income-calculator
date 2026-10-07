import {
  assumptionsSchema,
  b2bSchema,
  extrasSchema,
  type OfferInput,
} from "@offer-compare/engine";

export type OfferRecord = OfferInput & { id: string };

export function blankOffer(partial?: Partial<OfferInput>): OfferInput {
  return {
    label: "New offer",
    contract_type: "EMPLOYMENT",
    amount: 10000,
    rate_type: "MONTHLY_GROSS",
    currency: "RON",
    status: "idea",
    is_current: false,
    notes: "",
    assumptions: assumptionsSchema.parse({}),
    extras: extrasSchema.parse({}),
    b2b: b2bSchema.parse({}),
    fx_override: null,
    ...partial,
  };
}

export function asOfferInput(row: OfferRecord): OfferInput {
  return blankOffer({
    label: row.label,
    contract_type: row.contract_type,
    amount: Number(row.amount),
    rate_type: row.rate_type,
    currency: row.currency,
    status: row.status,
    is_current: row.is_current,
    notes: row.notes ?? "",
    assumptions: assumptionsSchema.parse(row.assumptions ?? {}),
    extras: extrasSchema.parse(row.extras ?? {}),
    b2b: b2bSchema.parse(row.b2b ?? {}),
    fx_override: row.fx_override ?? null,
  });
}
