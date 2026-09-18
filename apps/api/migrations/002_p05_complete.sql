-- Completes the section 7 schema on top of 001_init.sql.
-- Idempotent so a second migrate is safe.

CREATE TABLE IF NOT EXISTS login_allowlist (
  github_id text PRIMARY KEY,
  farm_id uuid NOT NULL REFERENCES farms(id),
  role text NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS oauth_flows (
  id uuid PRIMARY KEY,
  state_hash text NOT NULL UNIQUE,
  browser_binding_hash text NOT NULL,
  pkce_verifier text NOT NULL,
  environment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS oauth_flows_expires_idx ON oauth_flows (expires_at);

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS idle_expires_at timestamptz;

UPDATE sessions
SET idle_expires_at = expires_at
WHERE idle_expires_at IS NULL;

ALTER TABLE sessions
  ALTER COLUMN idle_expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS ws_tickets (
  id uuid PRIMARY KEY,
  ticket_hash text NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id),
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ws_tickets_expires_idx ON ws_tickets (expires_at);

ALTER TABLE automation_configs
  ADD COLUMN IF NOT EXISTS editor_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;

ALTER TABLE automation_configs
  DROP CONSTRAINT IF EXISTS automation_configs_revision_check;
ALTER TABLE automation_configs
  ADD CONSTRAINT automation_configs_revision_check CHECK (revision >= 1);

CREATE TABLE IF NOT EXISTS automation_runtime (
  farm_id uuid PRIMARY KEY REFERENCES farms(id),
  runtime_revision integer NOT NULL DEFAULT 1 CHECK (runtime_revision >= 1),
  paused_reason text NOT NULL DEFAULT 'Paused — choose Start automations.',
  master_enabled boolean NOT NULL DEFAULT false,
  manual_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_pump_stop_at timestamptz,
  cooldown_until timestamptz,
  guard_target jsonb,
  guard_status text NOT NULL DEFAULT 'unknown'
    CHECK (guard_status IN ('unknown', 'pending', 'confirmed', 'failed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farm_preferences (
  farm_id uuid PRIMARY KEY REFERENCES farms(id),
  lcd_line1 text NOT NULL DEFAULT '',
  lcd_line2 text NOT NULL DEFAULT '',
  lcd_mode text NOT NULL DEFAULT 'status' CHECK (lcd_mode IN ('status', 'custom')),
  changed_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commands
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS connection_epoch text,
  ADD COLUMN IF NOT EXISTS receive_sequence integer,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES commands(id);

UPDATE commands
SET request_hash = md5(payload::text)
WHERE request_hash IS NULL;

ALTER TABLE commands
  ALTER COLUMN request_hash SET NOT NULL;

CREATE INDEX IF NOT EXISTS commands_farm_requested_idx ON commands (farm_id, requested_at DESC, id);
CREATE INDEX IF NOT EXISTS commands_pending_idx ON commands (farm_id, status)
  WHERE status IN ('accepted', 'publishing', 'sent');

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS actor_scope text,
  ADD COLUMN IF NOT EXISTS command_id uuid REFERENCES commands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS server_epoch text,
  ADD COLUMN IF NOT EXISTS server_sequence bigint;

CREATE INDEX IF NOT EXISTS telemetry_samples_farm_time_idx ON telemetry_samples (farm_id, sampled_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commands_status_check') THEN
    ALTER TABLE commands ADD CONSTRAINT commands_status_check
      CHECK (status IN (
        'accepted', 'publishing', 'sent', 'state_matched',
        'failed', 'uncertain', 'superseded', 'rejected'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commands_confirmation_check') THEN
    ALTER TABLE commands ADD CONSTRAINT commands_confirmation_check
      CHECK (confirmation_mode IN ('state_match', 'not_reported', 'pulse_observation'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commands_source_check') THEN
    ALTER TABLE commands ADD CONSTRAINT commands_source_check
      CHECK (source IN ('user', 'automation', 'system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commands_actor_scope_check') THEN
    ALTER TABLE commands ADD CONSTRAINT commands_actor_scope_check
      CHECK (actor_scope <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_severity_check') THEN
    ALTER TABLE events ADD CONSTRAINT events_severity_check
      CHECK (severity IN ('debug', 'info', 'warning', 'error'));
  END IF;
END $$;
