'use client';
// The proof chain of a finding, drawn as a short course: each saved check is a control on the route.
// Everything shown comes from /api/findings/[id]/proof, which reads stored executions only.
import { useEffect, useState } from 'react';
import { Icon } from '@/ui/icons';
import { copyText, fetchText } from '@/ui/copy';

type Leg = { stage: 'verify' | 'retest'; role: 'replay' | 'control'; n: number; runId: string; outcome: string; reading: string; pinned: boolean; observed: string; evidenceIds: string[]; at: string };
export type Chain = {
  assertionHash: string | null; unchanged: boolean; ruleId: string | null; ruleText: string | null;
  legs: Leg[]; verdict: { state: string; text: string }; retestOrigins: Record<string, string>;
};

const legName = (l: Leg) => l.stage === 'verify'
  ? (l.role === 'replay' ? `Replay ${l.n}` : 'Valid case')
  : (l.role === 'replay' ? `Retest ${l.n}` : 'Valid case');
const host = (origin: string | undefined) => { if (!origin) return 'the retested build'; try { return new URL(origin).host; } catch { return origin; } };
const tone = (l: Leg) => (l.outcome === 'failed' ? (l.role === 'replay' ? 'broke' : 'bad') : l.outcome === 'passed' ? 'held' : 'unclear');
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The mark drawn inside a control circle: a cross where the rule broke, a tick where it held. */
function Mark({ kind }: { kind: string }) {
  return (
    <svg className={`pc-mark pc-${kind}`} width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="9" />
      {kind === 'broke' || kind === 'bad' ? <path d="M7.4 7.4l7.2 7.2M14.6 7.4l-7.2 7.2" />
        : kind === 'held' ? <path d="M7 11.4l2.7 2.7L15.2 8.4" />
        : <path d="M7.5 11h7" />}
    </svg>
  );
}

export function ProofChain({ findingId }: { findingId: string }) {
  const [chain, setChain] = useState<Chain | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setChain(null); setError(false);
    fetch(`/api/findings/${findingId}/proof`).then((r) => (r.ok ? r.json() : Promise.reject())).then((c) => { if (live) setChain(c); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [findingId]);
  if (error) return <p className="muted">The proof record could not be loaded.</p>;
  if (!chain) return <div className="pc-skeleton" aria-busy="true" aria-label="Loading proof" />;
  return <ProofView key={findingId} findingId={findingId} chain={chain} />;
}

/** Renders a loaded chain. Also used on the landing page with a chain read on the server. */
export function ProofView({ findingId, chain, heading = 'How this was proven' }: { findingId: string; chain: Chain; heading?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed' | 'unavailable'>('idle');
  const [receipt, setReceipt] = useState<string | null>(null);

  async function copyReceipt() {
    let text: string;
    try { text = receipt ?? await fetchText(`/api/findings/${findingId}/proof?format=receipt`); } catch { setCopy('unavailable'); return; }
    setReceipt(text);
    setCopy(await copyText(text));
  }

  if (!chain.legs.length) return <p className="muted">No replays were recorded for this finding.</p>;

  // Group retest legs by the run that made them, so each retest shows which build it checked.
  let lastRun = '';
  return (
    <section className="pc" aria-label="Proof chain">
      <div className="pc-head">
        <h3 className="section-title">{heading}</h3>
        {chain.assertionHash && (
          <span className={`pc-hash${chain.unchanged ? '' : ' pc-hash-changed'}`} title={chain.assertionHash}>
            <Icon name="lock" /> Check {chain.assertionHash.slice(0, 8)} {chain.unchanged ? 'unchanged' : 'changed'}
          </span>
        )}
      </div>
      <ol className="pc-course">
        {chain.legs.map((l, i) => {
          const header = l.stage === 'retest' && l.runId !== lastRun ? host(chain.retestOrigins[l.runId]) : null;
          if (l.stage === 'retest') lastRun = l.runId;
          const expanded = open === i;
          return (
            <li key={`${l.runId}-${i}`} className={`pc-leg pc-${tone(l)}${l.stage === 'retest' ? ' pc-retest' : ''}`}>
              {header && <div className="pc-target"><Icon name="retest" /> Retested on {header}</div>}
              <button type="button" className="pc-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i)}>
                <Mark kind={tone(l)} />
                <span className="pc-name">{legName(l)}</span>
                <span className="pc-reading">{l.reading}</span>
                <time className="pc-time tabular" dateTime={l.at} suppressHydrationWarning>{time(l.at)}</time>
              </button>
              {expanded && (
                <div className="pc-detail fade-in">
                  {l.observed && <p>{l.observed}</p>}
                  {!l.pinned && <p className="pc-warn"><Icon name="alert" /> This check ran a different assertion, so it does not count.</p>}
                  {l.evidenceIds.length > 0 && <div className="pc-shots">{l.evidenceIds.slice(0, 3).map((id) => <img key={id} src={`/api/artifacts/${id}`} alt={`Screenshot from ${legName(l).toLowerCase()}`} loading="lazy" />)}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className={`pc-verdict pc-v-${chain.verdict.state}`}>{chain.verdict.text}</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-sm" onClick={copyReceipt}><Icon name={copy === 'copied' ? 'tick' : 'copy'} /> {copy === 'copied' ? 'Receipt copied' : 'Copy fix receipt'}</button>
        <span role="status" className="muted" style={{ fontSize: 12.5 }}>{copy === 'copied' ? 'Markdown for your pull request description.' : copy === 'failed' ? 'Clipboard unavailable; the receipt is shown below.' : copy === 'unavailable' ? 'The receipt could not be loaded. Try again.' : ''}</span>
      </div>
      {copy === 'failed' && receipt && <pre className="brief" tabIndex={0} aria-label="Fix receipt">{receipt}</pre>}
    </section>
  );
}
