'use client';
import { useState } from 'react';
import { Icon } from '@/ui/icons';

export type PreviewState = { seq: string; state: string; reason: string | null; updated_at: string } | null;
export function OwnerPreview({ runId, preview, active }: { runId: string; preview: PreviewState; active: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const available = preview?.state === 'available' && failed !== preview.seq;
  return <div className="frame-body" style={{ position: 'relative', minHeight: 200 }}>
    {available ? <img src={`/api/runs/${runId}/preview?seq=${preview.seq}`} alt="Protected owner preview of the testing browser" onError={() => setFailed(preview.seq)} />
      : <span className="deck-frame-empty"><Icon name="browser" size={24} /><span>{preview?.reason ?? (failed ? 'Preview unavailable. Testing activity is shown separately.' : active ? 'Preparing protected browser capture…' : 'No protected preview was recorded for this run.')}</span></span>}
    {preview && <span className="muted" style={{ display: 'block', padding: '6px 12px', fontSize: 12 }} suppressHydrationWarning>Protected sampled frame · {new Date(preview.updated_at).toLocaleTimeString()}{active ? ' · updates after browser actions' : ' · run ended'}</span>}
  </div>;
}
