# Evaluation runtime versions

For the owner-only gateway evaluation on 2026-10-30 (PHT):

| Component | Version / pin |
| --- | --- |
| Local controller | Node 26.12.1 (`.tools/node26/node.exe`) |
| Guest Node | 26.13.0; `node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9` |
| Playwright | 1.64.1 |
| Chromium | 156.0.8078.4, local evaluation and fresh Modal preflight verdict `sandbox_on` |
| Browser base | `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` |
| mitmproxy | 12.3.1 standalone binary, SHA-256 `f7b4237f5702f6cd21357fe6e4680a7e905f8f9b816b872230d018ea696c34d5` |
| Gateway embedded Python / OpenSSL | 3.15.1 / 4.0.3 |
| smokescreen | commit `68e7b8218e226bc47d09ce705fdb8fed82145ceb`, trusted wrapper disabling upstream selection |
| Go builder | `golang:1.27-bookworm@sha256:972b4110ba0f47539a975c31e52c64765e1ff19f2d74469ae4a595c6676e80a5` |
| Local evaluated image | `sha256:be464fdf1659c38e0c3ee1779ec9e30e674536be1d744b800442ec413561b460` |
| Modal evaluated image | `im-crpKoEFcOavFoxBLIAXNvH`; fresh VM preflight 6/6, Chromium `sandbox_on`, destruction confirmed |
| Modal JavaScript SDK | 0.11.1 |
| Modal Python SDK | 1.6.3 |
| Provider/model in local canaries and cloud preflight | None |

Versions identify the separate opt-in candidate; they do not describe a silent deployment change.
See [gateway evidence and limits](GATEWAY_EVALUATION.md).

The [local TLS canary](evidence/gateway-evaluation-tls-canary.json) passed 51/51; the
[fresh cloud preflight](evidence/modal-gateway-preflight-2026-10-30-8482917f-dce3-496f-baed-a388feb4bf1c.json)
passed 6/6 with confirmed VM termination. The
[failed first cloud preflight](evidence/modal-gateway-preflight-2026-10-30-20d0d6d6-93ec-4fe8-a129-960cd49bf9fc.json)
for image `im-obOx9c4zyznfRn4lwG6bGy` remains preserved. These results do not certify target workflows,
Meta inference, every deployed SELF/resource gate or public launch.

## Attribution and exploration revision

The next explicit evaluation selects **`im-VFVycsDf9x78A5ZYAg47E0`**, adding native HTTP/1 and HTTP/2 gateway-error attribution. Its local image identifier is `sha256:ba04ff29ea56f83dcb23491719392fcde1d1b3fa876dc3a40a0b4eecd0de4431`. The original image above remains historical evidence; the default deployed runtime was not changed.

The revised image passed **58/58** local gateway checks and **6/6** fresh Modal preflight checks, with actual Chromium **156.0.8078.4**, `sandbox_on` and confirmed termination. [Cloud report](evidence/modal-gateway-preflight-2026-10-30-e92bfb63-b950-4861-bf9d-3e1ae38d14ca.json). Node, Playwright, gateway and SDK pins above are unchanged.

The updated UI production build uses Next.js **16.4.3**, React/React DOM **19.3.1** and Node **26.12.1**. Component tests use Vitest **5.0.5** and TypeScript **5.9.3**. These build and test tools do not establish a model-quality result; the actual provider/model is recorded with each live evaluation.


## November 2–3 evaluation and replay checks

See [testing report](TESTING_2026-11-02.md) for actual terminal evidence: Direct Meta muse-spark-1.3 Standard/low, Node26.12.1, Playwright1.64.1, Chromium156.0.8078.4 sandbox_on, gateway mitmproxy12.3.1. UI Next16.4.3 / React19.3.1 build passed. Controller im-WPs0wRf7Aja15SGWQESEMk; opt-in gateway im-VFVycsDf9x78A5ZYAg47E0. No public deployment/default-runtime change. Scripted providers are limited to the separate 283-test synthetic regressions.


## November 3 results dashboard

[Dashboard proof](RESULTS_DASHBOARD_2026-11-03.md): Node26.12.1, Next16.4.3, React19.3.1, Playwright1.64.1, Chromium156.0.8078.4 sandbox_on. Existing actual Meta recording displayed read-only; no new provider call, target traffic or deployment.
