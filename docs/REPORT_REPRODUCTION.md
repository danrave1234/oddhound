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

## End-to-end run with real Meta inference (Nov 3, 2026, Claude)

`tests/e2e/report-run.ts` on the local demo target, report: *"my friend ... typed only spaces in the name box ... It went through and now there is a booking with no name on it in our list."* Raw result: [report-reproduction-meta-2026-11-02.json](evidence/report-reproduction-meta-2026-11-02.json) (UTC date).

- Run `6b8d83f1`: **completed**, Direct Meta `muse-spark-1.3-contributor` (synthetic demo data only), Chromium **sandbox_on**, browser **terminated**, 33 min 59 s, 660 actions, **$0.147517** settled model spend.
- Trusted verdict: **reproduced**, linked to the verified finding "Spaces-only guest name accepted for booking" (rule R2). 10 verified issues, 4 needs review, 2 configuration observations in the run overall.
- Retest `0eff609c` on the corrected build with unchanged assertions: 9 of 10 verified issues flipped to **fixed**; one invariant finding ("Total guests" sum) stayed **open** because its retest was **blocked** (setup could not identify the record it created on the corrected build), not because the bug persisted.
- Screenshots: [results with verdict](evidence/report-reproduced-results-2026-11-03.jpg), [landing proof chain](evidence/landing-proof-chain-fixed-2026-11-03.jpg), [landing course](evidence/landing-course-real-run-2026-11-03.jpg).

Limits of this run: it used the `host` browser runtime (Chromium on the developer machine, loopback fixtures) because the hardened reset rule requires the reset URL to share the target origin and the Docker lab network is not reachable from the Windows host. The host's antivirus injected a script into pages; Oddhound's policy blocked its writes (37 `scope.denied`, `write_to_unverified_origin`). The hosted Modal path has not yet run a reported job.
