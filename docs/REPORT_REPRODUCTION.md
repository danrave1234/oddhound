# Report reproduction

Runs may now carry an optional 10-4000 character `report` inside the existing hashed run contract. The agent receives it in a neutralised untrusted-data fence and is asked to try it first without limiting broader exploration. A `report_candidate` can mark itself as accounting for the report with the optional boolean `report_match`.

The worker, not the model, produces the durable `report.verdict` event. A report is `reproduced` only when a matching in-memory candidate is linked to a saved `verified` / `verified_issue` finding. When several qualify, the highest-impact and then earliest candidate wins. All other reported runs receive canonical not-reproduced text plus durable action, page and candidate counts from that run. Runs that end before verification receive distinct factual text.

## Tests and results

- Focused unit and PostgreSQL integration tests: 2 files, 12 tests passed. The integration tests exercise exactly-one event persistence for a reported run that ends before verification and no event for a contract without a report.
- Full unit suite: 23 files, 218 tests passed.
- TypeScript reached one existing error outside this slice: `apps/web/lib/run-history.ts` cannot resolve the installed `pg` declaration. No changed file produced a type error.

The integration test uses local PostgreSQL and no model request. No Meta, Baseten or Fireworks call was made. The pre-verification integration path does not provision Chromium.

## Limits

`report_match` is a model-supplied linkage claim, so it is never a verdict by itself; independent replay and the trusted saved-finding status remain mandatory. "Not reproduced" means only within the tested scope. This core slice adds no UI and no database migration.
