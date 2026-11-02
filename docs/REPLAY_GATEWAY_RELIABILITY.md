# Replay hydration and gateway error attribution

The replay now waits up to five seconds for its recorded field selectors and submit button after navigation. Selector text, matching order and saved assertions are unchanged. The real Chromium fixture inserts fields after 850 ms and the button after 1,600 ms; two independent authenticated replays pass. Missing recorded fields/buttons remain `blocked`, produce no login submission and retain the original scenario hash.

The opt-in evaluation gateway now distinguishes native proxy transport errors from genuine target HTTP errors. mitmproxy 12.3.1 generates protocol-error responses after its addon error hook; changing `flow.response` inside that hook would not attribute those native responses. Its [HTTP/1 response factory](https://github.com/mitmproxy/mitmproxy/blob/v12.3.1/mitmproxy/proxy/layers/http/_http1.py) and [HTTP/2 response path](https://github.com/mitmproxy/mitmproxy/blob/v12.3.1/mitmproxy/proxy/layers/http/_http2.py) both use the module's Server identifier. The evaluation addon reserves `oddhound-evaluation-gateway/12.3.1` there and refuses to start under an unreviewed mitmproxy version. It strips that reserved Server namespace and `x-oddhound-blocked` from genuine upstream responses. The shared response classifier then identifies native gateway errors, which the existing sentinel and replay logic treat as instrumentation failures.

This changes attribution only. TLS verification, HTTP/2, egress policy, limits and the default deployed browser image setting remain unchanged. A rebuilt image is required for the evaluation profile; the old image and its evidence are retained.

## Evidence

- Hydration: **3/3 passed** under real sandboxed Chromium; [test output](evidence/delayed-auth-form-2026-10-30-tests.txt). This covers independent fresh logins and the two missing-selector controls.
- Extended local gateway: **58/58 passed**, `sandbox_on`; [immutable JSON](evidence/gateway-evaluation-tls-canary-82fb7bf3.json), [gateway log](evidence/gateway-evaluation-tls-canary-82fb7bf3.log), [console output](evidence/gateway-attribution-2026-10-30-final-canary.txt). Both containers and both lab networks were confirmed removed.
- The 58 checks retain the original 51 policy controls and add native HTTP/1 and HTTP/2 transport-error attribution, native HTTP/1 and HTTP/2 genuine target-502 controls with spoofed attribution headers, and three real-Chromium sentinel controls (proxy failure, genuine target failure, spoofed genuine failure).
- Two earlier extended canaries scored **55/56**: [first](evidence/gateway-evaluation-tls-canary-64c30a50.json), [diagnostic repeat](evidence/gateway-evaluation-tls-canary-a0e94463.json). HTTP/2 attribution itself worked, but the lab client offered only `h2` upstream to an HTTP/1 target, so no target request arrived. The corrected client offers `h2,http/1.1`, verifies that its gateway connection actually negotiated `h2`, and requires the destination request. Both failures and their cleanup results are retained.
- TypeScript typecheck passed after the source and canary edits. Python policy syntax compilation passed. No provider inference was used.

Local image: `oddhound-claude-gateway:attribution-20261030`; created-container image identifier `sha256:ba04ff29ea56f83dcb23491719392fcde1d1b3fa876dc3a40a0b4eecd0de4431`. [Build output](evidence/gateway-attribution-2026-10-30-build.txt).

Versions: Node **26.12.1**, Playwright **1.64.1**, Chromium **156.0.8078.4**, mitmproxy **12.3.1**, Vitest **5.0.5**, TypeScript **5.9.3**. Both browser fixtures explicitly assert `sandbox_on`. Only the target pages/endpoints and credential resolver are synthetic; TLS, proxy/firewall, browser, network arrivals and classification execute for real.

## Scope and remaining proof

The local target network is internal. A separate Docker bridge exposes loopback control ports; this plumbing is not deployed-network isolation evidence. The fixed native clients run as the browser UID through the existing loopback proxy exception and trust only the ephemeral lab gateway CA. Target private keys never enter the gateway.

This slice does not close the remaining B03/B04/B22/B23/B24 deployed isolation, lifecycle, resource or full application gates. It does not retroactively classify the old StudyBoost static-JavaScript 502 as a confirmed target defect. The parent task owns the full suite and next real-site evaluation.

## Cloud startup proof

The separate evaluation image built as **`im-VFVycsDf9x78A5ZYAg47E0`**. [Build log](evidence/gateway-attribution-2026-10-30-modal-build.txt). The existing blank-page preflight passed **6/6 checks**: frozen policy hash, Chromium sandbox/version, blank-only context, confirmed sandbox termination and independent cleanup by run tag. [Immutable proof](evidence/modal-gateway-preflight-2026-10-30-e92bfb63-b950-4861-bf9d-3e1ae38d14ca.json). Sandbox `sb-01M64J6Q12HM6PWHM2243BJST6` was confirmed terminated; no tagged leftovers remained. This proof used Modal `vm` runtime, token-authenticated control and the canonical public IPv4 allowlist, Node SDK **0.11.1**, Python build SDK **1.6.3**. No target navigation, target credentials or model calls occurred. It proves startup/control/sandbox/cleanup only, not cloud reproduction of the local 58-case canary.
