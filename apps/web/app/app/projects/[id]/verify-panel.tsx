'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/icons';
import { copyText } from '@/ui/copy';

type Method = 'dns_txt' | 'well_known_file' | 'meta_tag';

export function CopyField({ value, label, onCopied }: { value: string; label: string; onCopied?: () => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <div className="copy-field">
      <input className="input mono" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn" onClick={async () => { const r = await copyText(value); setState(r); if (r === 'copied') onCopied?.(); }}>
        {state === 'copied' ? <span className="pop-in" style={{ display: 'inline-flex', color: 'var(--ok)' }}><Icon name="tick" /></span> : <Icon name="copy" />} {state === 'copied' ? 'Copied' : 'Copy'}
      </button>
      <span role="status" className="sr-only">{state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed; select the text manually' : ''}</span>
    </div>
  );
}

export function VerifyPanel({ projectId, origin, token, verified, lastReason, lastChecked, apiOrigin = false, initialMethod = 'well_known_file', domainRecord, dnsToken }: {
  projectId: string; origin: string; token: string; verified: boolean; lastReason: string | null; lastChecked: string | null; apiOrigin?: boolean; initialMethod?: Method;
  /** Suggested domain-wide record name, e.g. _oddhound-verify.example.com. */ domainRecord?: string;
  /** Value to show for DNS (an API host shows its site's token so one record covers both). */ dnsToken?: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>(initialMethod);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ verified: boolean; reason: string } | null>(null);
  const host = new URL(origin).hostname;
  // After the token is copied (or a check fails), keep checking every 10 s for 3 minutes so the owner
  // never has to come back and press a button. Paused while the tab is hidden.
  const [watching, setWatching] = useState(false);
  const tries = useRef(0);
  async function check(quiet = false) {
    if (!quiet) setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(apiOrigin ? { method, origin } : { method }) });
    const r = await res.json().catch(() => null);
    if (r) setResult(r);
    if (!quiet) setBusy(false);
    if (r?.verified) { setWatching(false); router.refresh(); }
    else if (!quiet) { tries.current = 0; setWatching(true); }
    return Boolean(r?.verified);
  }
  const watch = () => { if (!verified) { tries.current = 0; setWatching(true); } };
  useEffect(() => {
    if (!watching) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (++tries.current > 18) { setWatching(false); return; }
      void check(true);
    }, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, method]);
  const reasons: Record<string, string> = {
    token_found: 'Token found. The site is verified.', token_not_found: 'No matching TXT record yet (DNS can take a few minutes).',
    token_mismatch: 'The file exists but does not contain this exact token.', token_not_in_head: 'No matching meta tag inside the page <head>.',
    blocked_address: 'This site resolves to a private or internal address, which Oddhound never scans.', https_required: 'Only HTTPS sites can be verified.',
    timeout: 'The site did not answer within 10 seconds.', response_too_large: 'The response was larger than 256 KB.',
  };
  const shown = result ?? (lastReason ? { verified, reason: lastReason } : null);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="row" style={{ gap: 8 }}>
        {verified ? <span className="badge badge-ok"><Icon name="check" />Verified</span> : <span className="badge badge-warn"><Icon name="alert" />Not verified</span>}
        {lastChecked && <span className="muted" style={{ fontSize: 12.5 }} suppressHydrationWarning>Last checked {new Date(lastChecked).toLocaleString()}. Checked again before every run.</span>}
      </div>
      <div className="segmented" role="group" aria-label="Verification method" style={{ justifySelf: 'start' }}>
        <button type="button" aria-pressed={method === 'well_known_file'} onClick={() => setMethod('well_known_file')}><Icon name="report" /> File</button>
        <button type="button" aria-pressed={method === 'meta_tag'} onClick={() => setMethod('meta_tag')}><Icon name="browser" /> Meta tag</button>
        <button type="button" aria-pressed={method === 'dns_txt'} onClick={() => setMethod('dns_txt')}><Icon name="globe" /> DNS TXT</button>
      </div>
      <div className="well fade-in" key={method} style={{ display: 'grid', gap: 10 }}>
        {method === 'well_known_file' && <>
          <p className="text-2" style={{ margin: 0, fontSize: 13.5 }}>Serve this exact text at <code className="break">{origin}/.well-known/oddhound-verify.txt</code> (HTTP 200, no redirect).</p>
          <CopyField value={token} label="Verification file contents" onCopied={watch} />
        </>}
        {method === 'meta_tag' && <>
          <p className="text-2" style={{ margin: 0, fontSize: 13.5 }}>Add this tag inside the <code>&lt;head&gt;</code> of <code className="break">{origin}/</code>.</p>
          <CopyField value={`<meta name="oddhound-verification" content="${token}">`} label="Meta tag" onCopied={watch} />
        </>}
        {method === 'dns_txt' && <>
          {domainRecord
            ? <p className="text-2" style={{ margin: 0, fontSize: 13.5 }}>Add one TXT record named <code className="break">{domainRecord}</code> with this value. It covers {apiOrigin ? 'the site and this host' : host} and every other host under that domain, so API hosts need nothing extra. (<code className="break">_oddhound-verify.{host}</code> works too.)</p>
            : <p className="text-2" style={{ margin: 0, fontSize: 13.5 }}>Add a TXT record named <code className="break">_oddhound-verify.{host}</code> with this value.</p>}
          <CopyField value={`oddhound-verify=${dnsToken ?? token}`} label="TXT record value" onCopied={watch} />
          <p className="status-line" style={{ color: 'var(--warn)', fontSize: 12.5, alignItems: 'flex-start' }}><Icon name="alert" />
            <span>On DNS hosts that create the site&apos;s address records automatically (for example Vercel DNS), any new record at or under <code className="break">{host}</code> can switch those off and take the site offline. Use the file or meta tag method there.</span></p>
        </>}
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={() => check()} disabled={busy} aria-busy={busy || undefined}><Icon name="shield" /> {busy ? 'Checking…' : 'Check now'}</button>
        {watching && !verified && <span className="status-line muted fade-in" style={{ fontSize: 12.5 }}><span className="pulse-dot" aria-hidden /> Watching for it: checking every 10 seconds. <button type="button" className="link-btn" onClick={() => setWatching(false)}>Stop</button></span>}
        {shown && <p role="status" className="status-line fade-in" key={shown.reason} style={{ color: shown.verified ? 'var(--ok)' : 'var(--bad)' }}>
          <Icon name={shown.verified ? 'check' : 'fail'} /> {reasons[shown.reason] ?? `Not verified (${shown.reason.replace(/_/g, ' ')}).`}</p>}
      </div>
    </div>
  );
}
