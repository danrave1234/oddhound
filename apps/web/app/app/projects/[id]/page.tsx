import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Shell } from '@/ui/shell';
import { StatusBadge } from '@/ui/status';
import { Icon } from '@/ui/icons';
import { SetupSteps } from '@/ui/setup-steps';
import { currentUser, db, isUuid } from '@/lib/server';
import { VerifyPanel } from './verify-panel';
import { ApiOrigins } from './api-origins';
import { suggestedDomainRecord } from '@core/verification/ownership.ts';
import { isIP } from 'node:net';

/** Domain-wide record suggestion; none for IP literals or single-label hosts. */
const domainRecord = (host: string) => (isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.') ? undefined : suggestedDomainRecord(host));
import { RunSetup } from './run-setup';
import { DeployHook } from './deploy-hook';
import { publicStatus } from '@/lib/status-data';
import { stopReasonText } from '@/ui/stop-reason';

export const dynamic = 'force-dynamic';

export default async function Project({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/app/projects/${id}`);
  if (!isUuid(id)) notFound();
  const project = (await db().query('SELECT id, name, origin, environment, description FROM projects WHERE id = $1 AND owner_id = $2', [id, user.id])).rows[0];
  if (!project) notFound();
  const sv = (await db().query('SELECT token, method, verified, last_reason, last_checked_at FROM site_verifications WHERE project_id = $1 AND origin = $2 ORDER BY revision DESC LIMIT 1', [id, project.origin])).rows[0];
  // Other first-party API origins the UI calls. Each needs its own ownership proof (MVP §17).
  const apis = (await db().query(`SELECT DISTINCT ON (origin) origin, token, method, verified, last_reason, last_checked_at FROM site_verifications
    WHERE project_id = $1 AND origin <> $2 ORDER BY origin, revision DESC`, [id, project.origin])).rows;
  const runs = (await db().query(`SELECT id, mode, status, stop_reason, created_at, (SELECT count(*) FROM findings f WHERE f.run_id = r.id AND f.verification = 'verified' AND f.category = 'verified_issue')::int AS issues
    FROM runs r WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20`, [id])).rows;
  const hook = (await db().query<{ last_used_at: Date | null }>('SELECT last_used_at FROM project_hooks WHERE project_id = $1', [id])).rows[0];
  const host = new URL(project.origin).hostname;
  const budget = sv.verified ? await publicStatus() : null;
  return (
    <Shell active="/app" user={user} toolbar={<div className="crumbs"><Link href="/app">Projects</Link><span className="muted">/</span><strong className="truncate">{project.name}</strong></div>}>
      <div className="stack content-medium">
        <div>
          <SetupSteps current={sv.verified ? 3 : 2} />
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div style={{ minWidth: 0 }}>
              <h1 className="h1 break">{project.name}</h1>
              <p className="row" style={{ marginTop: 8, gap: 8 }}>
                <span className="mono muted break">{project.origin}</span>
                <span className="chip">{project.environment === 'production' ? 'Production' : 'Staging'}</span>
              </p>
            </div>
          </div>
        </div>

        <section className="card card-pad" aria-labelledby="verify-h">
          <div className="step-card-head" style={{ marginBottom: 16 }}>
            <span className={`step-num${sv.verified ? ' done' : ''}`} aria-hidden>{sv.verified ? <Icon name="tick" /> : 2}</span>
            <div style={{ minWidth: 0 }}>
              <h2 id="verify-h" className="h2 break">Prove you own {host}</h2>
              {!sv.verified && <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>Pick one method and publish the value. Oddhound keeps checking once you copy it. Unverified sites can never be scanned.</p>}
            </div>
          </div>
          {sv.verified ? (
            <details className="disclosure">
              <summary><span className="chev"><Icon name="chevron" /></span><Icon name="shield" /> Verified. Oddhound checks it again before every run. <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>Method, token and API hosts</span></summary>
              <div className="disclosure-body">
              <VerifyPanel projectId={id} origin={project.origin} token={sv.token} verified={sv.verified} lastReason={sv.last_reason} lastChecked={sv.last_checked_at ? new Date(sv.last_checked_at).toISOString() : null}
              domainRecord={domainRecord(host)} />
                {<ApiOrigins projectId={id} siteOrigin={project.origin} siteToken={sv.token} apis={apis.map((a) => ({
              origin: a.origin as string, token: a.token as string, verified: Boolean(a.verified), lastReason: a.last_reason as string | null,
              lastChecked: a.last_checked_at ? new Date(a.last_checked_at).toISOString() : null,
              domainRecord: domainRecord(new URL(a.origin).hostname) }))} />}
              </div>
            </details>
          ) : (<>
          <VerifyPanel projectId={id} origin={project.origin} token={sv.token} verified={sv.verified} lastReason={sv.last_reason} lastChecked={sv.last_checked_at ? new Date(sv.last_checked_at).toISOString() : null}
            domainRecord={domainRecord(host)} />
          {<ApiOrigins projectId={id} siteOrigin={project.origin} siteToken={sv.token} apis={apis.map((a) => ({
            origin: a.origin as string, token: a.token as string, verified: Boolean(a.verified), lastReason: a.last_reason as string | null,
            lastChecked: a.last_checked_at ? new Date(a.last_checked_at).toISOString() : null,
            domainRecord: domainRecord(new URL(a.origin).hostname) }))} />}
          </>)}
        </section>

        <section className="card card-pad" aria-labelledby="setup-h" aria-disabled={!sv.verified || undefined}>
          <div className="step-card-head" style={{ marginBottom: sv.verified ? 18 : 0 }}>
            <span className={`step-num${sv.verified ? '' : ' locked'}`} aria-hidden>{sv.verified ? 3 : <Icon name="lock" />}</span>
            <div>
              <h2 id="setup-h" className="h2">Approve what Oddhound may do</h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>{sv.verified ? 'Safe defaults are filled in. Adjust anything, then start the run.' : 'Unlocks once the site is verified.'}</p>
            </div>
          </div>
          {sv.verified && <RunSetup projectId={id} environment={project.environment} availableRunUsd={budget?.availableRunUsd ?? 0} autoDraft />}
        </section>

        {sv.verified && (
          <section className="card card-pad" aria-labelledby="hook-h">
            <h2 id="hook-h" className="h2" style={{ marginBottom: 8 }}>Test every deploy</h2>
            <DeployHook projectId={id} hasHook={Boolean(hook)} lastUsed={hook?.last_used_at ? new Date(hook.last_used_at).toISOString() : null} />
          </section>
        )}

        <section className="card" aria-labelledby="runs-h">
          <div className="card-header"><h2 id="runs-h" className="h3"><Icon name="runs" /> Runs</h2><span className="muted tabular" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{runs.length ? `${runs.length} most recent` : ''}</span></div>
          {runs.length ? (
            <div className="table-wrap">
              <table className="grid"><thead><tr><th>Started</th><th>Type</th><th>Status</th><th>Verified issues</th></tr></thead><tbody>
                {runs.map((r) => (
                  <tr key={r.id}><td><Link href={`/runs/${r.id}`} className="tabular">{new Date(r.created_at).toLocaleString()}</Link></td><td>{r.mode === 'retest' ? 'Retest' : 'Exploration'}</td>
                    <td><span className="row" style={{ gap: 6 }}><StatusBadge value={r.status} />{r.stop_reason && <span className="muted" style={{ fontSize: 12.5 }}>{stopReasonText(r.stop_reason)}</span>}</span></td>
                    <td className="tabular">{r.issues}</td></tr>
                ))}
              </tbody></table>
            </div>
          ) : <div className="empty empty-sm"><p>No runs yet. Your first run will appear here.</p></div>}
        </section>
      </div>
    </Shell>
  );
}
