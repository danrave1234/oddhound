import Link from 'next/link';
import { HoundMark, Icon } from '@/ui/icons';
import { Course } from '@/ui/course';
import { publicStatus } from '@/lib/status-data';
import { LIMITS, USD } from '@core/contracts/limits.ts';
import { loadLandingRun } from '@/lib/landing-data';
import { currentUser } from '@/lib/server';
import { TryDemoButton } from './try-demo-button';
import { ProofView } from './runs/[id]/proof-chain';

export const dynamic = 'force-dynamic';

// What a scripted test usually does, next to what the agent is allowed to try (run contract, MVP §17).
const BEYOND: { script: string; hound: string }[] = [
  { script: 'Fills the booking form once with sensible values', hound: 'Books for 0 guests, a name made of spaces, one character over the limit, a date in the past' },
  { script: 'Signs in as one test user', hound: 'Registers a second account and opens the first account’s records by ID' },
  { script: 'Runs at one desktop size', hound: 'Repeats the flow on a 390 px phone and checks the buttons can still be pressed' },
  { script: 'Follows the happy path', hound: 'Double-submits, presses Back mid-checkout, cancels and then edits' },
  { script: 'Reports pass or fail', hound: 'Replays each failure twice in fresh sessions and checks a valid case before calling it a bug' },
  { script: 'Has to be written, then kept in step with the UI', hound: 'Needs no script: each proven bug becomes a pinned check that runs again after every deploy' },
];

// The loop a developer who does not want to write tests actually runs. Each step names what they do.
const LOOP: { title: string; text: string }[] = [
  { title: 'Prove the site is yours', text: 'Add a DNS record, a file or a meta tag once. Oddhound re-checks it before every run.' },
  { title: 'Let it explore', text: 'It signs up with made-up accounts, saves, edits and tries the odd inputs. You write no test.' },
  { title: 'Paste the fix prompt', text: 'Each proven bug comes with steps, evidence and a prompt for your coding AI, plus a bug report for your tracker.' },
  { title: 'Deploy as usual', text: 'Your CI calls the deploy hook. Oddhound replays the same pinned checks, and the job passes only when every bug is fixed.' },
];

const usd = (n: number) => (n < 0.01 && n > 0 ? '< $0.01' : `$${n.toFixed(2)}`);

export default async function Landing() {
  const [status, user] = await Promise.all([publicStatus(), currentUser()]);
  const recorded = await loadLandingRun(status.replayRunId).catch(() => null);
  const demoReason = status.killSwitch ? 'Live runs are paused right now.' : !status.liveRunsAvailable ? 'Today’s public budget is used up.' : !status.demoConfigured ? 'The demo target is not configured on this deployment.' : null;
  const scanHref = user ? '/app/projects/new' : '/login?next=/app/projects/new';
  const runHref = recorded ? `/runs/${recorded.runId}?replay=1` : null;
  const f = recorded?.featured;
  return (
    <div className="landing">
      <header className="site-nav">
        <div className="site-nav-inner">
          <Link href="/" className="brand"><HoundMark size={28} /> Oddhound</Link>
          <nav aria-label="Site">
            <Link className="btn btn-ghost" href="/status">Status</Link>
            {user ? <Link className="btn" href="/app">Open workspace</Link> : <Link className="btn" href="/login"><Icon name="signin" /> Sign in</Link>}
          </nav>
        </div>
      </header>

      <main>
        <section className="wrap lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <h1 id="hero-title" className="display">Find what you didn&apos;t test.</h1>
            <p className="lead">
              Oddhound sends a Meta Muse Spark agent through your web app in a fresh, sandboxed browser. It signs up, edits and cancels like a
              curious user and tries what your test scripts skip. It reports a bug only after two fresh replays break your rule and a valid case still passes.
            </p>
            <div className="hero-ctas">
              <TryDemoButton primary disabled={Boolean(demoReason)} reason={demoReason} />
              <Link className="btn btn-lg" href={scanHref}><Icon name="sniff" /> Scan your site</Link>
            </div>
            <p className="hero-note">
              The demo target is Oddhound&apos;s own booking app with labelled defects. No account needed.
              {status.liveRunsAvailable ? <> <strong className="tabular">{usd(status.publicDailyLeftUsd)}</strong> of today&apos;s shared model budget is left.</> : ' Recorded runs stay available.'}
            </p>
          </div>

          {recorded && recorded.stops.length > 1 ? (
            <figure className="lp-course" aria-labelledby="course-caption">
              <figcaption id="course-caption" className="lp-course-head">
                <span className="lp-course-title">A recorded run on the demo app</span>
                {runHref && <Link href={runHref} className="lp-course-link">Open the run <Icon name="chevron" /></Link>}
              </figcaption>
              <Course stops={recorded.stops} width={560} height={recorded.stops.length > 5 ? 250 : 170}
                label={`The agent's route through ${recorded.places} pages; a cross marks each page where a verified finding was proven.`} />
              <table className="lp-sheet">
                <caption className="sr-only">Pages visited in order</caption>
                <tbody>
                  {recorded.stops.slice(1).map((s, i) => (
                    <tr key={s.key} className={s.failed ? 'is-failed' : undefined}>
                      <th scope="row" className="tabular">{i + 1}</th>
                      <td>{s.label}</td>
                      <td className="lp-sheet-mark">{s.failed ? <span><Icon name="fail" /> Rule broken here</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="lp-facts">
                <div><dt>Actions</dt><dd className="tabular">{recorded.actions}</dd></div>
                <div><dt>Verified bugs</dt><dd className="tabular">{recorded.verified}</dd></div>
                {recorded.minutes !== null && <div><dt>Minutes</dt><dd className="tabular">{recorded.minutes}</dd></div>}
                <div><dt>Model cost</dt><dd className="tabular">{recorded.offline ? '$0' : usd(recorded.spendUsd)}</dd></div>
              </dl>
              {recorded.offline && <p className="lp-course-note">This local recording used Oddhound&apos;s offline test double, not Meta inference.</p>}
            </figure>
          ) : (
            <div className="lp-course lp-course-empty"><p className="muted">No recorded run yet. Start the demo to make the first one.</p></div>
          )}
        </section>

        {f && (
          <section className="wrap lp-proof" aria-labelledby="proof-title">
            <div className="lp-proof-copy">
              <h2 id="proof-title" className="h1">One finding, start to finish</h2>
              <p className="lp-finding">{f.title}</p>
              {f.ruleText && <p className="lp-rule"><span>Your rule</span>{f.ruleText}</p>}
              <p className="lp-rule"><span>What happened</span>{f.observed}</p>
              <p className="muted">Every check below is a saved replay in a fresh browser. The assertion is pinned by its hash, so a retest after your fix runs exactly the same check.</p>
            </div>
            <div className="lp-proof-chain">
              <ProofView findingId={f.findingId} chain={f} heading="The proof" />
            </div>
          </section>
        )}

        <section className="wrap lp-beyond" aria-labelledby="beyond-title">
          <h2 id="beyond-title" className="h1">Where a test script stops</h2>
          <table className="lp-compare">
            <thead><tr><th scope="col">Your script</th><th scope="col">Oddhound also</th></tr></thead>
            <tbody>{BEYOND.map((r) => <tr key={r.script}><td>{r.script}</td><td>{r.hound}</td></tr>)}</tbody>
          </table>
        </section>

        <section className="wrap lp-beyond" aria-labelledby="loop-title">
          <h2 id="loop-title" className="h1">If you would rather ship than write tests</h2>
          <ol className="lp-loop">
            {LOOP.map((s) => <li key={s.title}><strong>{s.title}</strong><span>{s.text}</span></li>)}
          </ol>
        </section>

        <section className="wrap lp-limits" aria-labelledby="limits-title">
          <h2 id="limits-title" className="h1">Limits, stated plainly</h2>
          <dl>
            <div><dt>Which sites</dt><dd>Only sites you prove you own with a DNS record, a file or a meta tag. Ownership is checked again before every run, and private or internal addresses are refused.</dd></div>
            <div><dt>Which browser</dt><dd>A fresh, sandboxed Chromium for each run, with no Oddhound keys inside. Traffic goes through a filtering proxy, and the machine is destroyed when the run ends.</dd></div>
            <div><dt>What it costs</dt><dd>Each run reserves at most ${LIMITS.modelSpendPerRunMicros / USD} of model spend before any call. A daily ceiling and a kill switch protect the shared budget.</dd></div>
            <div><dt>What a result means</dt><dd>A verified bug comes with saved replays. &ldquo;No failures&rdquo; means none in the tested scope, never that the app is bug-free.</dd></div>
          </dl>
          <div className="row" style={{ gap: 10 }}>
            <Link className="btn btn-primary btn-lg" href={scanHref}><Icon name="sniff" /> Scan your site</Link>
            {runHref && <Link className="btn btn-ghost btn-lg" href={runHref}><Icon name="eye" /> Inspect a recorded run</Link>}
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="wrap">
          <span className="brand" style={{ fontSize: 13.5 }}><HoundMark size={20} /> Oddhound</span>
          <span className="row" style={{ gap: 16 }}>
            <Link href="/status">Service status</Link>
            {user ? <Link href="/app">Workspace</Link> : <Link href="/login">Sign in</Link>}
          </span>
        </div>
      </footer>
    </div>
  );
}
