# Side-chat checkpoint — October 30, 2026, 04:20 PHT

The owner stopped this side chat and explicitly requested preservation of its progress. This is a handoff, not a declaration that integration or the live-site evaluation is complete. Existing source changes remain on disk. A separate local copy of the relevant source is saved under `.data/side-chat-checkpoint-2026-10-30-041955/`; its manifest records per-file SHA-256 hashes. The snapshot is not a commit, deployment, or atomic tested release. It excludes credentials, environment files and private run traces.

## Owner instructions to retain

- Work in the `claude` workspace; leave `chatgpt` alone.
- Restore a real protected owner-visible browser preview for supplied-account runs. Changing the blank placeholder alone is insufficient. Keep model screenshots withheld after credentials/session secrets.
- Improve autonomous discovery, evolving plans, meaningful control/outcome checks, breadth, useful coverage reporting, and execution efficiency. Visiting pages or increasing action counts is not evidence that their features work.
- The owner approved a maximum of **$10 in model spend per run**. Preserve atomic reservations and other account/traffic/time/authorization limits. Actual public allowance still respects the existing $7 daily/$50 lifetime ceilings; never silently take judging funds.
- When concurrent work was discovered, the owner said: **“Handle all integration here once the other task stops.”** Shared source changes have been held while that task is active. Do not overwrite its work or revive an older snapshot over it.
- No subagents or cross-task messages were authorized in this side chat. No paid inference, deployment, or real-site scan was started by this side chat.

## Concurrent task at handoff

Main task: **Test Oddhound on StudyBoost**, thread `01a188cd-6de3-7a62-8965-3442576292b2`; active turn `01a18909-4133-7ad2-aa36-3accf4b06579`.

It was still active at the last read. Latest wait cursor: `8c031c6d-05ad-4f74-b01f-112951273a41:123`. Its latest message said the account/session provenance fix passed **19 targeted checks**, including unchanged defect replays and correct access denials; the complete rerun was finishing before a real StudyBoost evaluation. Check fresh status and results before editing. Do not assume that evaluation started or passed from this note.

## Implemented and preserved

The side chat initially implemented the protected preview path, broader discovery, outcome counting and $10 cap changes. The main task subsequently integrated and strengthened them. Current shared files, not an earlier side-chat draft, are authoritative.

- Protected capture: `packages/core/browser/protected-preview.ts`, `agent/session.ts`, `agent/preview.ts`, `artifacts/owner-preview.ts`, migration `010_owner_preview.sql`, owner-only preview API and `owner-preview.tsx`, wired into run views.
- One replaceable frame per run, maximum 2 MiB, seven-day expiry, current non-revoked owner only, private/no-store and same-origin headers. Capture failure clears the frame and reports a paused state. Preview metadata does not contain pixels or secret text. Model/evidence screenshot restrictions remain separate.
- Capture protection now includes isolated-world inspection, frozen scripts/animation, private cookie/storage secret refresh, origin/document checks, source-pixel suppression, generated-content and CSS paint controls, exact restoration and fail-closed cases. This is tested protection for listed cases, not proof of universal confidentiality against arbitrary rendering.
- Continuous discovery now uses `NavigationFrontier` in `agent/frontier.ts`, not the side chat's original `Exploration` class. Discovery persists through context compaction, covers hidden/menu/header/sidebar links, redirects/popups, post-login destinations and bounded sitemap batches, and records sampled/excluded/blocked work.
- Early finish attempts cannot discard pending navigation/open charters. Repeated unproductive attempts trigger navigation recovery or a truthful stalled stop. Invalid-tool/no-tool loops are bounded by progress handling. Detector candidates continue beyond the former tenth-candidate cutoff.
- Separate visited/exercised/outcome-checked counts; extended trail/history UI; measured execution timing. The $10 cap is saved at admission in migration `011_run_model_budget.sql`; old runs retain their original cap and all calls reserve against actual remaining allowance.

## Evidence already available

Read these current documents and their linked evidence rather than reconstructing results from this note:

- `docs/EXPLORATION_AND_PREVIEW_REQUIREMENTS.md` — full owner requirements and acceptance criteria.
- `docs/EXPLORATION_IMPLEMENTATION_VERIFICATION.md` — current combined implementation and component evidence.
- `docs/PREVIEW_INTEGRATION_REVIEW.md` — final protected-preview implementation, preserved failures, tests and limitations.
- `docs/TRAIL_HISTORY_VERIFICATION.md`, `docs/REPLAY_GATEWAY_RELIABILITY.md`, `docs/STUDYBOOST_EVALUATION.md` — separate UI/replay/live-site evidence. The live-site document can contain older runs; check dates and source versions.

Known results at handoff:

- Preview: **15/15 focused tests** plus **11/11 independent synthetic paint probes**. Tests use actual Chromium, paired synthetic secrets/pixels, real local PostgreSQL and access/expiry/revocation/failure transitions. Both focused fixtures and the independent probe report `sandbox_on`.
- Broad discovery: actual local browser/server fixtures reached **102 pagination destinations** and the larger late/header/sidebar/redirect fixture; the latest breadth shard passed **3/3**. The zero-price providers are scripted test doubles, not Meta intelligence evidence.
- Core shard: **274/274 passed**, saved in `docs/evidence/exploration-complete-core-2026-10-30.txt`. Breadth shard: `docs/evidence/exploration-complete-breadth-2026-10-30.txt`.
- A separate family shard initially failed because an expected cross-account access denial became a false broken-link report. Preserve its failure log. The main task's later account/session provenance fix passed 19 targeted checks; the final combined rerun was not yet confirmed here.
- Earlier source passed core/web TypeScript checks and a production web build. Do not substitute an old build for checks after final changes.
- Runtime recorded by preview verification: Node **26.12.1**, Playwright **1.64.1**, Chromium **156.0.8078.4**, Vitest **5.0.5**, TypeScript **5.9.3**, local PostgreSQL **17.11**. Product inference remains Direct Meta `muse-spark-1.3`; no real provider calls were made by this side chat.

## Remaining integration findings — not implemented

### 1. Ordinary controls can still be left untouched at completion

In `packages/core/agent/execute-run.ts`, the `finish_run` branch computes `gaps` from open plan items and pending routes/navigation controls/sitemaps. It reports unexercised ordinary controls, but those controls do not contribute to the completion gate. A planner can close a small plan and finish after visiting routes while leaving ordinary form fields/buttons untouched.

This is directly visible in `tests/integration/exploration-coverage.test.ts`: its provider ends with a visited-but-functionally-untested form, the test expects `completed`, and it deliberately asserts zero form writes and no checked outcome for `/visited-only`. Those are useful truthfulness controls, but they also expose the missing functional-work accounting.

Finish the requirement that relevant authorized controls receive test evidence, a blocker, or an explicit skip/sampling reason. Keep the distinction between an action and a checked effect. Do not solve this by blindly clicking unsafe controls, fabricating passes, weakening policy, or hiding gaps. Add meaningful worker-level coverage for premature completion with an ordinary untouched control and for legitimate recorded exclusions; update narrow scripted fixtures honestly if completion semantics change. This work may require additional tool/schema/report integration, not just changing a boolean.

### 2. Control-coverage route breakdown silently truncates at 30 rows

`CoverageTracker.summary()` in `packages/core/agent/coverage.ts` currently ends the per-route breakdown with `.slice(0, 30)`. The workspace renders that already-truncated list. This undercuts the newly broadened exploration report.

A non-mutating Node probe at handoff created 101 distinct named routes with one Save button each and returned:

```json
{"pages":101,"total":101,"routeRows":30,"exercised":0,"outcomeChecked":0}
```

Remove the silent cutoff or expose all rows through an explicit paginated/expandable report, with a regression check beyond 30 routes. Preserve honest exercised/outcome counts.

### 3. Retire the superseded discovery implementation carefully

At handoff, `packages/core/agent/exploration.ts` was referenced only by `tests/unit/exploration.test.ts`; execution and UI use `NavigationFrontier`. Confirm with a fresh search before removing the obsolete class/tests. Preserve the meaningful `CoverageTracker` test that a click is not automatically an outcome check, moving it to a relevant test file if necessary. Do not report unused-code tests as proof of the current runner.

### 4. Finish combined review and report

After the other task stops, inspect its final changes/results, reconcile the remaining findings above, and run relevant tests/typechecks against the resulting source. Preserve all concurrent work and failed evidence. Update the verification documents with exact actual results and remaining gaps. Do not claim deployment, actual StudyBoost improvement, whole-site coverage, or shipping readiness without its corresponding fresh evidence.

## Practical resumption

- Repository: `C:\Users\Danrave\Desktop\Project\Oddhound\claude`.
- Pinned runtime: `.tools/node26/node.exe`. Use it rather than the host Node.
- This side chat created a separate local database named `oddhound_side_preview_1030` in container `oddhound-claude-pg`. Do not share/truncate the main task's active test databases. Database credentials are intentionally omitted from this handoff.
- Read root `AGENTS.md` and relevant owning documents before further changes. React review skill used: `C:/Users/Danrave/.codex/plugins/cache/openai-curated-remote/vercel/0.54.1/skills/react-best-practices/SKILL.md`.
- Local component checks do not close public-release/deployed isolation gates. Applicable B03/B04/B09/B18/B19/B22/B23/B24 and full SELF/readiness requirements remain governed by the owning documents.
- No commit, reset, branch/worktree operation, task interruption or external message was used to checkpoint this side chat.

