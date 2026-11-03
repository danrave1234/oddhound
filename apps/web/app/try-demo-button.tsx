'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/icons';

/** Starts a sign-in-free demo-target run (landing button and workspace tile share this). A failed request never leaves the control stuck busy. */
export function useStartDemoRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/demo/runs', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { router.push(`/runs/${body.runId}`); return; }
      setError(body.error ?? 'Could not start a demo run.');
    } catch { setError('Could not reach Oddhound. Check your connection and try again.'); }
    setBusy(false);
  }
  return { start, busy, error };
}

export function TryDemoButton({ disabled, reason, primary = false }: { disabled: boolean; reason: string | null; primary?: boolean }) {
  const { start, busy, error } = useStartDemoRun();
  const message = error ?? (disabled ? reason : '');
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <button className={`btn btn-lg${primary ? ' btn-primary' : ''}`} onClick={start} disabled={disabled || busy} aria-describedby="demo-msg" aria-busy={busy || undefined}>
        <Icon name="play" /> {busy ? 'Starting a fresh browser…' : 'Try the demo target'}
      </button>
      <span id="demo-msg" role="status" style={{ fontSize: 12.5, color: error ? 'var(--bad)' : 'var(--text-3)', maxWidth: 260 }}>{message}</span>
    </span>
  );
}
