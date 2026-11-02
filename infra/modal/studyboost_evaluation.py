"""Owner-operated StudyBoost evaluation; does not deploy or replace the public app.

Uses the existing trusted worker image and its Secret, with only the current core source overlaid.
The browser receives no Secret. Run only after the separate gateway canaries pass.
Inspect: python -X utf8 -m modal run infra/modal/studyboost_evaluation.py
Execute: ... --mode run --gateway-image-id im-... (sealed local fixture credential required).
"""
import json
import os
import pathlib
import subprocess
from datetime import datetime, timezone, timedelta
import modal

ROOT = pathlib.Path(__file__).resolve().parents[2] if modal.is_local() else pathlib.Path('/app')
WORKER_IMAGE = 'im-dx4vcuDc6FcLEiojApWRCv'
app = modal.App('oddhound-studyboost-evaluation')
image = (modal.Image.from_id(WORKER_IMAGE)
         .add_local_dir(ROOT / 'packages', '/app/packages', copy=True, ignore=['**/node_modules/**', '**/__pycache__/**'])
         .add_local_file(ROOT / 'tests/e2e/studyboost-evaluation.ts', '/app/tests/e2e/studyboost-evaluation.ts', copy=True))

@app.function(image=image, secrets=[modal.Secret.from_name('oddhound-web')], cpu=1, memory=2048, timeout=75 * 60)
def evaluate(mode: str, gateway_image_id: str, account: dict | None = None):
    container_only = {'MODAL_SERVER_URL', 'MODAL_IDENTITY_TOKEN', 'MODAL_IDENTITY_TOKEN_FILE', 'MODAL_IS_REMOTE', 'MODAL_TASK_ID', 'MODAL_CONTAINER_ARGUMENTS_PATH', 'MODAL_REGION'}
    env = {k: v for k, v in os.environ.items() if k not in container_only}
    env.update({'NODE_ENV': 'production', 'ARTIFACT_STORE': 'db', 'META_BASE_URL': 'https://api.meta.ai/v1',
                'META_MODEL': 'muse-spark-1.3', 'META_REASONING_EFFORT': 'low',
                'MODAL_SERVER_URL': 'https://api.modal.com', 'HOME': '/home/node',
                'EVALUATION_GATEWAY_IMAGE': gateway_image_id, 'ODDHOUND_STUDYBOOST_EVALUATION': '1'})
    args = ['node', '/app/tests/e2e/studyboost-evaluation.ts']
    if mode in ('run', 'run-auth', 'run-broad'):
        if not account or not gateway_image_id.startswith('im-'):
            raise ValueError('Run requires the prepared account and a pinned gateway image')
        args.append('--run')
        if mode == 'run-auth':
            args.append('--auth-followup')
        if mode == 'run-broad':
            args.append('--broad-exploration')
    elif mode != 'inspect':
        raise ValueError('Unknown mode')
    proc = subprocess.Popen(args, cwd='/app', env=env, user='node', group='node', stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    proc.stdin.write(json.dumps(account) if mode in ('run', 'run-auth', 'run-broad') else '')
    proc.stdin.close()
    output = []
    for line in proc.stdout:
        # Node's harness sanitizes all payloads; never echo the input credential.
        if account and account.get('secret'):
            line = line.replace(account['secret'], '[REDACTED]')
        print(line, end='', flush=True)
        output.append(line)
    code = proc.wait()
    return {'exitCode': code, 'output': ''.join(output), 'workerImage': WORKER_IMAGE}

@app.local_entrypoint()
def main(mode: str = 'inspect', gateway_image_id: str = '', evidence_date: str = ''):
    evidence_date = evidence_date or datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    datetime.strptime(evidence_date, '%Y-%m-%d')
    account = None
    if mode in ('run', 'run-auth', 'run-broad'):
        # Decrypt in a local subprocess; capture in memory, never print or persist plaintext.
        script = "import{readFileSync}from'node:fs';import{decrypt}from'./packages/core/ledger/credentials.ts';process.stdout.write(decrypt(readFileSync('.data/studyboost-account.sealed','utf8')));"
        result = subprocess.run([str(ROOT / '.tools/node26/node.exe'), '--env-file=.env', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Cannot open the sealed local fixture credential')
        account = json.loads(result.stdout)
    result = evaluate.remote(mode, gateway_image_id, account)
    try:
        result['controllerImage'] = evaluate.info().image_info.image_id
    except Exception:
        result['controllerImage'] = None
    result['gatewayImage'] = gateway_image_id or None
    destination = ROOT / 'docs/evidence' / f'studyboost-{mode}-{evidence_date}.json'
    if destination.exists():
        # Preserve previous checks as well as completed runs before updating the latest pointer.
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        destination.with_name(f'{destination.stem}-previous-{stamp}.json').write_bytes(destination.read_bytes())
    destination.write_text(json.dumps(result, indent=2), encoding='utf-8')
    for line in result['output'].splitlines():
        if line.startswith('{'):
            event = json.loads(line)
            if event.get('event') == 'evaluation.admitted':
                archived = destination.with_name(f"studyboost-{mode}-{evidence_date}-{event['runId']}.json")
                archived.write_text(json.dumps(result, indent=2), encoding='utf-8')
                break
    print(f"Evaluation evidence saved: {destination}; exitCode={result['exitCode']}")
    if result['exitCode']:
        raise SystemExit(result['exitCode'])
