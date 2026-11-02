import type { Db } from '../db/pool.ts';
import type { RunSession } from './session.ts';
import { appendEvent } from '../ledger/runs.ts';

/** Serialize with browser actions; capture does not race typing. Keep one replaceable frame, not a video archive. */
export class OwnerPreview {
  #last = 0;
  #lastReported = '';
  #lastReportedAt = 0;
  readonly db: Db; readonly runId: string; readonly session: RunSession; readonly enabled: boolean;
  constructor(db: Db, runId: string, session: RunSession, enabled: boolean) {
    this.db = db; this.runId = runId; this.session = session; this.enabled = enabled;
  }
  async update(force = false): Promise<void> {
    if (!this.enabled || (!force && Date.now() - this.#last < 1000)) return;
    this.#last = Date.now();
    let frame: Buffer | null = null;
    let reason: string | null = null;
    try {
      frame = await this.session.ownerPreview();
      if (frame.length > 2 * 1024 * 1024) { frame = null; reason = 'Preview exceeds the frame size limit.'; }
    } catch { reason = 'Capture paused: the page is changing or a protected frame could not be captured.'; }
    const state = frame ? 'available' : 'paused';
    const saved = await this.db.query<{ seq: string }>(`INSERT INTO run_owner_previews (run_id, seq, state, reason, frame) VALUES ($1,1,$2,$3,$4)
      ON CONFLICT (run_id) DO UPDATE SET seq = run_owner_previews.seq + 1, state = EXCLUDED.state,
      reason = EXCLUDED.reason, frame = EXCLUDED.frame, updated_at = now() RETURNING seq`,
    [this.runId, state, reason, frame]);
    // Metadata only: prove available frames and privacy pauses without archiving pixels or page text.
    const withheld = Boolean(this.session.screenshotsWithheld), signature = `${state}:${withheld}`;
    if (signature !== this.#lastReported || Date.now() - this.#lastReportedAt >= 15_000) {
      await appendEvent(this.db, this.runId, 'preview.state', { state, frameSeq: Number(saved.rows[0]!.seq),
        modelScreenshotsWithheld: withheld, ...(reason ? { reason } : {}) });
      this.#lastReported = signature; this.#lastReportedAt = Date.now();
    }
  }
}
