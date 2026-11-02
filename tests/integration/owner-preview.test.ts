import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { protectedPreview } from '../../packages/core/browser/protected-preview.ts';
import { readOwnerPreview } from '../../packages/core/artifacts/owner-preview.ts';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun } from '../../packages/core/ledger/runs.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { OwnerPreview } from '../../packages/core/agent/preview.ts';
import { RunSession } from '../../packages/core/agent/session.ts';
import { policyFromContract } from '../../packages/core/browser/scope.ts';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';

const db = getPool();
let browser: Browser;
beforeAll(async () => {
  await migrate(db);
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
  expect(await checkChromiumSandbox(browser)).toBe('sandbox_on');
});
afterAll(async () => { await browser?.close(); await closePool(); });

describe('protected owner preview', () => {
  it('continues owner capture when supplied credentials disable model screenshots', async () => {
    const target = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>Signed-in workspace</h1><input type="password" value="vault-test-secret">'));
    await new Promise<void>(r => target.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${(target.address() as { port: number }).port}`;
    const session = new RunSession(browser, policyFromContract(demoTargetContract(origin)), () => {});
    try {
      await (await session.page()).goto(origin);
      session.protectSecret('vault-test-secret', true);
      await expect(session.screenshot()).rejects.toThrow('withheld');
      expect((await session.ownerPreview()).length).toBeGreaterThan(2000);
      expect(session.screenshotsWithheld).toBe(true);
    } finally { target.close(); }
  });

  it('captures actual frames while masking revealed passwords, split reflected secrets and graphics', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const secrets = ['AAA-SECRET-123', 'BBB-SECRET-456'];
    const content = (s: string) => `<style>p {width:500px;height:60px} input {width:400px}</style><h1>Visible workspace</h1>
      <input type="text" value="${s}"><p>${s}</p><p><span>${s.slice(0, 6)}</span><span>${s.slice(6)}</span></p><canvas width="200" height="100"></canvas>`;
    await page.setContent(content(secrets[0]!));
    const unmasked = await page.screenshot({ type: 'jpeg', quality: 50 });
    const first = await protectedPreview(page, secrets);
    await page.setContent(content(secrets[1]!));
    const second = await protectedPreview(page, secrets);
    await writeFile('test-results/owner-preview-first.jpg', first);
    await writeFile('test-results/owner-preview-second.jpg', second);
    expect(first.equals(unmasked)).toBe(false);
    expect(first.equals(second)).toBe(true); // Different secrets produce identical masked pixels.
    expect(first.length).toBeGreaterThan(2000);
    expect(await page.locator('[data-oddhound-preview-mask]').count()).toBe(0);
    await page.close();
  });

  it('keeps one bounded frame, pauses honestly on capture failure, and denies nonowners/expiry/revocation', async () => {
    const owner = `preview-${randomUUID()}`, other = `preview-${randomUUID()}`;
    await db.query(`INSERT INTO "user" (id,name,email) VALUES ($1,'Owner',$3),($2,'Other',$4)`, [owner, other, `${owner}@example.test`, `${other}@example.test`]);
    const admitted = await admitRun(db, { principal: `user:${owner}`, ownerId: owner, projectId: null, mode: 'verified_site', contract: demoTargetContract(`https://${randomUUID()}.example`), spendAccount: 'development' });
    if (!admitted.ok) throw new Error(admitted.reason);
    const runId = admitted.runId;
    const page = await browser.newPage(); await page.setContent('<h1>Workspace</h1>');
    const frame = await protectedPreview(page, []);
    let fail = false;
    const producer = new OwnerPreview(db, runId, { screenshotsWithheld: true, ownerPreview: async () => { if (fail) throw new Error('synthetic failure with synthetic-password-do-not-log'); return frame; } } as RunSession, true);
    await producer.update(true); await producer.update(true);
    expect((await readOwnerPreview(db, runId, owner))?.equals(frame)).toBe(true);
    expect(await readOwnerPreview(db, runId, other)).toBeNull();
    expect(await readOwnerPreview(db, runId, null)).toBeNull();
    expect((await db.query('SELECT count(*)::int AS n FROM run_owner_previews WHERE run_id=$1', [runId])).rows[0].n).toBe(1);
    fail = true; await producer.update(true);
    expect(await readOwnerPreview(db, runId, owner)).toBeNull();
    expect((await db.query('SELECT state,frame FROM run_owner_previews WHERE run_id=$1', [runId])).rows[0]).toEqual({ state: 'paused', frame: null });
    fail = false; await producer.update(true);
    const previewEvents = (await db.query<{ payload: Record<string, unknown> }>("SELECT payload FROM run_events WHERE run_id=$1 AND type='preview.state' ORDER BY seq", [runId])).rows.map(row => row.payload);
    expect(previewEvents.map(event => event.state)).toEqual(['available', 'paused', 'available']);
    expect(previewEvents.map(event => event.frameSeq)).toEqual([1, 3, 4]);
    expect(previewEvents.every(event => event.modelScreenshotsWithheld === true)).toBe(true);
    expect(previewEvents.every(event => Object.keys(event).every(key => ['state', 'frameSeq', 'modelScreenshotsWithheld', 'reason'].includes(key)))).toBe(true);
    expect(JSON.stringify(previewEvents)).not.toContain('synthetic-password-do-not-log');
    expect(JSON.stringify(previewEvents)).not.toContain(frame.toString('base64'));
    await db.query('UPDATE "user" SET revoked=true WHERE id=$1', [owner]);
    expect(await readOwnerPreview(db, runId, owner)).toBeNull();
    await db.query('UPDATE "user" SET revoked=false WHERE id=$1', [owner]);
    await db.query("UPDATE run_owner_previews SET expires_at=now()-interval '1 second' WHERE run_id=$1", [runId]);
    expect(await readOwnerPreview(db, runId, owner)).toBeNull();
    await db.query('DELETE FROM runs WHERE id=$1', [runId]);
    await db.query('DELETE FROM "user" WHERE id=ANY($1)', [[owner, other]]);
    await page.close();
  });
});
