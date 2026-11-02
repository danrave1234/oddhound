# Trail and history verification

The Trail's old 24-stop rendering cap is now a labelled compact view with an **Expand trail** control.
The expanded Map/List views expose all recorded discoveries in 48-stop pages, with search, actor/device
filters and first/previous/next/latest navigation. Selecting a stop exposes every grouped state by
number, including its full title, route, actor/device, timestamp and state ID. Adjacent states are
grouped only when route, actor and device match; no state is discarded. Closing details restores focus.
The existing hound, colors and workspace layout remain.

Graph states are ordered by persisted `first_seen_at, id`. Replay uses those timestamps instead of the
last 300 activity events, and its legacy-event fallback no longer deduplicates states by route. The UI
explicitly calls this **discovery order**, not a complete revisit history or whole-site coverage.
Workflow-map layout now traverses states/edges once and renders visible graph elements only.

Activity and actions retain bounded initial snapshots (300/60) with explicit `hasMore` metadata. The
new `/api/runs/:id/history` endpoint checks the same run authorization on every request, uses a strict
sequence cursor, and caps responses at 100 records. UI pages render at most 100 records, with earlier
loading through the start of history. Incoming activity offers an explicit latest-records action;
it does not shift an older page while it is being inspected. The old 15-action display cutoff is gone.

The discovery summary distinguishes routes visited, explicit outcomes checked, pending routes and
controls, blocked/excluded work and additional variants omitted by sampling. It does not equate visits
or clicks with testing outcomes. Its short next-items list is labelled with the number shown; full
frontier deltas remain available in recorded Activity detail.

## Actual checks

- **12/12 unit regressions:** all 10,000 synthetic states retained; actor/device boundaries; grouped
  state search; complete timestamped replay despite a missing recent discovery-event window; repeated
  fallback events; strict history cursor/size validation.
- **29/29 real UI/API checks:** a local Next.js server and dedicated PostgreSQL database containing
  650 saved states (105 in one stop), 650 events and 240 actions. Real Chromium exercised expansion,
  earliest/latest selection, deep search, actor/device filters, keyboard list selection, focus return,
  complete older Activity/actions, discovery-summary distinctions and narrow dark/reduced-motion views.
  API checks reached event 1 without gaps/duplicates, refused private-run anonymous access and rejected
  an unbounded page request. There were zero client runtime errors in the final passing run.
- Web TypeScript checking passed after integration fixes. UI runtime: Node 26.12.1, Next.js 16.4.3,
  React 19.3.1, Playwright 1.64.1; Chromium's actual verdict was `sandbox_on`.

Run `.tools/node26/node.exe tests/e2e/trail-history-ui.ts`. Add `--serve` to retain the synthetic local
page for inspection; the harness prints the local URL and a task-specific stop-file path. Creating that
file closes the browser/server and drops its dedicated database. The final report is saved during
cleanup to `docs/evidence/trail-history-ui.json`, with unique per-attempt JSON records preserved.
The [large-run screenshot](evidence/trail-history-large-run.png) shows the actual UI. Earlier failed
attempts remain saved, including an actor-filter accessible-name failure and concurrent integration
errors involving the budget component's import/type changes; they are not represented as passes.
The owner-visible local proof was also independently inspected through computer use: the Trail was
expanded and state 650 selected ([inspection screenshot](evidence/trail-expanded-state650-cua.png)).
The proof harness then exited successfully, saved the final 29/29 report and confirmed cleanup of its
dedicated database, local server and Chromium 156.0.8078.4 browser.

Only saved fixture records are synthetic. The database, HTTP API, authorization path, React UI and
browser interactions are real. No model/provider, external target, real account or deployment is used
by this UI suite. These checks support the UI/history slice; they do not close complete B03/B04/B08/B09
or any public browser-containment/SELF release gate.

## Rollout boundary

`infra/modal/app.py` currently uses the newly built `web_image` for `web`, `worker` and `tick`.
Deploying that definition normally is not a web-only rollout. A reviewed split must keep the existing
immutable worker/tick image and their exact deployed browser, queue and runtime environment while
selecting a new image only for `web`; omitting existing functions from a replacement app definition is
not a safe way to preserve them. Web API/admission behavior also needs review: displaying a new run cap
with an older worker's lower cap would be misleading. Broader autonomous exploration remains on the
explicit gateway evaluation path until its applicable runtime gates pass. This slice did not deploy,
change a production runtime selector or widen enabled test capabilities.
