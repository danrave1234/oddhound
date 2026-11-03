'use client';
import { Icon } from '@/ui/icons';
import { useStartDemoRun } from '@/app/try-demo-button';

/** Quick-start tile that starts a demo-target run (same endpoint and limits as the landing button). */
export function QuickDemoTile({ disabledReason }: { disabledReason: string | null }) {
  const { start, busy, error } = useStartDemoRun();
  const note = error ?? disabledReason;
  return (
    <button type="button" className="quick-tile" onClick={start} disabled={Boolean(disabledReason) || busy} aria-busy={busy || undefined} style={{ font: 'inherit', textAlign: 'left', cursor: disabledReason ? 'not-allowed' : 'pointer', opacity: disabledReason ? 0.7 : 1 }}>
      <span className="tile"><Icon name="play" /></span>
      <span className="qt-body"><strong>{busy ? 'Starting a fresh browser…' : 'Try the demo target'}</strong>
        <span role="status" style={error ? { color: 'var(--bad)' } : undefined}>{note ?? 'Oddhound’s own app with labelled defects'}</span></span>
    </button>
  );
}
