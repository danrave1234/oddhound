-- Deploy hooks: one secret per project lets the owner's CI start a retest or a new run after a deploy
-- and read back a pass/fail verdict. Only a SHA-256 of the token is stored; the owner sees it once.
CREATE TABLE IF NOT EXISTS project_hooks (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- One run per deployed commit: CI retries for the same commit get the run already started for it.
CREATE TABLE IF NOT EXISTS hook_triggers (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sha text NOT NULL,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, sha)
);
