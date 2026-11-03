# Oddhound: find what you didn't test

**General AI browser agents can report a bug. Oddhound proves one, and proves the fix.**

- Live app: https://danravekeh123--oddhound-web.us-east.modal.run
- Source (public): https://github.com/danrave1234/oddhound
- Demo video: _(link added at upload)_

## Why I built it

I ship small web apps on my own (payments, invoices, a memorial site, a water-station ledger) and I hate writing tests. So I built the tester I wanted. You paste your site. Oddhound reads it and drafts what to test, then a Meta Muse Spark agent explores it in a fresh sandboxed browser like a curious user: it signs up, saves, edits, and tries the odd inputs. It only calls something a bug after two fresh replays break a rule, and it hands my coding AI a fix prompt. After my next deploy, it replays the exact same check to prove the fix.

## Try it as a judge (no sign-in needed)

1. **A real bug on a real production site, found and proven fixed.** Open the owner's read-only share link (given in
   the submission form; share links are not published in the repository).
   On the Alaala memorial site, one condolence made of a single 1,200-character word made the memorial page
   **10,465 px wide on a 390 px phone**. Oddhound verified it with two fresh replays, the owner shipped a 16-line fix,
   and the retest (open it from the run) replayed the unchanged check twice: **Fixed**, no model call, $0.00.
2. **Run it yourself on the demo app.** On the home page press **Try the demo target**. It is Oddhound's own booking
   app with labelled defects; a run takes about 15 minutes. A signed-out run on Nov 3 verified 5 bugs (party size 0
   accepted, a whitespace-only name accepted, another account's booking visible by ID, a wrong guest total, a missing
   phone button) and 3 configuration issues, for $0.04 of model credit.
3. **Watch a recorded run play back:** the home page's **Watch a demo replay**, or
   https://danravekeh123--oddhound-web.us-east.modal.run/runs/69451626-a084-4c0c-9b48-56ec85dc8288?replay=1

Scanning your own site needs sign-in with GitHub and is invite-only during judging, because each run spends shared
model credit and reads the site's pages.

## What it does

- **Drafts the test plan from your site.** Muse Spark reads the verified site's public home page and suggests focus
  areas and business rules. For Alaala it proposed "Pasiyam date is 9 days after burial date" and "Abuloy total equals
  sum of ledger entries", for $0.0004.
- **Explores without a script.** Registers synthetic accounts, creates, edits and cancels records, tries boundary
  values, a second account, and a 390 px phone, inside an owner-approved contract.
- **Proves before reporting.** A finding is verified only when two fresh replays break the rule and, where one exists,
  a valid neighbouring case still passes. The assertion is pinned by its hash.
- **Hands off the fix.** Each bug comes with steps, evidence, a fix prompt for your coding AI, a bug report for your
  tracker, a Playwright test and a read-only share link.
- **Proves the fix.** Retest replays the same pinned check twice on the redeployed site. A per-project deploy hook
  runs this after every deploy in CI and fails the job until every open bug is fixed.
- **Reads like a release check, not a log.** A home page that lists what needs you (open bugs, a failed run, an
  unverified site); a retest that leads with Fixed or Not ready and a release note to copy; near-duplicate findings
  folded into one row; plain-English reasons for every early stop; an original icon set and type built for reading
  URLs and hashes.
- **Tells you what it could not reach.** Results lead with setup hints (an app on another subdomain, Google sign-in, a
  CAPTCHA) and a checklist of what it saw but did not test.

## How Meta models are used

Muse Spark 1.3 through Meta's API plans every exploration step through validated tool calls and drafts the test
plan from the home page. Trusted code, not the model, decides every verdict and builds the fix prompts, and
verification and retests make no model calls. Owner-site scans are designed for the Standard tier; during the
hackathon week the owner chose the Contributor tier for runs on their own sites to spend less credit. Muse Spark Open
fallbacks (Baseten, Fireworks) are configured but were not exercised.

## Real results this week

- **Alaala (memorial pages):** 1 verified bug (phone overflow), fixed by a 16-line commit, proven by retest.
- **SolarMatch (solar directory):** its home, browse and services pages show an error screen to every visitor.
  Oddhound flagged it; Vercel's logs trace it to two database migrations missing in production. A rerun to verify it
  formally is in progress.
- **PayTsek, Agos:** verified configuration issues (no Content-Security-Policy, pages can be framed).
- **EstabWeb, Billis:** no verified bugs. EstabWeb's app lives on another subdomain behind Google sign-in, which
  Oddhound now tells the owner up front. Billis exposed an agent loop that Oddhound now prevents.

## Architecture

Next.js web app, PostgreSQL (contracts, events, findings, leases, queues, spend ledger), a worker with separate lanes
for hour-long site runs and quick demos/retests, Direct Meta inference, and a fresh Modal sandbox per run with an
egress-filtered, secret-free Chromium that is destroyed afterwards.

## Safety and cost

Sites must be proven through DNS, a well-known file or a meta tag, and are re-checked before every run; private and
internal addresses are refused. Page text and pasted reports are fenced as untrusted data. Spend is reserved before
every model call: $10 per run, $25 public per day, $50 public lifetime, and a kill switch.

## Honest limits

- "No failures" means none in the tested scope, never a bug-free app.
- Verified-site scanning is invite-only during judging.
- The Alaala check had no neighbouring valid case, so its control is recorded as not run.
- The demo target cannot redeploy itself, so its retests run against a separately hosted corrected build.
- One hosted SolarMatch run was lost when Modal preempted the worker; the worker now runs non-preemptible.

## Built during the event, and with whom

Built Oct 27 to Nov 4, 2026 (see the commit history). Claude (Anthropic) led strategy and implemented most of the app,
the agent loop changes, the UI and the demo film; ChatGPT/Codex implemented the bug-report reproduction core; Muse Code
contributed strategy and an adversarial review of the report trust boundary. The demo film uses only recordings of
the deployed app and the live Alaala site, with a locally generated music bed.
