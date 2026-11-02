# Actual provider smoke tests — 2026-10-30

## StudyBoost focused account workflow

- Real target: `https://preview.studyboost.com`; independently verified API: `https://preview.api.studyboost.com`. Both DNS proofs were freshly rechecked before admission and execution.
- Run: `71bde0c6-f031-4c6f-bcfe-c87bc7cd9676`, **completed**.
- Provider: **Direct Meta**, `https://api.meta.ai/v1`; model **`muse-spark-1.3` Standard**, reasoning low. No fallback or scripted replies.
- Usage: **88 actual calls**, **$0.898574** settled model spend, **$0** outstanding reservation. Public ledger; normal $2 run cap. Cloud compute is separate from model spend.
- Browser: fresh Modal VM, token-authenticated control, gateway image `im-crpKoEFcOavFoxBLIAXNvH`, Playwright 1.64.1, Chromium 156.0.8078.4, **sandbox_on**. Confirmed destroyed after finalization.
- Controller: Node 26.12.1; existing base image `im-dx4vcuDc6FcLEiojApWRCv` with current `claude` source overlaid.
- Outcome: 94 browser actions over 8:48; tested login/tasks/notes/persistence/validation/mobile/logout. No functional defect candidates; one missing-CSP configuration observation. Async login recipe recording failed in this first run and was corrected afterward.
- Fixtures: actual newly created synthetic student account, owner-authorized email-verification flags prepared in the preview database. No model, target or successful action was mocked. Email delivery was not tested.
- Limitations: TLS intercepted; sockets disabled; supplied-account screenshots withheld; uploads/AI generation/payments/cross-account tests excluded. Default public runtime not changed. This is not complete submission or SELF clearance.

[Immutable result](evidence/studyboost-run-2026-10-30-71bde0c6-f031-4c6f-bcfe-c87bc7cd9676.json) · [Full evaluation report](STUDYBOOST_EVALUATION.md) · [Versions](VERSIONS.md)

## Corrected supplied-login follow-up

- Run `e6727f64-c72e-4b91-a659-e09354cab14a`: **completed**, 2026-10-29 18:41:59–18:53:12 UTC.
- Same real provider/model, gateway image and public ledger; **87 calls**, **$0.495109** settled, no outstanding reservations. No scripted model, no fallback.
- **107 browser actions**; recorded the supplied login recipe and Sign in workflow, created a new shelf/task, checked reload persistence and logout/login. Final target DB snapshot confirms those synthetic records.
- Chromium **sandbox_on**; fresh VM `sb-01M64FG46G6HK01Q9ZN7C1WW05` independently terminated by runtime finalization.
- Missing CSP observed again. A static JavaScript HTTP 502 remains **needs_review / inconclusive** because replay could not locate the login field. Origin/CDN versus gateway/network causation was not established. The report does not claim a verified functional defect or a successful replay of that signal.
- Combined actual calls: **175**, model spend **$1.393683**. Compute costs are separate. Test scope and release limitations above still apply.

[Immutable follow-up result](evidence/studyboost-run-auth-2026-10-30-e6727f64-c72e-4b91-a659-e09354cab14a.json) · [Final fixture snapshot](evidence/studyboost-fixtures-second-run-final.json)

## Broader StudyBoost attempt — operator stopped, incomplete

- Run `aeb4dd1d-c239-4e24-81cc-7712857cd38d`: **`stopped` / `user_stop`**, 2026-10-29 20:21:29.221046–20:31:28.214387 UTC (**598.993 seconds**). The operator stopped it normally to repair confirmed generic frontier starvation by repeated shell controls. It did not complete the requested broad exploration.
- Provider: **Direct Meta**, `https://api.meta.ai/v1`, **`muse-spark-1.3` Standard**, reasoning low; **27 real calls**, **$0.450706 settled**, **$0 outstanding**. No scripted replies or fallback. This run records a **$10 configured ceiling**, with the public daily ledger limiting available spend; it was not stopped for budget exhaustion. Compute costs are separate.
- Coverage: **67 actions, 8 graph paths, 73 discovered destinations, 14 frontier visits, 53 pending routes and 109 pending controls**. Only **2 coverage outcome checks / 3 checked frontier entries**; **0 finished scenarios, 0 verification phases, 0 findings**. Course/institution/document list/detail families and pricing remained unvisited. Zero findings is not an all-clear result.
- Scope: `/settings/account` was reached, but profile mutations were excluded. `/settings/billing` and `/settings/security` were navigation exclusions; allowed subscription-summary reads do not authorize billing/payment writes. The full [source route audit](STUDYBOOST_ROUTE_INVENTORY.md) remained outside the worker/model.
- Runtime: Node **26.12.1**, Playwright **1.64.1**, Chromium **156.0.8078.4**, gateway mitmproxy **12.3.1**; Chromium **`sandbox_on`**. Controller `im-Zdhsl9FKWU8qE9spRmz5hm`, opt-in gateway `im-VFVycsDf9x78A5ZYAg47E0`, frozen 94-file source digest `82e1179f35d210af48ad722ad3a5f9505464fbf1802a477a8a29bc21ae5af03f`. Default deployed browser runtime was not changed.
- Cleanup: sandbox `sb-01M64N6ABSANPMGNYD8Z4BSRNB` was **terminated**, confirmed independently by SDK poll with exit **137**. The harness returned exit 1 because the result was stopped rather than completed.
- Owner preview: final metadata was **available, frame sequence 75**, with model screenshots withheld in every recorded preview-state event. No live owner-preview pixels or model-image payloads were inspected for this report.
- Exact-account final persisted totals: **3 shelves, 5 tasks, 0 structured notes, 2 boards, 6 note elements**, compared with 5 elements previously. This count delta does not establish a workflow pass. TLS interception, sockets disabled and operation exclusions remain; no new public-release or Plan Audit closure is claimed. A generic scheduling fix and a further real run were still pending at publication of this entry.

[Immutable broad result](evidence/studyboost-run-broad-2026-10-30-aeb4dd1d-c239-4e24-81cc-7712857cd38d.json) · [Independent cleanup](evidence/studyboost-cleanup-aeb4dd1d-c239-4e24-81cc-7712857cd38d.json) · [Final fixture snapshot](evidence/studyboost-fixtures-broad-aeb4dd1d-c239-4e24-81cc-7712857cd38d-final.json)


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
