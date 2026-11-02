-- Existing runs retain the allowance under which they were admitted. New admission writes
-- the current owner-approved maximum explicitly; old workers remain on the historical cap.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS model_spend_cap_micros bigint NOT NULL DEFAULT 2000000
  CHECK (model_spend_cap_micros > 0);
