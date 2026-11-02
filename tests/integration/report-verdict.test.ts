// Real worker ledger pipeline with local PostgreSQL; no browser provision and no model call.
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, closePool } from '../../packages/core/db/pool.ts';
import { migrate } from '../../packages/core/db/migrate.ts';
import { admitRun } from '../../packages/core/ledger/runs.ts';
import { demoTargetContract } from '../../packages/core/contracts/contract.ts';
import { executeRun } from '../../packages/core/agent/execute-run.ts';
import { LocalBrowserRuntime } from '../../packages/core/browser/runtime.ts';

const db = getPool();
let server: Server;
let origin = '';
let port = 0;

beforeAll(async () => {
  await migrate(db);
  await db.query(`UPDATE settings SET value = 'false'::jsonb WHERE key = 'kill_switch'`);
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><body><main><h1>Report fixture</h1><p>No defect here.</p></main></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server?.close();
  await closePool();
});

describe('durable report verdict', () => {
  it('emits exactly one trusted verdict when a reported run ends before verification', async () => {
    await db.query('TRUNCATE runs CASCADE');
    const contract = { ...demoTargetContract(origin), report: 'Saving a note loses its text.' };
    const admitted = await admitRun(db, {
      principal: `test:report-verdict:${Date.now()}`,
      ownerId: null,
      projectId: null,
      mode: 'demo_target',
      contract,
      spendAccount: 'development',
    });
    if (!admitted.ok) throw new Error(admitted.reason);

    const status = await executeRun({
      db,
      runtime: new LocalBrowserRuntime(),
      providers: [],
      workerId: 'report-verdict-test',
      allowOfflineTestDouble: true,
      lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) },
    }, admitted.runId);
    expect(status).toBe('blocked');

    const verdicts = (await db.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM run_events WHERE run_id = $1 AND type = 'report.verdict' ORDER BY seq`, [admitted.runId],
    )).rows;
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.payload).toMatchObject({
      verdict: 'not_reproduced',
      text: 'Not reproduced: the run ended before verification',
      actions: 0,
      pages: 0,
      candidates: 0,
    });
  }, 30_000);

  it('emits no report verdict when the contract has no report', async () => {
    await db.query('TRUNCATE runs CASCADE');
    const admitted = await admitRun(db, {
      principal: `test:no-report-verdict:${Date.now()}`,
      ownerId: null,
      projectId: null,
      mode: 'demo_target',
      contract: demoTargetContract(origin),
      spendAccount: 'development',
    });
    if (!admitted.ok) throw new Error(admitted.reason);

    expect(await executeRun({
      db,
      runtime: new LocalBrowserRuntime(),
      providers: [],
      workerId: 'no-report-verdict-test',
      allowOfflineTestDouble: true,
      lab: { allowedEndpoints: new Set([`127.0.0.1:${port}`]) },
    }, admitted.runId)).toBe('blocked');

    expect((await db.query(
      `SELECT 1 FROM run_events WHERE run_id = $1 AND type = 'report.verdict'`, [admitted.runId],
    )).rowCount).toBe(0);
  }, 30_000);
});
