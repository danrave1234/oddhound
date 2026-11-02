# Broader exploration implementation verification — October 30, 2026

This implements the owner brief in [EXPLORATION_AND_PREVIEW_REQUIREMENTS.md](EXPLORATION_AND_PREVIEW_REQUIREMENTS.md). It changes the `claude` workspace only. The existing interface and real Meta adapter remain. This document records component evidence; the real-site comparison is recorded separately in [STUDYBOOST_EVALUATION.md](STUDYBOOST_EVALUATION.md).

## What changed

- `agent/frontier.ts`, `execute-run.ts`, `session.ts`, `tools.ts`, `prompt.ts` and browser observation maintain discovery outside model narrative, including header/sidebar/menu controls, redirects, actual popups, hidden links, query states and discoveries after login. Compaction preserves the backlog. Visits, exercised controls and explicit outcome checks remain distinct.
- Premature finishing cannot discard pending navigation or open charters. Repeated finishing without progress triggers real queued exploration; a planner that still cannot progress stops with explicit gaps. This is not a successful-completion escape or an action/turn limit.
- Automatic defect candidates no longer disappear after the tenth signal. Each distinct replayable signal is retained; the existing deadline and incomplete-verification reporting remain in force.
- Pagination stays in the backlog. Opaque record IDs and recurring date/search/cursor variants are sampled explicitly; sampling never claims their siblings were tested. An actually visited sampled record is promoted into the recorded inventory. A later blocked disposition does not erase a real visit.
- Trail expansion, complete grouped states, filters and paginated Activity/action history remove the former display cutoffs. [UI evidence](TRAIL_HISTORY_VERIFICATION.md).
- Per-run model allowance is saved at admission. Existing runs retain their $2 cap; newly admitted current-source runs can use the owner's approved maximum of $10, constrained by the unchanged $7 public daily/$50 lifetime ledgers. UI and model instructions use actual available allowance. Every call/retry still reserves atomically; account mismatches and exhausted admission are refused.
- Owner preview has a separate bounded, private capture/storage/API path. Model screenshots remain withheld after supplied credentials or session secrets. Factual `preview.state` events record availability/pauses without pixels or page content. [Privacy review and its limits](PREVIEW_INTEGRATION_REVIEW.md).
- Replay waits for delayed login form hydration. Gateway-native transport failures are distinguished from genuine target 502 responses, including spoofed attribution headers. [Reliability evidence](REPLAY_GATEWAY_RELIABILITY.md).
- `run.timings` records measured model, retry-wait, browser, observation and verification time. The explicit StudyBoost harness records discovery, control coverage, plans, scenario results, preview metadata and normal spend/cleanup evidence.

## Component evidence so far

- Budget ledger: **15/15** real PostgreSQL tests, including concurrent reservations, unknown spend, old-run caps, shared daily/lifetime ceilings, account mismatch and kill-switch behavior.
- Navigation fixture: **4/4** with 88 chained routes, delayed nested navigation, later/query/redirect discovery and refused premature finishing. A visited form remains unsubmitted and outcome-unchecked. The browser and database are real; provider decisions are a zero-price test double.
- Pagination fixture: all **102 actual destinations** reached, 101 navigation actions, three refused premature finishes and no remaining route backlog. No outcome check is falsely credited to a visit. Focused coverage/continuity/authentication/pagination tests passed **13/13**; the later extended pagination unit file passed **5/5**.
- Detector continuation: **1/1** real-worker regression independently replayed and verified twelve distinct HTTP-500 failures, including the two previously dropped after the tenth candidate. Browser sandbox was `sandbox_on` and cleanup was confirmed. [Saved output](evidence/discovery-signals-2026-10-30-tests.txt). The local error endpoints and provider decisions are synthetic.
- Trail: **29/29 UI/API checks** and **12/12 units**. The root agent independently expanded the UI and selected saved state 650 through the browser. [Actual screenshot](evidence/trail-expanded-state650-cua.png). These records are explicitly synthetic, not a StudyBoost run.
- Extended gateway: **58/58 local checks** and **6/6 Modal preflight checks** for image `im-VFVycsDf9x78A5ZYAg47E0`, actual `sandbox_on`, confirmed cleanup. No Meta or StudyBoost traffic was part of those checks.

The initial full regression run timed out on a scripted planner that repeatedly requested completion. Its failure log is preserved. A subsequent subset recorded **239 passed / 1 failed**: the failing 102-page test exposed pagination being mistaken for duplicate records, plus stale event expectations. These failures led to production fixes and updated assertions; they are not represented as successful full-suite runs.

## Preserved failed complete regression run

The complete suite was split across three isolated test databases with the same frozen source. Across
**36 files and 279 tests, 278 passed and one failed**. This is a failed complete-suite result, not a
release or real-site clearance.

| Shard | Files | Tests | Duration | Saved output |
|---|---:|---|---:|---|
| Core | 31 | 274 passed | 196.78 s | [Core log](evidence/exploration-complete-core-2026-10-30.txt) |
| Breadth | 3 | 3 passed | 199.15 s | [Breadth log](evidence/exploration-complete-breadth-2026-10-30.txt) |
| Behavioral families and batch runner | 2 | 1 passed, 1 failed | 142.51 s | [Families log](evidence/exploration-complete-families-2026-10-30.txt) |

The [before](evidence/exploration-suite-source-before-2026-10-30.json) and
[after](evidence/exploration-suite-source-after-2026-10-30.json) manifests contain the same 94 source
files and identical combined SHA-256 digest:
`28f1e8e8fd0fd3b01a8b5b2a62d002c26ed7e4901f32e2556010bfdde7b5bc3a`.
The run used Node 26.12.1 and Vitest 5.0.5. These shard durations are test-run wall times; they are not
model/browser/verification timing measurements for StudyBoost.

The failing behavioral-family test received an extra `B6` verified issue. The retained
[attribution evidence](evidence/exploration-families-404-attribution-2026-10-30.txt) identifies actor B's
desktop navigation to `/bookings/1/edit`, where the fixture's expected 404 was incorrectly promoted
into a broken-page finding. The failure and its diagnosis remain preserved. Actor, device and
authentication provenance were corrected before the subsequent complete-suite rerun below.

## Final complete regression after the provenance correction

The rerun passed **281/281 tests across 36 files**, again using three isolated test databases.

| Shard | Files | Tests passed | Duration | Saved output |
|---|---:|---:|---:|---|
| Core | 31 | 276 | 200.55 s | [Core log](evidence/exploration-complete-core-actor-fix-2026-10-30.txt) |
| Breadth | 3 | 3 | 202.70 s | [Breadth log](evidence/exploration-complete-breadth-actor-fix-2026-10-30.txt) |
| Behavioral families and batch runner | 2 | 2 | 165.49 s | [Families log](evidence/exploration-complete-families-actor-fix-2026-10-30.txt) |

The new [before](evidence/exploration-suite-source-before-actor-fix-2026-10-30.json) and
[after](evidence/exploration-suite-source-after-actor-fix-2026-10-30.json) manifests match across all
94 source files, with digest
`82e1179f35d210af48ad722ad3a5f9505464fbf1802a477a8a29bc21ae5af03f`.
Root TypeScript, icon lint and diff checks passed. The first web-build invocation failed because
`DATABASE_URL` was absent ([preserved invocation failure](evidence/exploration-web-actor-fix-build-2026-10-30.txt));
the build passed with the local database and a build-only authentication secret configured
([configured build output](evidence/exploration-web-actor-fix-build-configured-2026-10-30.txt)).

The broader real StudyBoost run `aeb4dd1d-c239-4e24-81cc-7712857cd38d` used gateway image
`im-VFVycsDf9x78A5ZYAg47E0` and controller image `im-Zdhsl9FKWU8qE9spRmz5hm`. It was deliberately
**stopped**, not completed, after the operator confirmed that repeated controls were starving other
discovered work. Its [saved result](evidence/studyboost-run-broad-2026-10-30-aeb4dd1d-c239-4e24-81cc-7712857cd38d.json)
records 67 actions, 27 real Meta calls, $0.450706 settled spend and 598.993 seconds elapsed. Eight
graph paths were reached; 53 discovered routes and 109 controls remained pending. There were no
verified findings or completed scenario verifications. Two control outcomes were checked; the separate
frontier inventory marked three entries checked. These measures are not interchangeable.

The browser was confirmed `terminated`, its sandbox verdict was `sandbox_on`, and no model
reservation remained outstanding. A sanitized, immutable local recording preserves all 48 states,
67 actions, 60 transitions and 415 events for read-only review in the expanded Trail. It explicitly
labels this evaluation partial and stopped. Scheduler corrections and another real evaluation are
pending. Existing focused StudyBoost runs remain historical baselines; no complete functional pass
or controlled performance improvement is established by this partial run.

## Boundaries

No deployment or default browser runtime change is established by these component tests. The broader real-site evaluation must explicitly select the tested gateway image. Its TLS interception and disabled sockets remain declared limitations; original-certificate and socket workflows are not tested. Complete public deployment/containment and applicable SELF gates remain open under B03/B04/B09/B18/B19/B24 and the owning readiness documents.

The scoped test credentials, Meta access and Modal access are available. Local fixtures, recorded/scripted provider decisions and the large UI dataset are synthetic. Real-site evaluation uses the actual provider and synthetic account, with email verification prepared by the owner's explicit authorization; email delivery is not tested. No screenshot privacy, whole-site coverage, performance improvement or submission-readiness claim should be inferred beyond the saved checks.
