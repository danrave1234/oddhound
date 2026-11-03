'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/icons';
import { copyText } from '@/ui/copy';
import { CopyField } from './verify-panel';

/** GitHub Actions workflow: after a successful production deploy, retest open bugs (and gate on them) or explore again. */
function workflow(app: string) {
  return `# .github/workflows/oddhound.yml: test every production deploy with Oddhound
name: Oddhound
on: deployment_status
jobs:
  oddhound:
    if: github.event.deployment_status.state == 'success' && github.event.deployment.environment == 'Production'
    runs-on: ubuntu-latest
    timeout-minutes: 120
    env:
      ODDHOUND: ${app}
      ODDHOUND_DEPLOY_TOKEN: \${{ secrets.ODDHOUND_DEPLOY_TOKEN }}
      STRICT: 'false' # 'true': also wait for a new exploration and fail on a newly verified bug
    steps:
      - name: Retest open bugs, or explore again
        run: |
          set -eu
          auth="Authorization: Bearer $ODDHOUND_DEPLOY_TOKEN"
          for i in $(seq 1 20); do
            res=$(curl -sS -X POST -H "$auth" -H 'content-type: application/json' -d "{\\"sha\\":\\"$GITHUB_SHA\\"}" -w '\\n%{http_code}' "$ODDHOUND/api/hooks/deploy")
            code=$(echo "$res" | tail -n 1); body=$(echo "$res" | head -n -1)
            if [ "$code" = 201 ] || [ "$code" = 200 ]; then break; fi
            echo "$body"; [ "$code" = 429 ] || exit 1; sleep 30
          done
          [ "$code" = 201 ] || [ "$code" = 200 ] || exit 1
          run=$(echo "$body" | jq -r .runId); kind=$(echo "$body" | jq -r .kind)
          echo "Oddhound $kind: $(echo "$body" | jq -r .url)"
          if [ "$kind" = explore ] && [ "$STRICT" != true ]; then echo "Exploring in the background; results appear on the run page."; exit 0; fi
          while :; do
            gate=$(curl -fsS -H "$auth" "$ODDHOUND/api/hooks/deploy?run=$run")
            verdict=$(echo "$gate" | jq -r .verdict)
            [ "$verdict" != pending ] && break
            sleep 20
          done
          echo "$gate" | jq -r .summary
          [ "$verdict" = pass ]
`;
}

export function DeployHook({ projectId, hasHook, lastUsed }: { projectId: string; hasHook: boolean; lastUsed: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yamlState, setYamlState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const app = typeof window === 'undefined' ? '' : window.location.origin;

  async function call(method: 'POST' | 'DELETE') {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/hook`, { method });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Could not save.'); return; }
      setToken(method === 'POST' ? body.token : null);
      router.refresh();
    } catch { setError('Network error. Try again.'); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        Your CI calls Oddhound after each production deploy. If verified bugs are open, Oddhound retests them with the same pinned checks and the job passes only when every one is fixed. Otherwise it explores the site again with this project&apos;s last run settings and reports what is new, without blocking the deploy.
      </p>
      {token ? (
        <div className="well" style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13.5 }}><strong>1.</strong> Save this token as the GitHub Actions secret <code className="mono">ODDHOUND_DEPLOY_TOKEN</code>. It is shown only now.</p>
          <CopyField value={token} label="Deploy hook token" />
          <p style={{ margin: 0, fontSize: 13.5 }}><strong>2.</strong> Add this workflow to the repository. Vercel reports each deploy to GitHub, which starts it.</p>
          <pre className="brief" tabIndex={0} aria-label="GitHub Actions workflow" style={{ maxHeight: 220 }}>{workflow(app)}</pre>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={async () => setYamlState(await copyText(workflow(app)))}><Icon name={yamlState === 'copied' ? 'tick' : 'copy'} /> {yamlState === 'copied' ? 'Workflow copied' : 'Copy workflow'}</button>
            {yamlState === 'failed' && <span className="muted" style={{ fontSize: 12.5 }}>Clipboard unavailable; select the text above.</span>}
          </div>
        </div>
      ) : hasHook ? (
        <p className="row" style={{ margin: 0, gap: 8, fontSize: 13.5 }}><Icon name="check" /> Deploy hook active{lastUsed ? `, last called ${new Date(lastUsed).toLocaleString()}` : ', not called yet'}.</p>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className={hasHook ? 'btn' : 'btn btn-primary'} disabled={busy} onClick={() => call('POST')}><Icon name="plus" /> {hasHook ? 'Replace token' : 'Create deploy hook'}</button>
        {hasHook && <button type="button" className="btn" disabled={busy} onClick={() => call('DELETE')}>Remove hook</button>}
      </div>
      {error && <p role="alert" className="status-line" style={{ color: 'var(--bad)', margin: 0 }}><Icon name="fail" /> {error}</p>}
    </div>
  );
}
