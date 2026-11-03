# Oddhound

## Pitch

General AI browser agents can report a bug. Oddhound proves one, and proves the fix.

## Why I built it

I ship a lot of small web apps on my own (invoicing, payment records, end-of-day reports, a water-station ledger) and I hate writing tests. So I built the tester I wanted: it explores my apps like a curious user, proves each bug before telling me, hands my coding AI a fix prompt, and after my next deploy replays the exact same check to prove the fix. I use it on my own production sites: this week I proved ownership of seven of them and queued a run on each.

## The problem

For the first engineer or solo founder at a small SaaS, a vague ticket such as “booking said saved, but it disappeared” can take **1–3 hours** to turn into reproducible steps, and may still end with “can’t reproduce.” Existing test suites cover only anticipated paths. ([Agreed strategy](WIN_PLAN_2026-11-03.md))

## What Oddhound does

- Autonomously explores an owner-verified website instead of following a prepared click script.
- Tries a pasted bug report first while continuing broader exploration.
- Treats the report as untrusted data, never as instructions.
- Verifies a candidate only after two fresh replays break the rule and a valid neighbouring case still passes. ([Verification design](STATUS.md))
- Produces a proof chain, coding prompt, Playwright regression test and fix receipt tied to an unchanged assertion. ([Agreed strategy](WIN_PLAN_2026-11-03.md))

## How Meta models are used

Owner-site scans are configured for **Muse Spark 1.3 Standard**, keeping customer page text away from the data-contributing tier; the synthetic demo target uses **Muse Spark 1.3 Contributor** to reduce cost. During the hackathon week the owner chose the contributor tier for runs on their own sites as well (Nov 3), to spend less credit. ([Model split](WIN_PLAN_2026-11-03.md))

Muse Code contributed to product strategy and reviewed the bug-report trust boundary during development. ChatGPT/Codex implemented the trusted report-reproduction core, while Claude led strategy, built and integrated the interface, reviewed the merge and drafted the submission. ([Team plan](WIN_PLAN_2026-11-03.md))

Muse Spark Open has configured Baseten and Fireworks fallback profiles, but recorded real-site runs used Direct Meta without fallback; the fallback has not yet been exercised. ([Provider configuration](../packages/core/providers/openai-compatible.ts), [provider evidence](PROVIDER_SMOKE_TESTS.md))

## What is new this week

- **Test every deploy.** A per-project deploy hook for CI: after a production deploy, Oddhound retests every open verified bug with the same hash-pinned checks (two fresh replays each) and the job passes only when all are fixed; with none open, it explores again with the last run's settings and reports new verified bugs without blocking the deploy. The project page hands you a ready GitHub Actions workflow triggered by Vercel's deployment status.
- **Tester outputs.** Each run marks verified bugs as new or already found last run, lists what it saw but did not test as a manual checklist, and gives each bug a human bug report (steps, expected, actual, evidence) next to the coding-AI fix prompt. A retest ends in a release check: fixed, still failing or undecided.
- A proof-chain view now brings independent replays, the valid case, retests and the pinned assertion hash together.
- Findings can produce a copyable Markdown fix receipt.
- Runs are drawn as orienteering courses, with plain measurements replacing decorative gauges.
- Results use a category-filtered list instead of a card grid.
- Owners can paste a bug report and receive either a verified linked finding or an honest “not reproduced within the tested scope” verdict. ([Agreed strategy](WIN_PLAN_2026-11-03.md), [report design](REPORT_REPRODUCTION.md))

## How to try it as a judge

**Try the demo target:** https://danravekeh123--oddhound-web.us-east.modal.run (press **Try the demo target**, no sign-in)  
Start a synthetic run and watch the route, actions and evidence develop.

**Inspect a recorded run:** https://danravekeh123--oddhound-web.us-east.modal.run/runs/69451626-a084-4c0c-9b48-56ec85dc8288  
Open a completed run to inspect its proof chain, unchanged assertion, retest evidence and fix receipt.

**Scan your site:** https://danravekeh123--oddhound-web.us-east.modal.run (sign in with GitHub, then **Scan your site**)  
Prove ownership, define allowed actions and exclusions, optionally paste a bug report, and start the run.

## Architecture

- A Next.js web app handles projects, ownership checks, live activity and evidence review.
- PostgreSQL stores contracts, events, findings, leases, queues and spend reservations.
- A worker plans exploration, records actions and routes candidates into verification.
- Direct Meta inference supplies browser planning; trusted code, not the model, decides verdicts.
- Each run gets a fresh Modal VM browser sandbox with filtered egress and no platform secrets.
- Independent replay evaluates typed assertions and rejects retests whose assertion hash changed. ([Runtime evidence](MODAL_VERIFICATION.md), [system status](STATUS.md))

## Safety and cost controls

Sites must be proven through DNS, a well-known file or an HTML meta tag, and ownership is checked again before each run. Browsers are isolated, secret-free, egress-filtered and destroyed after use. Reports are fenced as untrusted input, while assertions and verdicts are evaluated by trusted code. ([System status](STATUS.md), [Modal verification](MODAL_VERIFICATION.md))

Spend is reserved before inference, with a **$10 run cap, $25 public daily ceiling and $50 lifetime ceiling**, plus a kill switch. Verification and retesting require no model calls. ([System status](STATUS.md))

## Honest limits

The current build is deployed on Modal. On Nov 3 a signed-out demo run there (run 69451626, Muse Spark 1.3 contributor tier, Modal sandbox) verified 8 functional bugs. A golden recording for the video is still to be made.

The bug-report flow passed end to end once on the local demo target with real Meta inference: the pasted ticket was **reproduced** and linked to a verified finding, and 9 of 10 verified issues flipped to fixed on the corrected build ($0.15, 34 minutes). That run used Chromium on the developer machine rather than the Modal sandbox; a hosted reported run is still pending. ([Report reproduction evidence](REPORT_REPRODUCTION.md))

The latest broad StudyBoost evaluation stopped before completing coverage. It found **zero independently verified functional issues**; its persistence candidates remained inconclusive, and mobile coverage was unproven. ([StudyBoost evaluation](STUDYBOOST_EVALUATION.md))

Its retest on Modal (run 45350674) marked all 8 **fixed** on the corrected demo build with every assertion hash unchanged. The demo target cannot redeploy itself, so its retests run against a separately hosted corrected build; on an owner site they run against the same origin after the owner ships a fix.

## Built with

Claude led the agreed strategy and handled interface work, integration, review and submission drafting. ChatGPT/Codex contributed to strategy and implemented verified report reproduction. Muse Code contributed strategy and adversarial security review of report-to-finding trust. ([Agreed team plan](WIN_PLAN_2026-11-03.md))