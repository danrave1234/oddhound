# Finished-run results dashboard

Finished runs now open on **Results**, including stopped, failed and blocked runs. The existing macOS-style workspace, Trail, workflow, browser and evidence inspector remain available. An already-open workspace keeps its selected view when the run ends and offers a View results entry instead of moving the user.

The dashboard separates verified issues, review items, configuration observations and suggestions. Functionality, Security, SEO, UI/UX and Other findings cards filter saved findings; selecting a finding opens the existing inspector. Grouping uses saved baseline/owner rules and the existing CSP observation signature. Unrecognized rules remain Other findings. Presentation grouping never changes saved assertions, verification or finding categories. Owner rules reusing a baseline ID do not inherit that baseline's meaning.

No scores, new audits or category passes are invented. An empty category explicitly says that coverage is not established. The scope section shows paths/states, observed-control counts, outcome checks, pending discoveries, contract exclusions and whether mobile states exist. A stopped run remains labelled partial. Global outcome checks are not represented as category-specific coverage.

## Changed files

- `apps/web/app/runs/[id]/results-data.ts`: grouping and category-preserving totals.
- `apps/web/app/runs/[id]/results-dashboard.tsx`: dashboard, category filters and evidence/coverage entry points.
- `apps/web/app/runs/[id]/workspace.tsx`: default Results view for terminal runs; preserves an open workspace's selection.
- `apps/web/app/globals.css`: dashboard layout using existing tokens, responsive counts and local icons.
- `tests/ui/results-dashboard.test.ts`, `tests/e2e/results-dashboard-ui.ts`: semantic safeguards and actual recorded UI checks.
- `package.json`: dashboard Node test command and inclusion in `test:all`.

## Verification

- **7/7 Node tests passed**: three new dashboard checks and four existing replay checks. [Output](evidence/results-dashboard-unit-2026-11-03.txt).
- **11/11 dashboard Chromium checks passed** over the actual sanitized StudyBoost recording: default view, stopped/partial labels, exact finding counts, scope gaps, keyboard category selection, no SEO pass, CSP observation, inspector, 390px dashboard layout, coverage link and client errors. [Result](evidence/results-dashboard-ui-2026-11-03.json).
- **11/11 existing replay/Trail browser checks passed again** on the final dashboard build. [Result](evidence/replay-complete-history-ui-2026-11-03.json).
- Final Next production build, root TypeScript, icon lint and diff checks passed. [Build](evidence/results-dashboard-build-final-2026-11-03.txt).
- [Desktop screenshot](evidence/results-dashboard-desktop-2026-11-03.png), [mobile review screenshot](evidence/results-dashboard-mobile-2026-11-03.png). This tests Oddhound's dashboard layout; it is not mobile testing of StudyBoost.

The actual recording has 351 actions, 142 desktop states, 42 paths and 2,128 events. Its immutable SHA-256 remains `209c0876afa5e487578d667dee3861efc4a26e3eea529b802144540ef4b4faea`. Dashboard totals are **0 verified issues, 2 needs-review items, 1 configuration observation and 0 suggestions**. The two rule-less candidates stay Other findings rather than acquiring an invented rule.

Runtime: Node **26.12.1**, Next **16.4.3**, React **19.3.1**, Playwright **1.64.1**, Chromium **156.0.8078.4**; browser checks reported **sandbox_on** and closed their browsers. No new provider call or target request occurred in this slice. The source recording used real Direct Meta **muse-spark-1.3 Standard / reasoning low**. Node cases use constructed records; browser checks use the sanitized actual recording, not simulated inference. Private pixels, credentials and replay payloads remain omitted by the local viewer.

Local read-only viewer: `http://127.0.0.1:3312`, process session `42410`; stop file `.data/oddhound_recording_4413f95f644e.stop`. The previous viewer was stopped normally before rebuilding. Its isolated DB, SELECT-only role and GET-only wrapper checks passed again. No public deployment or default runtime change occurred.

## Limits and remaining work

Assumption: the requested categories organize evidence from each run; adding SEO/security/UX audit engines is separate work. SEO metadata/indexability and broader usability/accessibility audits have not been added. Existing replay authentication failures, sparse outcome coverage, catalog backlog and target mobile evidence remain unresolved. This UI slice closes no additional Plan Audit blocker; B03/B04/B09/B18/B19/B24 and the owning public-release gates remain open. No missing credentials or access blocked this local work.
