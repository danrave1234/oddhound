-- Nov 3, 2026: owner-approved public daily ceiling of $25 for the hackathon week (was $7).
-- The $50 lifetime ceiling, the $10 per-run cap and the kill switch are unchanged.
UPDATE spend_accounts SET daily_limit_micros = 25000000 WHERE id = 'public' AND daily_limit_micros = 7000000;
