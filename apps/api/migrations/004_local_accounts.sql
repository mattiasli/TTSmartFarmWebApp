ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;

CREATE TABLE local_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  login_id text NOT NULL UNIQUE CHECK (login_id ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_login_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX password_login_limits_expiry ON password_login_limits(expires_at);
