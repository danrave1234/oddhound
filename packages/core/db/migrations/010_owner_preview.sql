-- One bounded, private frame per run. Separate from model/evidence artifacts and public demo replay.
CREATE TABLE IF NOT EXISTS run_owner_previews (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  seq bigint NOT NULL DEFAULT 0,
  state text NOT NULL,
  reason text,
  frame bytea CHECK (octet_length(frame) <= 2097152),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
