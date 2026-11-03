# Oddhound: find what you didn't test

**General AI browser agents can report a bug. Oddhound proves one, and proves the fix.**
Built for the Meta Global AI Developer Hackathon (Indie Developer track), Oct 27 to Nov 4, 2026.

- **Live app:** https://danravekeh123--oddhound-web.us-east.modal.run (press **Try the demo target**, no sign-in)
- **Submission write-up:** [docs/SUBMISSION.md](docs/SUBMISSION.md) · **Honest status:** [docs/STATUS.md](docs/STATUS.md)

Oddhound is an active exploratory-testing agent for web apps, driven by **Meta Muse Spark**:

1. **Paste your site and prove you own it** once (a DNS record, a `/.well-known` file or a meta tag). Oddhound keeps
   checking until it sees the token, then Muse Spark reads the home page and drafts focus areas and business rules.
2. **Oddhound explores** in a fresh, isolated, secret-free browser: it signs up synthetic accounts, completes
   workflows, and tries boundary values, blank input, odd orderings, a second account and a 390 px phone.
3. **Every suspected rule violation is replayed independently**, twice, in fresh sessions (with a valid control where
   one exists), before it is called **verified**.
4. **Copy the fix prompt** into your coding AI, ship, then **retest**: Oddhound replays the exact, unchanged assertion.
   A deploy hook does this after every deploy in CI.

Highlights:

- **A real production bug, fixed and proven:** on the Alaala memorial site one 1,200-character condolence made pages
  10,465 px wide on a 390 px phone; verified by two replays, fixed in 16 lines, retest Fixed with no model call.
- **Demo target:** a signed-out run verified 5 seeded functional bugs and 3 configuration issues for $0.04; a retest
  on the corrected build marked every finding fixed with the assertion hash unchanged.
- **Tests:** 257 unit tests and 90 integration tests (vitest), 7 UI tests (node --test).
- **Deployed on Modal:** web, a worker with separate lanes for site runs and demos/retests, demo targets, and a fresh
  browser sandbox per run.

## Layout

```text
apps/fixture   demo target (Harbor Table) with five labelled defects and a --fixed build
apps/browser   secret-free per-run browser image: Playwright server (non-root, sandboxed Chromium), SSRF egress proxy, nftables
apps/worker    queue consumer (BullMQ 6 on PostgreSQL) + reapers for stale runs and orphan browser sandboxes
apps/web       Next.js 16 UI + API: landing, demo target, replay, projects, verification, run workspace, findings, reports, status
packages/core  contracts, ledgers (runs/spend/credentials), SSRF policy, ownership verification, Meta adapter,
               agent loop + tools, verifier (scenarios), reports (fix brief, Playwright export), Context7 (MCP v2)
infra/         Modal deployment (infra/modal/app.py), Playwright seccomp profile, earlier Fly configs (unused)
tests/         unit + integration (vitest), e2e lab harness, HTTP access checks, provider/Context7 smoke, no-Lucide lint
docs/spec      the shared planning documents this build follows
```

## Run locally

Requires Node 26, pnpm 11 and Docker.

```bash
pnpm install
cp .env.example .env                       # add META_API_KEY for real Meta inference; set ARTIFACT_DIR to an absolute path
node tests/lab/lab.ts up                   # builds images, starts Postgres and the demo target on an isolated network
node --env-file=.env packages/core/db/migrate.ts
npx vitest run                             # unit + integration tests (uses the oddhound_test database)
node --env-file=.env tests/e2e/run-e2e.ts  # full lab run with the offline test double
E2E_PROVIDER=meta node --env-file=.env tests/e2e/run-e2e.ts   # same with the real Meta model (~$0.15–0.25)
node --env-file=.env apps/worker/main.ts   # worker
cd apps/web && node scripts/next-with-env.mjs dev --port 3310 # web app at http://127.0.0.1:3310
```

## Licence and provenance

Original code written for this hackathon. `infra/docker/playwright-seccomp-profile.json` comes from the Playwright repository (Apache-2.0). Dependencies keep their own licences.
