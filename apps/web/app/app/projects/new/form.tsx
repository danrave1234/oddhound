'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/icons';

/** What people paste ("site.com", "https://site.com/pricing") reduced to the origin Oddhound verifies. */
export function toOrigin(input: string): string {
  const raw = input.trim();
  if (!raw) return raw;
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).origin; } catch { return raw; }
}

export function NewProjectForm({ initialOrigin = '' }: { initialOrigin?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState<'staging' | 'production'>('staging');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const f = new FormData(e.currentTarget);
    const origin = toOrigin(String(f.get('origin') ?? ''));
    let name = String(f.get('name') ?? '').trim();
    if (!name) { try { name = new URL(origin).hostname; } catch { name = origin; } }
    const res = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, origin, environment: env, description: f.get('description'), stack: f.get('stack') ?? '' }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) router.push(`/app/projects/${body.projectId}`);
    else { setError(body.error ?? 'Could not create the project.'); setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 0 }}>
      <div className="form-section">
        <label className="field"><span>Site origin</span>
          <input className="input mono" name="origin" required defaultValue={initialOrigin} placeholder="https://staging.example.com" inputMode="url" autoComplete="url" autoFocus aria-describedby="origin-hint" />
          <small id="origin-hint">Paste any page of the site; Oddhound keeps just the address (for example https://example.com). Private or internal addresses are always refused.</small></label>
      </div>

      <div className="form-section">
        <div className="field">
          <span id="env-label">Is this staging or production?</span>
          <div className="segmented segmented-lg" role="group" aria-labelledby="env-label" style={{ justifySelf: 'start' }}>
            <button type="button" aria-pressed={env === 'staging'} onClick={() => setEnv('staging')}>Staging</button>
            <button type="button" aria-pressed={env === 'production'} onClick={() => setEnv('production')}>Production</button>
          </div>
          <div className={`note ${env === 'production' ? 'note-warn' : 'note-info'} fade-in`} key={env} style={{ boxShadow: 'none', padding: '10px 12px', marginTop: 4 }}>
            <span className="note-icon" style={{ width: 26, height: 26 }}><Icon name={env === 'production' ? 'alert' : 'info'} /></span>
            <small style={{ color: 'var(--text-2)', alignSelf: 'center' }}>{env === 'production'
              ? 'On production, Oddhound will not create or change data unless you explicitly allow test writes when starting a run.'
              : 'Recommended. With synthetic data, Oddhound can register test accounts and create, edit and cancel test records.'}</small>
          </div>
        </div>
      </div>

      <details className="disclosure form-section">
        <summary><span className="chev"><Icon name="chevron" /></span>Optional: describe the site <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>Muse Spark drafts this from your home page</span></summary>
        <div className="disclosure-body">
          <label className="field"><span>What does the site do? <span className="muted" style={{ fontWeight: 400 }}>— shown to the agent</span></span>
            <textarea className="textarea" name="description" maxLength={1000} placeholder="Visitors create an account, book a table, then view, edit or cancel bookings." /></label>
          <label className="field"><span>Main framework</span><input className="input" name="stack" maxLength={60} placeholder="next.js" aria-describedby="stack-hint" />
            <small id="stack-hint">Only used to attach version-aware docs to fix briefs.</small></label>
        </div>
      </details>

      {error && <p role="alert" className="status-line" style={{ color: 'var(--bad)', marginBottom: 12 }}><Icon name="fail" /> {error}</p>}
      <div className="sticky-actions">
        <button className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>{busy ? 'Creating…' : 'Continue to verification'}</button>
        <span className="muted" style={{ fontSize: 12.5 }}>Step 1 of 3</span>
      </div>
    </form>
  );
}
