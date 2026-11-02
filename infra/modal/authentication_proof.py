"""Explicit owner-only login diagnostic, no deployment or inference."""
import json
import os
from pathlib import Path
import subprocess
import modal

ROOT = Path(__file__).resolve().parents[2] if modal.is_local() else Path('/app')
app = modal.App('oddhound-authentication-proof')
image = (modal.Image.from_id('im-dx4vcuDc6FcLEiojApWRCv')
         .add_local_dir(ROOT / 'packages', '/app/packages', copy=True, ignore=['**/node_modules/**', '**/__pycache__/**'])
         .add_local_file(ROOT / 'tests/e2e/studyboost-auth-probe.ts', '/app/tests/e2e/studyboost-auth-probe.ts', copy=True))

@app.function(image=image, secrets=[modal.Secret.from_name('oddhound-web')], timeout=300, memory=2048)
def probe(account: dict):
    container_only = {'MODAL_SERVER_URL','MODAL_IDENTITY_TOKEN','MODAL_IDENTITY_TOKEN_FILE','MODAL_IS_REMOTE','MODAL_TASK_ID','MODAL_CONTAINER_ARGUMENTS_PATH','MODAL_REGION'}
    env = {k:v for k,v in os.environ.items() if k not in container_only}
    env.update({'MODAL_SERVER_URL':'https://api.modal.com','HOME':'/home/node','NODE_ENV':'production',
                'EVALUATION_GATEWAY_IMAGE':'im-VFVycsDf9x78A5ZYAg47E0'})
    result = subprocess.run(['node','/app/tests/e2e/studyboost-auth-probe.ts'],cwd='/app',env=env,user='node',group='node',
                            input=json.dumps(account),capture_output=True,text=True,timeout=260)
    output = result.stdout.replace(account['secret'],'[redacted]')
    for line in output.splitlines():
        if line.startswith('AUTH_PROBE_RESULT '):
            return json.loads(line[len('AUTH_PROBE_RESULT '):])
    raise RuntimeError('Authentication probe failed without a sanitized result; private diagnostics withheld')

@app.local_entrypoint()
def main():
    script = "import{readFileSync}from'node:fs';import{decrypt}from'./packages/core/ledger/credentials.ts';process.stdout.write(decrypt(readFileSync('.data/studyboost-account.sealed','utf8')));"
    opened = subprocess.run([str(ROOT/'.tools/node26/node.exe'),'--env-file=.env','--input-type=module','-e',script],cwd=ROOT,capture_output=True,text=True)
    if opened.returncode: raise RuntimeError('Prepared account unavailable')
    result = probe.remote(json.loads(opened.stdout))
    result['controllerImage'] = image.object_id
    destination = ROOT/'docs/evidence'/f"studyboost-authentication-proof-2026-11-03-{result['id']}.json"
    with destination.open('x',encoding='utf8') as handle: json.dump(result,handle,indent=2)
    print(json.dumps({'evidence':str(destination),**result}))
    if not result.get('pass'): raise SystemExit(1)
