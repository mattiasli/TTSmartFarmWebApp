CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  environment text NOT NULL,
  controller_lock_key bigint NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  github_id text NOT NULL UNIQUE,
  username text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  disabled_at timestamptz
);

CREATE TABLE IF NOT EXISTS farm_memberships (
  farm_id uuid NOT NULL REFERENCES farms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
  PRIMARY KEY (farm_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  csrf_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS commands (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL REFERENCES farms(id),
  actor_scope text NOT NULL,
  idempotency_key text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,
  confirmation_mode text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  state_matched_at timestamptz,
  reason text,
  UNIQUE (farm_id, actor_scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL REFERENCES farms(id),
  category text NOT NULL,
  severity text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_farm_created_idx ON events (farm_id, created_at, id);

CREATE TABLE IF NOT EXISTS telemetry_samples (
  farm_id uuid NOT NULL REFERENCES farms(id),
  sampled_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (farm_id, sampled_at)
);

CREATE TABLE IF NOT EXISTS automation_configs (
  farm_id uuid PRIMARY KEY REFERENCES farms(id),
  revision integer NOT NULL,
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
