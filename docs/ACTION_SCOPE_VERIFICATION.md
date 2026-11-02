# Action-scope regression evidence — October 30, 2026

The current `packages/core/browser/scope.ts` action boundary failed four local canary cases. This is
separate from the Modal sandbox/egress canary: a private-address firewall and Chromium sandbox do not
prevent an approved public site from forwarding traffic to another public origin.

Run from this workspace with the pinned runtime:

```powershell
.\.tools\node26\node.exe tests/lab/action-scope-canary.ts
```

The command intentionally exits nonzero when a required boundary fails. It is a standalone diagnostic,
not part of the default Vitest suite. Full nonce-correlated listener arrivals, synthetic request bodies,
policy decisions and browser results are in [action-scope-local-canary.json](evidence/action-scope-local-canary.json).

| ID | Required behavior | Actual result |
|---|---|---|
| AS-01 | Approved same-origin POST reaches the listener | Pass |
| AS-02 | Unscoped positive control reaches the resource listener | Pass |
| AS-03 | Direct off-origin POST is blocked | Pass |
| AS-04 | Approved same-origin 307 redirect preserves its POST body | Pass |
| AS-05 | Off-origin 307 redirect does not forward a POST/body | **Fail: body arrived** |
| AS-06 | Off-origin 308 redirect does not forward a POST/body | **Fail: body arrived** |
| AS-07 | Resource-only iframe cannot borrow primary-origin write authority | **Fail: POST arrived at primary** |
| AS-08 | Unscoped socket positive control reaches the resource listener | Pass |
| AS-09 | Unverified-origin WebSocket is refused | **Fail: handshake arrived** |

**5 passed, 4 failed; exit code 1.** Node 26.12.1, Playwright 1.64.1, Chromium 156.0.8078.4 on Windows;
`chromiumSandbox: true`, actual `chrome://sandbox` verdict `sandbox_on`. TypeScript checking passed.
No model/provider, database, cloud runtime, credentials or real website was used. The fixtures are
synthetic; the browser, HTTP/socket listeners and imported production `attachScope` implementation are real.
Both origins are owned loopback listeners, so this proves an action-authority flaw independently of IP
filtering. It does **not** constitute the required two-public-origin/deployed egress proof.

The observed causes are distinct:

- `attachScope` continues the initial request. Later redirect hops do not re-enter that route handler,
  so the original POST and body reach the second origin before any post-action check.
- `decide` checks destination authority, but an ordinary fetch originating inside a resource iframe
  receives the primary origin's write authority. Blocking iframe navigation POSTs does not block fetches.
- The implementation installs no WebSocket routing/enforcement hook. Its pure `decide` test for sockets
  is not evidence that actual browser handshakes pass through that function.

These are open **B03/B18/B19** action-scope requirements. Smallest fail-closed containment is to keep
autonomous real-site runs unavailable through this boundary until a replacement boundary passes the
allowed/denied suite. A URL allowlist, observation-only mode or after-navigation error cannot repair a
request already sent. Adding a redirect callback alone also does not settle frame, worker or socket
authority. Any gateway adoption must preserve the declared TLS/evidence limitations and pass the owner
documents' remaining gates; this diagnostic does not silently select or enable one.

No runtime behavior was changed by this diagnostic. The existing StudyBoost DNS proof, account access,
Cloudflare compatibility, budgets and fresh-runtime teardown still need checking for a new live run.

## StudyBoost run prerequisite

`preview.studyboost.com` previously had a separately verified API origin,
`preview.api.studyboost.com`, and a documented active signup workflow (`docs/STATUS.md`, run e473ebc6).
Modal later encountered a Cloudflare challenge (`docs/MODAL_VERIFICATION.md`, run de9bc888). Those are
historical observations, not a new verification or a successful current run. Even if the Cloudflare
challenge is resolved, **AS-05/06/07/09 remain independently demonstrated Oddhound blockers**. Creating
an account manually does not establish that Oddhound can contain the subsequent autonomous session.

The existing root guarded-gateway candidate is a stronger starting point than another CDP workaround,
but is still a lab implementation. Its `policy.py` hard-codes fixture/API/resource origins and laboratory
limits, and its supervisor trusts an owned upstream TLS root. Production integration needs immutable
per-run scope configuration, the public upstream trust store, protected CA/control files and UID/firewall
separation, a pinned browser image, stop/expiry wiring, resource/application controls and the same deployed
allowed/denied proof. WebSocket preassembly memory remains open in the root proof records. None of these
can be replaced by copying `route.fetch` into the controller or by relabelling the current canary green.

The later [owner-only gateway evaluation](GATEWAY_EVALUATION.md) is a separate opt-in profile. Its 51
real-TLS local checks pass, including the redirect/frame escapes above and explicit socket denial.
The original boundary's four failures remain unchanged; general public launch is not cleared by the
new candidate's local evidence.
