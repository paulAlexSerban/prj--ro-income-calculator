ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE raise_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE inflation_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_own ON user_settings
  FOR ALL TO app_user
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  );

CREATE POLICY offers_own ON offers
  FOR ALL TO app_user
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  );

CREATE POLICY scenarios_own ON scenarios
  FOR ALL TO app_user
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  );

CREATE POLICY timelines_own ON timelines
  FOR ALL TO app_user
  USING (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.user_id', true) <> ''
    AND user_id = current_setting('app.user_id', true)::uuid
  );

CREATE POLICY timeline_tracks_own ON timeline_tracks
  FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM timelines t
      WHERE t.id = timeline_tracks.timeline_id
        AND t.user_id = current_setting('app.user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timelines t
      WHERE t.id = timeline_tracks.timeline_id
        AND t.user_id = current_setting('app.user_id', true)::uuid
    )
  );

CREATE POLICY raise_events_own ON raise_events
  FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1
      FROM timeline_tracks tr
      JOIN timelines t ON t.id = tr.timeline_id
      WHERE tr.id = raise_events.track_id
        AND t.user_id = current_setting('app.user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM timeline_tracks tr
      JOIN timelines t ON t.id = tr.timeline_id
      WHERE tr.id = raise_events.track_id
        AND t.user_id = current_setting('app.user_id', true)::uuid
    )
  );

CREATE POLICY timeline_runs_own ON timeline_runs
  FOR ALL TO app_user
  USING (
    EXISTS (
      SELECT 1
      FROM timeline_tracks tr
      JOIN timelines t ON t.id = tr.timeline_id
      WHERE tr.id = timeline_runs.track_id
        AND t.user_id = current_setting('app.user_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM timeline_tracks tr
      JOIN timelines t ON t.id = tr.timeline_id
      WHERE tr.id = timeline_runs.track_id
        AND t.user_id = current_setting('app.user_id', true)::uuid
    )
  );

CREATE POLICY tax_rules_all ON tax_rules
  FOR ALL TO app_user
  USING (true)
  WITH CHECK (true);

CREATE POLICY fx_rates_all ON fx_rates
  FOR ALL TO app_user
  USING (true)
  WITH CHECK (true);

CREATE POLICY inflation_all ON inflation_assumptions
  FOR ALL TO app_user
  USING (true)
  WITH CHECK (true);
