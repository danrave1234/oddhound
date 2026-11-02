# Oddhound

## Pitch

General AI browser agents can report a bug. Oddhound proves one, and proves the fix.

## The problem

For the first engineer or solo founder at a small SaaS, a vague ticket such as “booking said saved, but it disappeared” can take **1–3 hours** to turn into reproducible steps, and may still end with “can’t reproduce.” Existing test suites cover only anticipated paths. ([Agreed strategy](WIN_PLAN_2026-11-03.md))

## What Oddhound does

- Autonomously explores an owner-verified website instead of following a prepared click script.
- Tries a pasted bug report first while continuing broader exploration.
- Treats the report as untrusted data, never as instructions.
- Verifies a candidate only after two fresh replays break the rule and a valid neighbouring case still passes. ([Verification design](STATUS.md))
- Produces a proof chain, coding prompt, Playwright regression test and fix receipt tied to an unchanged assertion. ([Agreed strategy](WIN_PLAN_2026-11-03.md))

## How Meta models are used

Owner-site scans use **Muse Spark 1.3 Standard**, keeping customer page text away from the data-contributing tier. The synthetic demo target uses **Muse Spark 1.3 Contributor** to reduce cost without exposing owner data. ([Model split](WIN_PLAN_2026-11-03.md))

Muse Code contributed to product strategy and reviewed the bug-report trust boundary during development. ChatGPT/Codex implemented the trusted report-reproduction core, while Claude led strategy, built and integrated the interface, reviewed the merge and drafted the submission. ([Team plan](WIN_PLAN_2026-11-03.md))

Muse Spark Open has configured Baseten and Fireworks fallback profiles, but recorded real-site runs used Direct Meta without fallback; the fallback has not yet been exercised. ([Provider configuration](../packages/core/providers/openai-compatible.ts), [provider evidence](PROVIDER_SMOKE_TESTS.md))

## What is new this week

- A proof-chain view now brings independent replays, the valid case, retests and the pinned assertion hash together.
- Findings can produce a copyable Markdown fix receipt.
- Runs are drawn as orienteering courses, with plain measurements replacing decorative gauges.
- Results use a category-filtered list instead of a card grid.
- Owners can paste a bug report and receive either a verified linked finding or an honest “not reproduced within the tested scope” verdict. ([Agreed strategy](WIN_PLAN_2026-11-03.md), [report design](REPORT_REPRODUCTION.md))

## How to try it as a judge

**Try the demo target:** `<LIVE_URL>`  
Start a synthetic run and watch the route, actions and evidence develop.

**Inspect a recorded run:** `<LIVE_URL>`  
Open a completed run to inspect its proof chain, unchanged assertion, retest evidence and fix receipt.

**Scan your site:** `<LIVE_URL>`  
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

Spend is reserved before inference, with a **$2 run cap, $7 public daily ceiling and $50 lifetime ceiling**, plus a kill switch. Verification and retesting require no model calls. ([System status](STATUS.md))

## Honest limits

The newest model split and report-reproduction commits still need a hosted deployment, signed-out check and recorded golden run. ([Remaining work](WIN_PLAN_2026-11-03.md))

The bug-report flow passed end to end once on the local demo target with real Meta inference: the pasted ticket was **reproduced** and linked to a verified finding, and 9 of 10 verified issues flipped to fixed on the corrected build ($0.15, 34 minutes). That run used Chromium on the developer machine rather than the Modal sandbox; a hosted reported run is still pending. ([Report reproduction evidence](REPORT_REPRODUCTION.md))

The latest broad StudyBoost evaluation stopped before completing coverage. It found **zero independently verified functional issues**; its persistence candidates remained inconclusive, and mobile coverage was unproven. ([StudyBoost evaluation](STUDYBOOST_EVALUATION.md))

A live retest against the corrected demo build has not yet been completed on Modal. ([Modal verification](MODAL_VERIFICATION.md))

## Built with

Claude led the agreed strategy and handled interface work, integration, review and submission drafting. ChatGPT/Codex contributed to strategy and implemented verified report reproduction. Muse Code contributed strategy and adversarial security review of report-to-finding trust. ([Agreed team plan](WIN_PLAN_2026-11-03.md))