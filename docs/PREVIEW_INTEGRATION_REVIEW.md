# Protected owner preview integration review — October 30, 2026

The current integrated preview passes **15/15 focused tests** and **11/11 independent synthetic paint probes**. The final source is frozen for the parent task's full regression suite and real-site evaluation. These results cover the cases below; they do not establish universal confidentiality for arbitrary hostile page rendering.

## Implemented path

Owner frames live in `run_owner_previews`, one replaceable frame per run, separate from model screenshots and finding artifacts. The authenticated endpoint serves only the current, non-revoked owner, excluding other users, anonymous/public demo access and expired frames. It sends private/no-store and same-origin resource headers. Frame storage is bounded to 2 MiB with a seven-day expiry. Capture failure clears the frame and records a paused state. The workspace presents a timestamped sampled frame.

The supplied-account/model screenshot restriction remains enabled. Session cookies and sensitive local/session-storage values are collected privately; the storage read uses trusted CDP rather than page-owned JavaScript methods. Owner capture refreshes this secret set after freezing script execution. The expected origin and document loader are checked within the capture boundary; navigation discards the frame.

Inspection and cleanup run in an isolated CDP world, so page replacements of DOM methods cannot suppress masking. Scripts and the animation timeline are frozen during inspection/capture. Known reflected secrets, editable controls, graphics, frames, open shadow hosts and generated-content hosts have source pixels suppressed through inline important opacity/visibility declarations, then receive masks. URL-backed background, border, list, mask, clip and filter paints are suppressed; custom list markers are normalized. Changes to inline styles and marker attributes are restored exactly. Closed shadow roots, bounded-inspection failures, restoration failures or masks requiring the entire root cause capture to pause.

`preview.state` events contain only state, frame sequence, model-screenshot-withheld status and a generic paused reason. The database test verifies available → paused → available transitions and excludes image data and synthetic secret/error text from these events. Owner frames never enter the inference history or finding evidence.

## Actual verification

- [Final focused run](evidence/owner-preview-final-paint-2026-10-30-tests.txt): **15/15 passed**, two files, 12.81 seconds. Both fixtures launch `channel: chromium`, `chromiumSandbox: true` and assert `sandbox_on`. TypeScript typecheck also passed after the final edits.
- The suite preserves the original seven checks and adds permanent controls for page-owned DOM method overrides, navigation during capture, important CSS with overflowing text/shadows and exact style restoration, whole-root pause, string/custom-counter list markers, and URL-backed masks/SVG filters. The shared paired-secret helper requires raw pixels to differ and protected pixels to match. The existing database test also verifies private access, replacement, expiry, revocation, failure clearing and the new metadata transitions.
- [Independent final paint probe](evidence/preview-generated-content-52826937.json): **11/11 protected**, no pauses or leaks, with actual raw-visible controls and identical protected pixel pairs. Its source hash is unchanged across the run. Cases include important `::before`/`::after`/`::marker`, `attr()` content, custom list markers, CSS mask/SVG filter resources and canvas/iframe filter silhouettes. All local contexts/browser closed.
- The earlier **7/7 focused result** and intermediate **11/11** and **13/13** focused results are historical; they predate the final URL-paint controls and are not substituted for final proof. Intermediate outputs remain [here](evidence/owner-preview-integrated-2026-10-30-tests.txt) and [here](evidence/owner-preview-final-2026-10-30-tests.txt).

## Preserved failures

The [initial four failed adversarial checks](evidence/owner-preview-adversarial-initial-2026-10-30.json) remain: split-plus-intact reflected text, open shadow text, closed shadow release and a MutationObserver race. The original draft review also identified main-world DOM override and document-navigation gaps; those fixes now exist in shared source with permanent tests.

Independent paint failures are retained: [six original pseudo/filter leaks](evidence/preview-generated-content-3a4c3ba1.json), [two custom-marker leaks after the first seven passed](evidence/preview-generated-content-77f4e019.json), and [two URL-paint leaks after nine passed](evidence/preview-generated-content-d3aa03ec.json). Their synthetic images remain beside the JSON reports. The [first seven-case pass](evidence/preview-generated-content-c9543f09.json) is also retained and does not override those later failures.

## Versions and limits

Pinned Node **26.12.1**, Playwright **1.64.1**, Chromium **156.0.8078.4**, Vitest **5.0.5**, TypeScript **5.9.3**, local PostgreSQL **17.11**. Final focused preview tests used the isolated `oddhound_exploration_test` database. Both final focused browser fixtures and the independent probe confirmed `sandbox_on`.

Only synthetic pages/secrets are used here. The preview producer's failure path is intentionally injected in the database test; browser capture, pixel comparisons and database authorization/storage checks execute for real. No Meta calls, target-site activity, deployment or image rebuild was needed for this preview slice. This is local component evidence and does not close the remaining applicable B03/B04/B22/B23/B24 or full application/release gates. The tested boundary covers the listed known-secret and paint paths; it is not a general proof against every possible page rendering or indirect encoding technique. Model screenshots remain withheld after credentials/session material, independently of owner-preview availability.

