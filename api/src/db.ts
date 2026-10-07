import { Kysely, PostgresDialect, sql, type RawBuilder, type Transaction } from "kysely";
import pg from "pg";
import { config } from "./config.js";

pg.types.setTypeParser(1700, (value) => Number(value));
pg.types.setTypeParser(1082, (value) => value);

export type JsonValue = unknown;

export interface UsersTable {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface RefreshTokensTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface UserSettingsTable {
  user_id: string;
  display_currency: "RON" | "EUR" | "USD";
  hours_per_day: number;
  working_days_per_month: number;
  billable_days_per_year: number;
  fx_override: JsonValue | null;
  fx_drift_percent: number;
  inflation_rate_percent: number;
  created_at: Date;
  updated_at: Date;
}

export interface OffersTable {
  id: string;
  user_id: string;
  label: string;
  contract_type: "EMPLOYMENT" | "B2B";
  amount: number;
  rate_type: "HOURLY_GROSS" | "DAILY_GROSS" | "MONTHLY_GROSS" | "MONTHLY_NET";
  currency: "RON" | "EUR" | "USD";
  assumptions: JsonValue;
  extras: JsonValue;
  b2b: JsonValue;
  fx_override: JsonValue | null;
  status: "idea" | "interviewing" | "offer" | "rejected" | "current";
  is_current: boolean;
  notes: string;
  created_at: Date;
  updated_at: Date;
}

export interface TaxRulesTable {
  id: string;
  tax_year: number;
  effective_from: string;
  key: string;
  value: JsonValue;
  note: string;
  verified: boolean;
}

export interface FxRatesTable {
  date: string;
  currency: "EUR" | "USD";
  rate_to_ron: number;
  source: string;
}

export interface ScenariosTable {
  id: string;
  user_id: string;
  offer_id: string | null;
  regime: string;
  inputs: JsonValue;
  result: JsonValue;
  rules_snapshot: JsonValue;
  fx_snapshot: JsonValue;
  created_at: Date;
}

export interface TimelinesTable {
  id: string;
  user_id: string;
  label: string;
  start_date: string;
  horizon_months: number;
  notes: string;
  fx_drift_percent: number;
  use_inflation: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TimelineTracksTable {
  id: string;
  timeline_id: string;
  label: string;
  base_offer_id: string | null;
  regime: string;
  color: string;
  adjustments: JsonValue;
  position: number;
}

export interface RaiseEventsTable {
  id: string;
  track_id: string;
  effective_month_index: number;
  kind: "percent" | "flat";
  base: "gross" | "net";
  value: number;
  new_rate_type: string | null;
  new_currency: string | null;
  contract_type_change: string | null;
  compounding: boolean;
  note: string;
}

export interface TimelineRunsTable {
  id: string;
  track_id: string;
  computed_at: Date;
  monthly_series: JsonValue;
  aggregates: JsonValue;
  inputs_hash: string;
}

export interface InflationTable {
  id: string;
  year: number;
  annual_rate_percent: number;
  note: string;
}

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  user_settings: UserSettingsTable;
  offers: OffersTable;
  tax_rules: TaxRulesTable;
  fx_rates: FxRatesTable;
  scenarios: ScenariosTable;
  timelines: TimelinesTable;
  timeline_tracks: TimelineTracksTable;
  raise_events: RaiseEventsTable;
  timeline_runs: TimelineRunsTable;
  inflation_assumptions: InflationTable;
}

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export function jsonb<T>(value: T): RawBuilder<T> {
  return sql`${JSON.stringify(value ?? null)}::jsonb`;
}

export async function withRls<T>(
  userId: string,
  fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.user_id', ${userId}, true)`.execute(trx);
    return fn(trx);
  });
}
