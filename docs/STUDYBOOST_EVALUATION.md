# StudyBoost evaluation — 2026-10-30

The owner requested an actual Oddhound run against `https://preview.studyboost.com`, from the `claude` workspace, using a newly created test account. Only that workspace is being changed.

## Prepared scope

The synthetic student account was created through the site's browser UI and onboarded. At the owner's explicit request, its `email_verified` and `is_verified` flags were updated in the distinct preview database. The update matched only that account's ID and email; it did not change its role or plan. Email delivery is not tested. [Setup evidence](evidence/studyboost-account-setup.json).

Both the UI origin and `https://preview.api.studyboost.com` passed fresh, independent DNS ownership checks. The evaluation rechecks them before admission. [Initial cloud inspection](evidence/studyboost-inspect-2026-10-30.json).

The focused run covers supplied-account login, shelves, tasks, notes, persistence after reload, required-field validation, phone layout and logout/login. It excludes payments, uploads, AI generation, invitations, messaging and account security changes. Endpoint denies enforce those exclusions for the known preview route surface. The model receives goals and credential references, not a click script or inspected target defects.

## Implementation

- Supplied-account references now reach the planner and can be used in recorded login recipes and independent replay. Passwords are limited to password inputs and known secret strings are redacted. Account screenshots are withheld. [Details and tests](SUPPLIED_ACCOUNT_VERIFICATION.md).
- The old route-only boundary failed redirect/frame/socket checks. Its failures remain saved. [Evidence](ACTION_SCOPE_VERIFICATION.md).
- A separate, explicitly selected gateway image enforces frozen run scope, public-address egress, resource-only authority, quotas and expiry. It intercepts TLS and blocks sockets; neither original-certificate behavior nor socket workflows can be judged by this profile. The default deployed browser image is unchanged.
- Gateway-generated refusals are treated as instrumentation limits rather than site defects.
- `tests/e2e/studyboost-evaluation.ts` invokes Oddhound's real admission, ledger, Meta adapter, browser and verification pipeline. `infra/modal/studyboost_evaluation.py` runs that source in a temporary controller with the existing trusted worker Secret. The isolated browser receives no platform Secret.

The run uses the public spend ledger and the normal $2 model cap, request/action pacing and 60-minute backstop. It does not consume the judging reserve. There is no scripted model in the live evaluation.

## Current evidence

- Original local suite: 186/186 passed. A later run during concurrent editing recorded 193 passing and two failing tests; that failure evidence is retained. Fresh focused account/attribution tests passed 21/21. These are component tests, not the real-site result.
- Fresh full suite before the later SPA login fix: **24 files / 208 tests passed** in 225.69 seconds on Node 26.12.1 and Vitest 5.0.5, against the isolated local `oddhound_test` database. Root TypeScript check passed. The SPA fix has the additional focused verification reported below. [Full test output](evidence/studyboost-2026-10-30-final-tests.txt), [typecheck result](evidence/studyboost-2026-10-30-final-typecheck.txt).
- Original route-boundary canary: five passed, four failed, real Chromium with `sandbox_on`.
- Initial gateway TLS attempts did not reach browser startup. They exposed lab control-network plumbing and a generated nftables syntax error. No StudyBoost traffic or Meta calls occurred in those attempts.
- Corrected local gateway TLS canary: **51/51 passed**, real Chromium with `sandbox_on`. This covers permitted primary/API writes, all 25 two-hop redirect combinations, 12 queued concurrent assets, and denied off-origin redirects, body forwarding, resource-frame writes, worker writes, sockets and invalid upstream certificates. Denials require matching nonce-bearing gateway decisions and no forbidden destination arrival; socket and certificate listeners have positive controls. Both containers and both lab networks were confirmed removed. This is local synthetic-target evidence, not deployed isolation or a StudyBoost result. [Saved report](evidence/gateway-evaluation-tls-canary.json), [gateway log](evidence/gateway-evaluation-tls-canary.log).
- The first Modal gateway preflight similarly failed before browser readiness; independent lookup confirmed no running sandbox with its run tag.

## First actual run

[Run 71bde0c6](https://danravekeh123--oddhound-web.us-east.modal.run/runs/71bde0c6-f031-4c6f-bcfe-c87bc7cd9676) completed with **94 browser actions, 88 real Meta calls and $0.898574 settled model spend**, with no outstanding reservations. The UI reports 8 minutes 48 seconds. Chromium was `sandbox_on`; sandbox `sb-01M64EM6N9XHBHNA9D477VMH9N` was destroyed and confirmed terminated. [Saved run output](evidence/studyboost-run-2026-10-30-71bde0c6-f031-4c6f-bcfe-c87bc7cd9676.json).

The recorded actions covered login, task creation/edit/completion, notes, reload checks, blank-input checks, harmless markup displayed as text, mobile checks, logout protection and login again. The model reported those checks passed. A separate [preview database snapshot](evidence/studyboost-fixtures-first-run.json) confirms two persisted tasks (one completed) and additional notes in the exact synthetic account. It is an in-progress snapshot, not an inventory of all final writes. No new shelf existed at that snapshot; this first run does not prove shelf creation.

There were **no functional defect candidates**. One low-impact configuration observation reported a missing Content-Security-Policy response header on four routes. This is an observed configuration fact, not proof of exploitable XSS. Seven of eight plan items completed; double submission was blocked by the run contract. AI tools, uploads, payment, cross-account isolation and email delivery were outside this test.

The run exposed an Oddhound recording defect: StudyBoost's asynchronous login completed after the click observation, so the login recipe and automatic Sign in workflow were absent even though browsing authenticated pages worked. That is fixed with bounded completion observation and replay waits. The new regression covers the exact `/login` click followed by `/my-room` navigation and preserves the original submit label. **27 focused tests and two existing registration/end-to-end regressions passed**; typecheck passed. A separate real follow-up verifies the correction; the first run's evidence is unchanged.

## Corrected follow-up

[Run e6727f64](https://danravekeh123--oddhound-web.us-east.modal.run/runs/e6727f64-c72e-4b91-a659-e09354cab14a) completed at 18:53:12 UTC with **107 browser actions, 87 real Meta calls and $0.495109 settled model spend**, no outstanding reservations, and all six plan items marked complete. The UI reports 11 minutes 13 seconds. The new login recipe and automatic Sign in workflow were recorded. Chromium was `sandbox_on`; sandbox `sb-01M64FG46G6HK01Q9ZN7C1WW05` was destroyed and confirmed terminated. [Immutable result](evidence/studyboost-run-auth-2026-10-30-e6727f64-c72e-4b91-a659-e09354cab14a.json).

The model observed the named account greeting, created `QA Shelf NEWTASK 7X9Z` with a task, checked persistence after reload, and exercised logout/login again. It also checked whitespace inputs, harmless markup and mobile layout. The [final read-only preview snapshot](evidence/studyboost-fixtures-second-run-final.json) independently confirms three shelves, five tasks and five note elements in the exact synthetic account, including the new shelf/task and the earlier completed task. These totals include the manual baseline and both runs; they are not all new second-run records.

The final report contains the missing-CSP configuration observation and one **needs_review / inconclusive** signal: HTTP 502 while loading `/_next/static/chunks/3-rdey8b3qg1a.js`. Its independent replay stopped at `field not found: Email or Username`; the error was not verified or disproved. Immediate login-field lookup after DOMContentLoaded can race hydration, while an asset failure can also prevent that form from loading. The available evidence does not distinguish these causes. Gateway-generated upstream errors may also lack the explicit refusal marker, so this 502 cannot confidently be attributed to StudyBoost rather than the gateway/network. These are remaining replay/attribution limitations, not confirmed target defects.

Across both actual runs: **201 actions, 175 Meta calls, $1.393683 settled model spend**. Cloud compute is separate. Both browsers were confirmed terminated. There are zero verified functional defects in this tested scope, one repeated configuration observation and one unresolved signal.

The browser ran remotely on Modal. The owner report requires Oddhound sign-in and was opened in the owner's Edge browser after normal GitHub sign-in. Signed-in browser screenshots were withheld by the credential protection profile, so Activity provides the actual action trail. The controller's request/byte values of zero are pre-existing placeholders and must not be interpreted as measured traffic; the first run's 95 and second run's 86 denied events are real boundary events, including blocked browser telemetry and resource failures.

This evaluation used an explicitly selected current-source controller and separate gateway image; it did not update the public application's default runtime. No general public-launch or submission-readiness claim follows from this single site's focused test. The complete B03/B04/B09/B18/B19/B24 and SELF gates remain subject to their owning proof documents.

Versions: [VERSIONS.md](VERSIONS.md). Credentials and access for the scoped evaluation are available. The only database fixture setup was the explicitly authorized account verification. Synthetic local fixtures and scripted replies are used in component tests and are clearly distinguished from the real evaluation.

## Broader exploration attempt — stopped with substantial coverage remaining

[Run aeb4dd1d](https://danravekeh123--oddhound-web.us-east.modal.run/runs/aeb4dd1d-c239-4e24-81cc-7712857cd38d) ended **`stopped` / `user_stop`**, not `completed`. The operator used the normal stop path after confirming an Oddhound scheduling problem: repeated header/sidebar/menu controls kept taking priority over new route families. This is a partial exploration result, not an all-clear result for StudyBoost. The generic scheduling correction and another actual run were pending when this entry was written. [Immutable run output](evidence/studyboost-run-broad-2026-10-30-aeb4dd1d-c239-4e24-81cc-7712857cd38d.json).

The run lasted **598.993 seconds**, from 2026-10-29 20:21:29.221046 to 20:31:28.214387 UTC, with **67 browser actions, 27 real Direct Meta `muse-spark-1.3` Standard / low-reasoning calls and $0.450706 settled model spend**. Outstanding reservations were zero. No provider reply or target action was mocked. Unlike the earlier focused runs, this result records a $10 configured model ceiling; the daily public ledger remained the limiting allowance. It stopped before exhausting that allowance. Compute costs are separate.

The final graph contains **8 paths**: `/`, `/login`, `/my-room`, one existing QA shelf detail, `/study-room`, `/settings/account`, `/settings/notifications` and `/settings/usage`. The frontier retained **73 discovered destinations, 14 visited destinations, 53 pending routes and 109 pending controls**. The graph and frontier use different counting semantics; 14 frontier visits must not be presented as 14 independently checked pages. There were **2 coverage outcome checks and 3 checked frontier entries**, with **zero finished scenarios, zero verification phases and zero findings**. Those zeroes do not establish that the untested areas work.

The public course, institution and document list/detail families remained unvisited in the final graph, as did `/pricing`. The profile view was reached at its actual path, `/settings/account`; its API mutations remained excluded. `/settings/billing` and `/settings/security` were excluded as top-level navigation by the contract. Permitted background billing/subscription reads do not make billing navigation or payment/plan changes authorized. The [independent source inventory](STUDYBOOST_ROUTE_INVENTORY.md) distinguishes these exclusions, public route families, personal drawers sharing one pathname and legacy redirects. Its target-specific paths were not supplied to the worker/model.

The [final exact-account, read-only preview snapshot](evidence/studyboost-fixtures-broad-aeb4dd1d-c239-4e24-81cc-7712857cd38d-final.json) contains **3 shelves, 5 tasks, 0 structured notes, 2 note boards and 6 note elements**. The preceding snapshot had 5 note elements. These totals include earlier fixtures; the extra element is persisted-data evidence, not proof of a completed create/edit/reload workflow or an independently replayed assertion.

Protected owner preview telemetry ended `available` at **frame sequence 75**. All 30 recorded preview-state events reported model screenshots withheld. This is evidence of capture state and withholding metadata; no live owner-frame pixels or model-image payloads were inspected as part of this result, and no universal confidentiality claim follows.

The frozen controller used the 94-file source digest `82e1179f35d210af48ad722ad3a5f9505464fbf1802a477a8a29bc21ae5af03f`, controller image `im-Zdhsl9FKWU8qE9spRmz5hm` and opt-in gateway image `im-VFVycsDf9x78A5ZYAg47E0`. Runtime versions were Node **26.12.1**, Playwright **1.64.1**, Chromium **156.0.8078.4** and gateway mitmproxy **12.3.1**. Chromium reported **`sandbox_on`**. Fresh Modal sandbox `sb-01M64N6ABSANPMGNYD8Z4BSRNB` reached **`terminated`**; an [independent SDK poll](evidence/studyboost-cleanup-aeb4dd1d-c239-4e24-81cc-7712857cd38d.json) confirmed exit 137 after controller completion. The normal stop explains the harness's nonzero exit code; this was not successful run completion.

TLS interception, disabled sockets, contract exclusions and broader public-release/SELF limitations still apply. This attempt closes no additional Plan Audit blocker. The next evidence must demonstrate that generic scheduling reaches the neglected route families and performs meaningful outcome checks; it cannot reuse this stopped result as completion proof.


## November 2–3 terminal evaluation

Run `883c2266-0b91-4cc6-bb3b-fa4fd111cd80` ended **stopped**, reason `budget_time_reserved_for_verification`, at 2026-11-02 16:36:34.796226 UTC (November 3 00:36 PHT). Elapsed time was 3,484.661 seconds. The harness correctly returned exit 1 for a stopped run. This is partial testing, not completion or an all-clear.

**351 actions, 142 desktop states, 42 distinct graph paths, 2,128 saved events; 156 real Direct Meta calls, $1.055517 settled and $0 outstanding.** One sign-in workflow completed. Coverage instrumentation records 81 exercised controls and 7 outcome checks across 2,792 controls; frontier accounting separately records 85 visits and 6 checked entries. These metrics are different and must not be substituted for each other. The frontier retains 960 discovered destinations, 861 pending routes, 642 pending controls, 14 excluded entries and zero sampled variants.

| Requested area | Actual evidence | Remaining limit |
|---|---|---|
| Documents | Search/list and one document detail reached; detail has 2 exercised controls | No independent detail-workflow assertion |
| Courses | Directory and 9 distinct course records reached | Records share one feature family; few exercised controls |
| Institutions | Directory and Arizona State University detail reached | Detail has zero exercised controls; nested institution courses path not reached |
| Subscription | `/pricing` reached | Billing navigation and payment/plan mutations excluded |
| Settings/profile | Account, notifications, appearance and usage reached | Profile save candidate inconclusive; most settings have no exercised controls |
| Shelves | Two existing shelf records reached; task/note interaction recorded | Task persistence candidate inconclusive; third existing shelf still pending |
| Study tools | Multiple tool/game entry views reached | Paid generation/uploads excluded; entry visit is not tool success |
| Mobile | No mobile graph state recorded | Mobile coverage unproven |

Three claim-versus-truth checks failed and merged into **two review candidates**, for task title and profile Bio/Location persistence. Both lack an explicit rule; both independent replays stopped at authentication because the saved success text was not reached within five seconds. Their verification is **inconclusive**, not verified. The only verified record is a configuration observation: no CSP header on 42 HTML page routes. There are **zero independently verified functional issues** in this run. No target source fixes or manually repaired assertions were used.

The final read-only preview DB snapshot contains 3 shelves, 8 tasks, 0 structured notes, 2 boards and 11 note elements, compared with the earlier 3/5/0/2/6 totals. These include prior fixtures; a count difference does not prove each workflow. No production DB connection occurred. Browser destruction was independently confirmed by Modal SDK poll, exit 137.

Runtime: Direct Meta `muse-spark-1.3` Standard / reasoning low; Node 26.12.1; Playwright 1.64.1; Chromium 156.0.8078.4, **sandbox_on**; gateway mitmproxy 12.3.1. Controller `im-WPs0wRf7Aja15SGWQESEMk`, opt-in gateway `im-VFVycsDf9x78A5ZYAg47E0`. No fallback or mocked target/model activity. The $10 configured cap remained constrained by the $7 daily / $50 lifetime public ledger. Exported shared remaining allowance was $5.944483. The deployed default runtime was not changed; this evaluation does not clear Fly/public SELF gates or close additional Plan Audit blockers.

Evidence: [immutable terminal output](evidence/studyboost-run-broad-2026-11-02-883c2266-0b91-4cc6-bb3b-fa4fd111cd80.json), [coverage audit](evidence/studyboost-coverage-audit-883c2266-0b91-4cc6-bb3b-fa4fd111cd80.json), [independent cleanup](evidence/studyboost-cleanup-883c2266-0b91-4cc6-bb3b-fa4fd111cd80.json), [target snapshot](evidence/studyboost-fixtures-broad-883c2266-0b91-4cc6-bb3b-fa4fd111cd80-final.json). The independent source inventory was not supplied to the worker/model. Real-site/deployed parity remains unasserted.
