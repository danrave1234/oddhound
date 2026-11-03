-- Read-only share links for owner-site runs. Only the token's SHA-256 is stored; one active link per run
-- (creating a new one replaces the old). A link also opens the run's retests.
CREATE TABLE IF NOT EXISTS run_shares (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
