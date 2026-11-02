# Supplied test-account workflow — October 30, 2026

The supplied-account path previously stored a credential reference but never told the model that it existed. The runner only recorded synthetic registration recipes, and the verifier refused every login recipe. An account entered in run setup therefore could not reliably support autonomous login and independent replay.

The model now receives only each authorized account's reference, label and role, including after conversation compaction. It uses the existing credential tools to sign in. The runner records the observed login form with a credential reference; verification and retest resolve that reference only if the current contract permits login and includes the account. Supplied accounts are limited to actor A. Unknown references, missing legacy references and using the same account as a second actor fail closed. Password credentials may only be filled into password inputs. Standalone test exports request test credentials through environment variables rather than embedding them.

## Validation

Command, using the disposable local `oddhound_account_test` PostgreSQL database:

```powershell
.tools/node26/node.exe node_modules/vitest/vitest.mjs run tests/unit/supplied-account.test.ts tests/integration/supplied-account-replay.test.ts
.tools/node26/node.exe node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

Result: **9/9 tests pass**, TypeScript check passes. Output: [supplied-account-2026-10-30-tests.txt](evidence/supplied-account-2026-10-30-tests.txt).

- A real Chromium logs into a local fixture using a supplied test account, performs an authenticated write and repeats the unchanged assertion in another fresh context. The saved hash does not change.
- The real worker pipeline runs against PostgreSQL in both batch and steps modes, discovers the reference from its prompt, records the login and independently replays its candidate twice. The passing control is dismissed rather than reported as a defect.
- Missing/unauthorized references and cross-account borrowing are blocked. A password-to-plain-input tool call is refused.
- The fixture deliberately reflects a synthetic password into page text, a plain input, a password input toggled to text and an alert. The marker is absent from provider messages, events, action arguments and saved scenarios. Exact and URL-encoded markers are redacted.
- A screenshot requested after supplied credentials are resolved is explicitly withheld. No image enters the provider request. Supplied-login replay results omit image artifacts and record that limitation.

Versions: **Node 26.12.1; Playwright 1.64.1; Chromium 156.0.8078.4; Vitest 5.0.5; pg 8.23.1**. The browser was launched with `chromiumSandbox: true`; `chrome://sandbox` returned **sandbox_on**. These are local Windows browser checks, not a deployed runtime verdict.

The worker test uses the explicitly labeled `test-double/heuristic-planner` scripted provider at zero model cost. The direct replay tests use an in-memory test credential resolver; the worker tests use the real encrypted PostgreSQL credential vault. The target is a local synthetic fixture. **No Meta call, real-site request or deployment is part of these tests.**

## Delayed SPA login correction

The first source-frozen real-site evaluation exposed a recording gap: the submit action still observed
`/login`, while the following navigation reached the authenticated `/my-room`. Previously the click
handler cleared the pending form immediately, so the successful sign-in never became a replay recipe.
That run's code and evidence were not changed.

The runner now retains the original submitted form and button label for up to 60 seconds in the same
actor/device context, checking subsequent observations and navigations. It requires an observed
post-login control or heading after leaving the login path; error alerts and a remaining sign-in form
do not establish success. Replay separately waits up to five seconds for that recorded success text
instead of treating `DOMContentLoaded` as SPA authentication completion.

The delayed fixture uses real Chromium and a two-second client-side navigation. Worker assertions
require action 4's click to remain on `/login`, action 5's navigation to reach `/my-room`, the recorded
submit to stay `Sign in` after an `Open shelf` click, and both independent replay outcomes to pass.
Wrong credentials and signed-out redirects create no authentication recipe/workflow and block replay
before protected writes. The supplied-account, sentinel and unit regression suites passed **27/27**;
TypeScript checking passed. Output:
[supplied-account-spa-2026-10-30-tests.txt](evidence/supplied-account-spa-2026-10-30-tests.txt).
The provider remains scripted, the target synthetic, and the Chromium verdict `sandbox_on`.
The existing registration family and batch-runner regressions also passed **2/2**, including independent
verification and unchanged retests against fixed and vulnerable fixtures. Output:
[supplied-account-spa-registration-2026-10-30-tests.txt](evidence/supplied-account-spa-registration-2026-10-30-tests.txt).

## Limits and remaining proof

This slice does not close a Plan Audit blocker or certify SELF-01–23. **B03/B04/B09** require the separate deployed browser/action-boundary proof; **B06/B15** still require evidence from the authorized real site; **B08** remains partial; **B10** is only component evidence here.

The privacy change removes known exact/URL-encoded secrets from model-bound text. It does not prove sanitization of arbitrary transformed, fragmented or encoded values, cookies or tokens. Supplied-account screenshots are withheld rather than claimed safe. Registration and owner-handoff screenshot paths retain their existing separate limitations.

Authentication recording uses an observed sign-out control when available and a post-login heading
fallback when the control is hidden, as in many SPA account menus. The delayed fixture requires the
account cookie for the personal room; the original fixture requires it for writes. A changed route,
missing login form and page heading are still not a generic positive-identity proof for every external
application. A completion later than the pending/replay windows remains blocked or unrecorded.
Replays that require a separate fresh account, including cross-account and fresh-account invariant
checks, remain blocked for a single supplied account. Saved scenarios retain the same assertion and
credential reference on retest; changed, unavailable or expired credentials can block that retest.

Changed implementation files: `packages/core/agent/{prompt,execute-run,session}.ts`, `packages/core/ledger/credentials.ts`, `packages/core/verifier/scenario.ts`, `packages/core/reports/playwright-export.ts`. Added tests: `tests/unit/supplied-account.test.ts` and `tests/integration/supplied-account-replay.test.ts`.

No extra credentials or external access were needed for this component verification. A real run still needs its existing verified-origin contract, authorized test account, configured model/runtime access and applicable browser gates.
