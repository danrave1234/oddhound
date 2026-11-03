# Owner-only gateway evaluation

This is an explicit, run-scoped evaluation profile for the owner-authorized StudyBoost test. It does
not replace the deployed browser image or turn on general verified-site access. The existing
`attachScope` failure evidence remains in [ACTION_SCOPE_VERIFICATION.md](ACTION_SCOPE_VERIFICATION.md).

The controller must pass `evaluationPolicy` to `ModalSandboxRuntime` together with a separately pinned
evaluation image, token-authenticated control, the `vm` runtime and the exact canonical public IPv4
allowlist. The policy is derived from an owner-verified immutable run contract, cannot outlive that
contract, and is bound to startup by a SHA-256 acknowledgement before browser attachment. Target and
platform credentials are absent from this configuration. Platform credentials never enter the guest;
the browser process also does not inherit its server's control path.

The guest runs sandboxed Chromium through a loopback TLS gateway and smokescreen. Browser, gateway and
proxy UIDs have separate protected egress rules. Smokescreen validates and dials the permitted public
address; the gateway verifies the real upstream certificate. Fixed HTTP policy checks every request,
including later redirects, initiator origin and Fetch Metadata. Public resources gain no primary/API
action authority. **WebSockets are disabled** before upgrade in this evaluation profile. Service
workers remain blocked by the runner. No arbitrary model code is introduced.

The gateway limits requests, decoded resource size, total decoded bytes and active upstream requests.
A bounded queue admits ordinary parallel assets while keeping six active requests. Protected kernel
quotas fence admitted IP bytes in each direction; expiration, quota faults or service failure close the
browser. These are not an exact provider-billing or NIC-arrival bound.

## Recorded local proof

On 2026-10-29 at 18:23 UTC, the real TLS canary passed **51/51**, with Chromium `sandbox_on`:

- GT-01–07: primary/API writes, resource CSS and twelve parallel assets with at most six active requests.
- GT-08–32: all 25 ordered combinations of 301/302/303/307/308 same-origin redirects.
- GT-33–40: denied resource write, 307/308 body escape and off-origin document redirects.
- GT-41–45: denied resource-frame authority borrowing; permitted primary/API worker writes and denied resource writes.
- GT-46–49: a working socket listener, followed by zero-arrival, correlated denials for every enabled origin class.
- GT-50–51: a working untrusted-certificate listener followed by verified-upstream TLS refusal.

The harness checks destination-side nonce arrivals and correlated boundary-denial events, rather than
inferring enforcement from browser errors. Target pages are synthetic; Chromium, TLS, smokescreen,
mitmproxy and firewall are real. No model, account, external target or credential is used. A separate
bridge supplies loopback-bound controller ports because this Docker host does not publish ports for
internal-only networks. Target traffic uses the owned internal network. This plumbing is not proof of
provider-side isolation. Both containers and both networks were confirmed removed.

Evidence: [JSON](evidence/gateway-evaluation-tls-canary.json),
[sanitized gateway log](evidence/gateway-evaluation-tls-canary.log). Failed/incomplete earlier attempts
are retained separately, including the nftables startup syntax error. The tested container image ID was
`sha256:be464fdf1659c38e0c3ee1779ec9e30e674536be1d744b800442ec413561b460`.

Runtime/policy unit tests also passed **19/19**. This does not close complete B03/B04/B09/B18/B19/B24 or
SELF gates, prove every resource fault, or authorize public launch.

## Fresh Modal preflight

The corrected immutable image `im-crpKoEFcOavFoxBLIAXNvH` then passed **6/6** deployed preflight checks:
matching policy hash, token-authenticated control, Chromium 156.0.8078.4 with `sandbox_on`, a fresh blank
context, confirmed VM termination (exit 137) and an independent empty run-tag inventory. VM
`sb-01M64EJH7D546VH7WDPYZ5QWGK` was destroyed. No target navigation, account or inference occurred.
See [preflight evidence](evidence/modal-gateway-preflight-2026-10-30-8482917f-dce3-496f-baed-a388feb4bf1c.json).
The check began at 2026-10-29 18:25:44 UTC (October 30, 02:25:44 PHT); startup took 15,243 ms. Its
controller used Node 26.12.1 and Modal JavaScript SDK 0.11.1; the image build used Modal Python SDK
1.6.3. Full component pins are in [VERSIONS.md](VERSIONS.md).

The first immutable image, `im-obOx9c4zyznfRn4lwG6bGy`, failed before browser readiness because the
nftables named-counter declarations lacked separators. The
[failed preflight](evidence/modal-gateway-preflight-2026-10-30-20d0d6d6-93ec-4fe8-a129-960cd49bf9fc.json)
is preserved: it records startup refusal and an independently confirmed empty run-tag inventory.
The corrected local 51/51 result and corrected cloud 6/6 result do not overwrite that failure.

The preflight used the separate `oddhound-browser-preflight` app, a read-only policy and a three-minute
hard lifetime so the live worker's orphan reaper would not race a diagnostic run without a ledger row.
This proves cloud startup/control/sandbox/destruction for the pinned candidate. It does not test the
live worker's reaper schedule, ownership rechecks, public ledgers, target authority matrix, all deployed
SELF gates or resource faults. Ownership and target workflows require their separate run evidence.

## Evidence limitations

Client TLS is intentionally intercepted using a fresh guest CA; original browser certificate behavior
is outside this profile's findings. Real upstream certificate verification remains enabled. Production
logs contain denied host/reason only, never paths, query values, bodies or socket data. Synthetic canary
mode adds UUID correlation and uses a mounted public CA certificate; it never mounts the fixture CA key.
The legacy controller egress-stat interface still returns placeholder request/byte zeroes; those are
unavailable measurements and must not be reported as measured traffic. Gateway enforcement uses its
own counters and protected kernel quotas independently of that reporting interface.
The evaluation image is not a general product runtime switch. Any result involving sockets must state
that capability was unavailable. Supplied-account screenshots are withheld by the separate credential
privacy slice; see [SUPPLIED_ACCOUNT_VERIFICATION.md](SUPPLIED_ACCOUNT_VERIFICATION.md).

Build with `docker build -f apps/browser/gateway/Dockerfile -t oddhound-gateway:evaluation .`.
Run `tests/lab/gateway-evaluation-canary.ts` using the pinned Node 26 controller. The separate authorized
Modal image build is `python infra/modal/gateway_evaluation_image.py`; only its final printed image ID
may be selected for the evaluation. These commands do not modify the deployed image setting.
