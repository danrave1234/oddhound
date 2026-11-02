# Paused at the owner's request — October 30, 2026 (PHT)

The owner said: “im going to sleep, continue tomorrow.” Work is paused. No overnight scan, paid run or deployment was scheduled. Resume when the owner returns.

## Scope and latest requirement

Work only in `C:\Users\Danrave\Desktop\Project\Oddhound\claude`; ignore `/chatgpt`. Preserve the other sidechat's changes and all existing evidence. The goal is to improve Oddhound's discovery, complete Trail/history, useful autonomous checks and private preview, then test `https://preview.studyboost.com` through Oddhound using the prepared synthetic account.

The owner explicitly called out course, institution, document detail, subscription, settings, profile and shelf pages. They correctly observed that the broad run had not reached important catalog pages. The fix must generalize across sites, not encode a StudyBoost click script.

## Current state: incomplete

- The earlier frozen source passed **281/281 tests across 36 files**, TypeScript, icon lint and a configured production web build. Its 94-file manifest digest is `82e1179f35d210af48ad722ad3a5f9505464fbf1802a477a8a29bc21ae5af03f`. This pass **does not cover the subsequent fairness patch**.
- The actual broad Meta run `aeb4dd1d-c239-4e24-81cc-7712857cd38d` was deliberately **stopped**, not completed. In 598.993 seconds it made 67 actions and 27 real calls, spent $0.450706, reached eight graph paths, and left 53 routes plus 109 navigation controls pending. Course, institution and document detail pages had not been reached. No functional all-clear is established.
- Cause: every page's repeated header/sidebar controls had priority 100, above observed links and sitemap/fallback paths. New pages created another set of those controls. The existing broad fixtures largely had empty leaf pages and did not expose this starvation.
- The run's browser `sb-01M64N6ABSANPMGNYD8Z4BSRNB` is **terminated**, `sandbox_on`; an independent Modal poll returned exit 137. Model reservations outstanding: zero.
- Private owner-preview metadata reached sequence 75, with model screenshots withheld. Actual protected owner pixels were not inspected by the model. A bounded private local frame remains under `.data/`; do not publish it or feed it to model/image tools.
- The public app still has its older UI/default runtime. No deployment or default-browser change occurred. The rejected route-only browser image must not be used for an evaluation.

## Saved but unverified work to do first

`packages/core/agent/frontier.ts` now has a generic fairness patch: less-visited structural prefixes, interleaving routes with new reveal controls, and lower priority for repeated shared controls. Per-page entries remain recorded; nothing is falsely marked checked.

New `tests/integration/exploration-fairness.test.ts` exercises repeated page chrome, independent sitemap branches, delayed same-label menus, onclick-only navigation, and refused denied/off-origin destinations. TypeScript passed after the two files were written; a later fixture HTML button-order adjustment was not rechecked. Test session 6834 was **cancelled on the pause request before a verdict**. Its exact process tree and Chromium children were stopped. Preserve `docs/evidence/exploration-fair-scheduling-2026-10-30-tests.txt` as cancelled evidence, not a pass.

Next steps:

1. Review the fairness patch independently and run the new fixture plus frontier tests in an isolated test database.
2. Fix any failures, then rerun relevant 88/102-page continuity, actor/session provenance and full regression tests. Keep before/after source hashes and actual results.
3. Inspect the remaining replay-count/history limit: terminal action counts already use the maximum observed action sequence, but playback uses a truncated event window. No action-count patch was started. Use authoritative data and preserve counts at the selected replay time.
4. Rerun the real broad StudyBoost evaluation after those checks. Audit real visits **and useful outcomes** against the owner's core areas. Do not tell the model the independent source inventory's paths merely to make the benchmark pass.
5. Reopen a clearly labelled recorded local review with the updated Trail; then update the evaluation/provider reports with actual results and gaps.

## Real-run configuration and safeguards

Prepared project: `20711898-fb35-44ae-8a06-c8d27951c9b9`; exact owner: `SOFDRITxFaXPsmEoQ7pMJG6IxOmxFTn7`. UI and API (`https://preview.api.studyboost.com`) have independently verified DNS proofs; the harness rechecks both. The test account is sealed in `.data/studyboost-account.sealed`. Never print its password, cookies, tokens or decrypted payload.

Use only the explicit tested gateway image `im-VFVycsDf9x78A5ZYAg47E0`. The stopped run's controller image was `im-Zdhsl9FKWU8qE9spRmz5hm`; the next invocation builds from current source. Gateway preflight: 58 local checks and six cloud checks passed. TLS interception and disabled sockets remain declared limitations; public deployment and applicable SELF/readiness gates remain open.

The normal command, **only after validation**, is:

```powershell
python -X utf8 -m modal run infra/modal/studyboost_evaluation.py --mode run-broad --gateway-image-id im-VFVycsDf9x78A5ZYAg47E0
```

This uses real Direct Meta `muse-spark-1.3`, Standard, reasoning low; Node 26.12.1 controller, Playwright 1.64.1, Chromium 156.0.8078.4, fresh Modal VM. Local regression provider decisions are scripted; do not confuse them with real inference.

The owner brief approves a maximum $10 per-run model allowance; the $7 public daily/$50 lifetime limits remain intact. Admission recorded $5.606317 available, and the post-stop snapshot recorded $5.155611. These are historical amounts: recheck normal admission rather than assuming tomorrow's available balance. Do not use judging reserve or bypass limits.

Current contract excludes paid AI generation/uploads, messages/invitations, payment/plan/security changes, profile API writes, registration and cancellation/deletion. Pricing views are permitted; `/settings/billing` remains excluded. Profile UI is `/settings/account`. The independent source inventory is an audit oracle, not deployment-parity proof or a grant for all workflows.

## Evidence and local review

- [Implementation and test evidence](EXPLORATION_IMPLEMENTATION_VERIFICATION.md)
- [Actual StudyBoost evaluations](STUDYBOOST_EVALUATION.md)
- [Provider smoke results](PROVIDER_SMOKE_TESTS.md)
- [Independent route inventory](STUDYBOOST_ROUTE_INVENTORY.md)
- [Stopped broad-run result](evidence/studyboost-run-broad-2026-10-30-aeb4dd1d-c239-4e24-81cc-7712857cd38d.json)
- [Independent cleanup confirmation](evidence/studyboost-cleanup-aeb4dd1d-c239-4e24-81cc-7712857cd38d.json)
- [Read-only target data snapshot](evidence/studyboost-fixtures-broad-aeb4dd1d-c239-4e24-81cc-7712857cd38d-final.json)

The target snapshot has three shelves, five tasks, two note boards and six note elements. It includes previous runs' fixtures; counts alone do not establish a passed workflow. Production target DB was not connected.

The sanitized recorded-review export under `.data/recorded-review/` preserves 48 states, 67 actions, 60 transitions, 415 events, one workflow and 27 spend records. Export SHA-256: `82ecd4037008f5f2c52f74318b9c390fd1026ada6b9430f4bd55b5939336ac5d`. Seventeen HTTP/auth/history checks and seven Chromium/UI checks passed on the actual partial recording, including expanded Trail, last-state inspection and all 415 Activity events. These prove report behavior, not website completeness.

Its server session 26490 was shut down cleanly. Ports 3312/3313 have no listeners; isolated database `oddhound_recording_f81803677ff8` and role `oh_review_f81803677ff8` were removed. The immutable export is preserved for tomorrow. All owned test/browser processes have been stopped. Existing unrelated desktop/browser/database services were left alone.

To reopen only the saved local recording (no cloud/target/inference traffic), from `claude`:

```powershell
.tools/node26/node.exe .data/recorded-run-review.mjs --snapshot .data/recorded-review/aeb4dd1d-c239-4e24-81cc-7712857cd38d.json
```

It requires local PostgreSQL on port 55433 and serves the read-only review on `http://127.0.0.1:3312`. Helpers are `.data/export-studyboost-recording.mjs`, `.data/studyboost-recording-export.py`, `.data/recorded-run-review.mjs` and `.data/check-recorded-viewer.mjs`.


## Resumed November 2; terminal checkpoint November 3

The owner resumed testing. This historical pause is superseded by [November testing results and remaining work](TESTING_2026-11-02.md). Actual run883c2266-0b91-4cc6-bb3b-fa4fd111cd80 stopped for verification time; cleanup independently confirmed. Do not restart a new paid scan merely to recover its report. Sanitized local viewer session42726 / port3312 displays the complete stopped recording; stop file `.data/oddhound_recording_7306171417dc.stop`. Video is planned next; authentication replay, mobile proof and outcome density remain gaps.
