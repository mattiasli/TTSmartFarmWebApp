-- Daily global retention batches need timestamp-leading indexes.
-- Additive only: previous application releases remain schema-compatible.
CREATE INDEX IF NOT EXISTS telemetry_samples_retention_idx ON telemetry_samples (sampled_at);
CREATE INDEX IF NOT EXISTS events_retention_idx ON events (created_at);
CREATE INDEX IF NOT EXISTS commands_retention_idx ON commands (requested_at);

-- Batch boundaries can leave optional links to a command that reaches retention.
ALTER TABLE commands DROP CONSTRAINT IF EXISTS commands_superseded_by_fkey;
ALTER TABLE commands ADD CONSTRAINT commands_superseded_by_fkey
  FOREIGN KEY (superseded_by) REFERENCES commands(id) ON DELETE SET NULL;
