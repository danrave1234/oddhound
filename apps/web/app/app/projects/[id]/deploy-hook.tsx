'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/icons';
import { copyText } from '@/ui/copy';
import { CopyField } from './verify-panel';

/** GitHub Actions workflow: after a successful production deploy, retest open bugs (and gate on them) or explore again. */
function workflow(app: string, strict = false) {
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
      STRICT: '${strict}' # 'true': also wait for a new exploration and fail on a newly verified bug
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

  const [strict, setStrict] = useState(false);
  const yaml = workflow(app, strict);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        After each production deploy your CI calls Oddhound. Open verified bugs are retested with the same pinned checks, and the job passes only when every one is fixed. With none open, Oddhound explores again with this project&apos;s last run settings.
      </p>
      <ol className="hook-steps">
        <li className={hasHook || token ? 'done' : undefined}>
          <strong>Create the deploy hook</strong>
          {token ? <><span>Copy this token now; it is shown only once.</span><CopyField value={token} label="Deploy hook token" /></>
            : hasHook ? <span className="row" style={{ gap: 6 }}><Icon name="check" /> Active{lastUsed ? `, last called ${new Date(lastUsed).toLocaleString()}` : ', not called yet'}.</span>
            : <span>One token per project. Oddhound stores only its hash.</span>}
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className={hasHook ? 'btn btn-sm' : 'btn btn-primary btn-sm'} disabled={busy} onClick={() => call('POST')}><Icon name="plus" /> {hasHook ? 'Replace token' : 'Create deploy hook'}</button>
            {hasHook && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => call('DELETE')}>Remove hook</button>}
          </span>
        </li>
        <li>
          <strong>Save it as a GitHub secret</strong>
          <span>Repository → Settings → Secrets and variables → Actions → New secret named <code className="mono">ODDHOUND_DEPLOY_TOKEN</code>.</span>
        </li>
        <li>
          <strong>Add the workflow</strong>
          <span>Vercel reports each deploy to GitHub, which starts it.</span>
          <div className="segmented" role="group" aria-label="When the job fails" style={{ justifySelf: 'start' }}>
            <button type="button" aria-pressed={!strict} onClick={() => setStrict(false)}>Fail only on unfixed bugs</button>
            <button type="button" aria-pressed={strict} onClick={() => setStrict(true)}>Also fail on new bugs</button>
          </div>
          <pre className="brief" tabIndex={0} aria-label="GitHub Actions workflow" style={{ maxHeight: 220 }}>{yaml}</pre>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={async () => setYamlState(await copyText(yaml))}><Icon name={yamlState === 'copied' ? 'tick' : 'copy'} /> {yamlState === 'copied' ? 'Workflow copied' : 'Copy workflow'}</button>
            {yamlState === 'failed' && <span className="muted" style={{ fontSize: 12.5 }}>Clipboard unavailable; select the text above.</span>}
          </span>
        </li>
      </ol>
      {error && <p role="alert" className="status-line" style={{ color: 'var(--bad)', margin: 0 }}><Icon name="fail" /> {error}</p>}
    </div>
  );
}
