CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);

CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_currency text NOT NULL DEFAULT 'RON' CHECK (display_currency IN ('RON', 'EUR', 'USD')),
  hours_per_day numeric NOT NULL DEFAULT 8,
  working_days_per_month numeric NOT NULL DEFAULT 21,
  billable_days_per_year numeric NOT NULL DEFAULT 220,
  fx_override jsonb,
  fx_drift_percent numeric NOT NULL DEFAULT 0,
  inflation_rate_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label text NOT NULL,
  contract_type text NOT NULL CHECK (contract_type IN ('EMPLOYMENT', 'B2B')),
  amount numeric NOT NULL,
  rate_type text NOT NULL CHECK (rate_type IN ('HOURLY_GROSS', 'DAILY_GROSS', 'MONTHLY_GROSS', 'MONTHLY_NET')),
  currency text NOT NULL CHECK (currency IN ('RON', 'EUR', 'USD')),
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  b2b jsonb NOT NULL DEFAULT '{}'::jsonb,
  fx_override jsonb,
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'interviewing', 'offer', 'rejected', 'current')),
  is_current boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX offers_user_id_idx ON offers (user_id);
CREATE UNIQUE INDEX offers_one_current_idx ON offers (user_id) WHERE is_current;

CREATE TABLE tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year integer NOT NULL,
  effective_from date NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  note text NOT NULL DEFAULT '',
  verified boolean NOT NULL DEFAULT false,
  UNIQUE (key, effective_from)
);

CREATE INDEX tax_rules_key_effective_idx ON tax_rules (key, effective_from DESC);

CREATE TABLE fx_rates (
  date date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('EUR', 'USD')),
  rate_to_ron numeric NOT NULL,
  source text NOT NULL,
  PRIMARY KEY (date, currency)
);

CREATE TABLE scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  offer_id uuid REFERENCES offers (id) ON DELETE SET NULL,
  regime text NOT NULL,
  inputs jsonb NOT NULL,
  result jsonb NOT NULL,
  rules_snapshot jsonb NOT NULL,
  fx_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scenarios_user_id_idx ON scenarios (user_id);

CREATE TABLE timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  horizon_months integer NOT NULL CHECK (horizon_months > 0 AND horizon_months <= 600),
  notes text NOT NULL DEFAULT '',
  fx_drift_percent numeric NOT NULL DEFAULT 0,
  use_inflation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX timelines_user_id_idx ON timelines (user_id);

CREATE TABLE timeline_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES timelines (id) ON DELETE CASCADE,
  label text NOT NULL,
  base_offer_id uuid REFERENCES offers (id) ON DELETE SET NULL,
  regime text NOT NULL DEFAULT 'best',
  color text NOT NULL DEFAULT '#0f766e',
  adjustments jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0
);

CREATE INDEX timeline_tracks_timeline_id_idx ON timeline_tracks (timeline_id);

CREATE TABLE raise_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES timeline_tracks (id) ON DELETE CASCADE,
  effective_month_index integer NOT NULL CHECK (effective_month_index >= 0),
  kind text NOT NULL CHECK (kind IN ('percent', 'flat')),
  base text NOT NULL DEFAULT 'gross' CHECK (base IN ('gross', 'net')),
  value numeric NOT NULL,
  new_rate_type text CHECK (new_rate_type IN ('HOURLY_GROSS', 'DAILY_GROSS', 'MONTHLY_GROSS', 'MONTHLY_NET')),
  new_currency text CHECK (new_currency IN ('RON', 'EUR', 'USD')),
  contract_type_change text CHECK (contract_type_change IN ('EMPLOYMENT', 'B2B')),
  compounding boolean NOT NULL DEFAULT true,
  note text NOT NULL DEFAULT ''
);

CREATE INDEX raise_events_track_id_idx ON raise_events (track_id, effective_month_index);

CREATE TABLE timeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES timeline_tracks (id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  monthly_series jsonb NOT NULL,
  aggregates jsonb NOT NULL,
  inputs_hash text NOT NULL
);

CREATE INDEX timeline_runs_track_hash_idx ON timeline_runs (track_id, inputs_hash, computed_at DESC);

CREATE TABLE inflation_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL UNIQUE,
  annual_rate_percent numeric NOT NULL,
  note text NOT NULL DEFAULT ''
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER offers_updated_at BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER timelines_updated_at BEFORE UPDATE ON timelines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
