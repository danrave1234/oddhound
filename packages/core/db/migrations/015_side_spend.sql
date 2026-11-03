-- Model calls outside a run (drafting a test plan from a site's public page). They count against the
-- same account ceilings and kill switch as runs; `purpose` says what they were for, and only 'run'
-- rows need a run.
ALTER TABLE spend_reservations ALTER COLUMN run_id DROP NOT NULL;
ALTER TABLE spend_reservations ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'run';
ALTER TABLE spend_reservations ADD COLUMN IF NOT EXISTS principal text;
DO $$ BEGIN
  ALTER TABLE spend_reservations ADD CONSTRAINT spend_run_required CHECK (purpose <> 'run' OR run_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS spend_principal_day ON spend_reservations(principal, day_bucket) WHERE principal IS NOT NULL;
