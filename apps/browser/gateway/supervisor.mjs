// Explicit evaluation profile: protected startup/expiry/traffic fence, no user or model code.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, chown, chmod, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

const base = '/run/oddhound-evaluation';
const raw = process.env.ODDHOUND_EVALUATION_POLICY ?? '';
const wsPath = process.env.RUN_WS_PATH ?? '';
const lab = process.env.ODDHOUND_EVALUATION_LAB === '1';
const children = [];
let closing = false;
let timer;
let startupStage = 'identity';
const log = (value) => console.log(JSON.stringify(value));
const uid = (name) => Number(execFileSync('id', ['-u', name], { encoding: 'utf8' }).trim());
const pw = uid('pwuser'), proxyUid = uid('oddproxy'), gatewayUid = uid('oddgateway');
const mark = 0x0dd002;

function killGroup(child) { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} } }
function shutdown(code, reason) {
  if (closing) return;
  closing = true; if (timer) clearInterval(timer);
  if (reason) log({ egress: 'exhausted', reason });
  // Independent stop fence comes before process closure. Failure still closes every child.
  try { execFileSync('nft', ['add', 'element', 'inet', 'oddhound_eval_wire', 'closed', `{ ${mark} }`]); } catch {}
  for (const child of children) killGroup(child);
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0, 'runtime_stopped'));
process.on('SIGINT', () => shutdown(0, 'runtime_stopped'));

function service(userId, cmd, args, env = {}, forward = false) {
  const child = spawn('setpriv', [`--reuid=${userId}`, `--regid=${userId}`, '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all', '--bounding-set=-all', cmd, ...args], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: userId === pw ? '/home/pwuser' : '/tmp', ...env },
  });
  children.push(child);
  // Only gateway/browser emit structured, bounded and intentionally sanitized JSON. Smokescreen's
  // native logs are not forwarded: they can include target URLs. No stderr reaches the run log.
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    if (!forward) return;
    buffer += chunk.toString();
    if (buffer.length > 16_384) return shutdown(70, 'gateway_log_bound');
    for (;;) {
      const i = buffer.indexOf('\n'); if (i < 0) break;
      const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
      try { const j = JSON.parse(line); if (j.egress || j.browserServer) log(j); } catch {}
    }
  });
  child.stderr.on('data', () => {});
  child.once('error', () => shutdown(70, 'gateway_service_error'));
  child.once('exit', (code) => { if (!closing) shutdown(code === 0 ? 0 : 70, code === 0 ? 'browser_closed' : 'gateway_service_exited'); });
  return child;
}

async function command(userId, cmd, args) {
  const child = spawn('setpriv', [`--reuid=${userId}`, `--regid=${userId}`, '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all', '--bounding-set=-all', cmd, ...args], {
    stdio: ['ignore', 'ignore', 'ignore'], env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/pwuser' },
  });
  const code = await new Promise((done, reject) => { child.once('exit', done); child.once('error', reject); });
  if (code !== 0) throw new Error('Protected startup command failed');
}

try {
  if (process.getuid() !== 0 || !/^\/[A-Za-z0-9_-]{24,}$/.test(wsPath)) throw new Error('Invalid startup');
  startupStage = 'policy';
  const policy = JSON.parse(raw);
  const keys = new Set(['version', 'runId', 'primaryOrigin', 'apiOrigins', 'writes', 'deniedPathPrefixes', 'deniedPathKeywords', 'deniedReadKeywords', 'reservedHosts', 'expiresAt', 'limits']);
  if (Object.keys(policy).some((key) => !keys.has(key)) || policy.version !== 1 || typeof policy.runId !== 'string' || !policy.runId || policy.runId.length > 100) throw new Error('Invalid policy');
  const validOrigin = (value) => { try { const u = new URL(value); return u.protocol === 'https:' && u.origin === value && !u.username && !u.password && (!u.port || u.port === '443') && !isIP(u.hostname); } catch { return false; } };
  if (!validOrigin(policy.primaryOrigin) || !Array.isArray(policy.apiOrigins) || policy.apiOrigins.length > 4 || !policy.apiOrigins.every(validOrigin) || typeof policy.writes !== 'boolean') throw new Error('Invalid origin scope');
  for (const key of ['deniedPathPrefixes', 'deniedPathKeywords']) if (!Array.isArray(policy[key]) || policy[key].length > 60 || !policy[key].every((x) => typeof x === 'string' && x.length <= 300)) throw new Error('Invalid denies');
  if (policy.deniedReadKeywords !== undefined && (!Array.isArray(policy.deniedReadKeywords) || !policy.deniedReadKeywords.every((x) => policy.deniedPathKeywords.includes(x)))) throw new Error('Invalid read denies');
  if (policy.reservedHosts !== undefined && (!Array.isArray(policy.reservedHosts) || policy.reservedHosts.length > 20 || !policy.reservedHosts.every((x) => typeof x === 'string' && /^[a-z0-9.-]+$/.test(x)))) throw new Error('Invalid reserved hosts');
  if (!Number.isFinite(policy.expiresAt) || policy.expiresAt <= Date.now() || policy.expiresAt > Date.now() + 65 * 60_000) throw new Error('Invalid expiry');
  for (const [key, max] of Object.entries({ requests: 30_000, concurrent: 6, resourceBytes: 8 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024 })) {
    if (!Number.isSafeInteger(policy.limits?.[key]) || policy.limits[key] < 1 || policy.limits[key] > max) throw new Error('Invalid resource limits');
  }
  const dns = [...new Set((await readFile('/etc/resolv.conf', 'utf8')).split('\n').map((line) => /^nameserver\s+(\S+)/.exec(line)?.[1]).filter((ip) => ip && isIP(ip)))];
  if (!dns.length) throw new Error('No exact DNS resolver');
  startupStage = 'directories';
  await mkdir(base, { mode: 0o755 });
  await mkdir(`${base}/ca`, { mode: 0o700 }); await chown(`${base}/ca`, gatewayUid, gatewayUid);
  await mkdir(`${base}/state`, { mode: 0o755 }); await chown(`${base}/state`, gatewayUid, gatewayUid);
  await mkdir(`${base}/control`, { mode: 0o755 });
  await writeFile(`${base}/policy.json`, raw, { mode: 0o440 }); await chown(`${base}/policy.json`, 0, gatewayUid);
  const cap = policy.limits.totalBytes;
  const dnsRules = dns.map((ip) => `meta skuid ${proxyUid} ${isIP(ip) === 6 ? 'ip6' : 'ip'} daddr ${ip} meta l4proto { tcp, udp } ct original proto-dst 53 accept`).join('\n');
  const rules = `table inet oddhound_eval {
 chain output { type filter hook output priority 0; policy accept;
  ct state established,related accept
  meta skuid ${pw} ip daddr 127.0.0.1 tcp dport 8080 accept
  meta skuid ${pw} counter drop
  meta skuid ${gatewayUid} ip daddr 127.0.0.1 tcp dport 4750 accept
  meta skuid ${gatewayUid} counter drop
  ${dnsRules}
  meta skuid ${proxyUid} ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4, 240.0.0.0/4 } counter drop
  meta skuid ${proxyUid} ip6 daddr ::/0 counter drop
  meta skuid ${proxyUid} tcp dport { 80, 443 } accept
  meta skuid ${proxyUid} counter drop
 }
}
table inet oddhound_eval_wire {
 quota rx_budget { over ${cap} bytes; }
 quota tx_budget { over ${cap} bytes; }
 counter rx_pass { }
 counter tx_pass { }
 counter rx_drop { }
 counter tx_drop { }
 counter fence_drop { }
 set closed { type mark; }
 chain mark_upstream { type filter hook output priority -10; policy accept;
  meta skuid ${proxyUid} ip daddr != 127.0.0.0/8 ct mark set ${mark}
  meta skuid ${proxyUid} ip6 daddr != ::1 ct mark set ${mark}
 }
 chain bounded_output { type filter hook output priority -5; policy accept;
  ct mark @closed counter name fence_drop drop
  ct mark ${mark} quota name tx_budget counter name tx_drop drop
  ct mark ${mark} counter name tx_pass
 }
 chain bounded_input { type filter hook input priority -5; policy accept;
  ct mark @closed counter name fence_drop drop
  ct mark ${mark} quota name rx_budget counter name rx_drop drop
  ct mark ${mark} counter name rx_pass
 }
}`;
  startupStage = 'firewall';
  await writeFile(`${base}/firewall.nft`, rules, { mode: 0o600 });
  try { execFileSync('nft', ['-f', `${base}/firewall.nft`]); }
  catch (error) {
    // The generated rules contain only fixed policy limits, local UIDs and resolver addresses.
    if (lab) log({ labDiagnostic: 'firewall_rejected', details: String(error.stderr ?? '').slice(0, 4000) });
    throw error;
  }
  log({ nftables: 'applied' });
  await writeFile(`${base}/smokescreen.yaml`, `ip: 127.0.0.1\nport: 4750\nallow_missing_role: true\nacl_file: /opt/oddhound/gateway/acl.yaml\nconnect_timeout: 10s\ndns_timeout: 5s\nidle_timeout: 60s\nexit_timeout: 1s\nread_header_timeout: 10s\nread_timeout: 60s\nwrite_timeout: 30s\nmax_concurrent_requests: ${policy.limits.concurrent}\nmax_concurrent_connect_tunnels: ${policy.limits.concurrent}\ndeny_ranges:\n  - 0.0.0.0/8\n  - 100.64.0.0/10\n  - 169.254.0.0/16\n  - 192.0.0.0/24\n  - 192.0.2.0/24\n  - 198.18.0.0/15\n  - 198.51.100.0/24\n  - 203.0.113.0/24\n  - 224.0.0.0/4\n  - 240.0.0.0/4\n  - ::/0\n`, { mode: 0o444 });
  startupStage = 'smokescreen';
  service(proxyUid, '/usr/local/bin/oddhound-smokescreen', ['--config-file', `${base}/smokescreen.yaml`]);
  let ready = false;
  for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:4750/healthcheck'); ready = true; break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (!ready) throw new Error('Proxy readiness failed');
  const gatewayArgs = ['--mode', 'upstream:http://127.0.0.1:4750@127.0.0.1:8080', '--set', `confdir=${base}/ca`, '--set', 'connection_strategy=lazy', '--set', 'ssl_insecure=false', '--set', 'rawtcp=false', '--set', 'http3=false', '--set', 'body_size_limit=8m', '--set', 'store_streamed_bodies=false', '--set', 'flow_detail=0', '--set', 'termlog_verbosity=error', '-s', '/opt/oddhound/gateway/policy.py'];
  startupStage = 'gateway';
  if (lab) { await readFile('/evaluation-trust/ca.pem'); gatewayArgs.push('--set', 'ssl_verify_upstream_trusted_ca=/evaluation-trust/ca.pem'); }
  service(gatewayUid, '/opt/mitmproxy/mitmdump', gatewayArgs, { ODDHOUND_EVALUATION_LAB: lab ? '1' : '0' }, true);
  ready = false;
  for (let i = 0; i < 150; i++) { try { if (JSON.parse(await readFile(`${base}/state/state.json`, 'utf8')).ready) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 100)); }
  if (!ready) throw new Error('Gateway readiness failed');
  startupStage = 'client_trust';
  await copyFile(`${base}/ca/mitmproxy-ca-cert.pem`, `${base}/public-ca.pem`); await chmod(`${base}/public-ca.pem`, 0o444);
  await mkdir('/home/pwuser/.pki/nssdb', { recursive: true, mode: 0o700 });
  for (const dir of ['/home/pwuser/.pki', '/home/pwuser/.pki/nssdb']) await chown(dir, pw, pw);
  await command(pw, 'certutil', ['-N', '--empty-password', '-d', 'sql:/home/pwuser/.pki/nssdb']);
  await command(pw, 'certutil', ['-A', '-d', 'sql:/home/pwuser/.pki/nssdb', '-n', 'Oddhound evaluation gateway', '-t', 'C,,', '-i', `${base}/public-ca.pem`]);
  log({ gatewayEvaluation: 'ready', policyHash: createHash('sha256').update(raw).digest('hex'), sockets: 'disabled', clientTls: 'intercepted', lab });
  service(pw, '/usr/local/bin/node26', ['/opt/oddhound/gateway/browser-server.mjs'], { PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright', RUN_WS_PATH: wsPath }, true);
  let busy = false;
  timer = setInterval(async () => {
    if (busy || closing) return; busy = true;
    try {
      if (Date.now() >= policy.expiresAt) return shutdown(0, 'run_expired');
      const stats = JSON.parse(execFileSync('nft', ['-j', 'list', 'table', 'inet', 'oddhound_eval_wire'], { encoding: 'utf8' }));
      if (stats.nftables.some((item) => item.counter && ['rx_drop', 'tx_drop'].includes(item.counter.name) && item.counter.packets > 0)) return shutdown(0, 'kernel_byte_cap');
      const state = JSON.parse(await readFile(`${base}/state/state.json`, 'utf8'));
      if (state.stopReason) shutdown(0, state.stopReason);
    } catch { shutdown(70, 'gateway_supervisor_fault'); }
    finally { busy = false; }
  }, 100);
} catch {
  log({ error: 'evaluation_gateway_startup_failed', stage: startupStage }); shutdown(70, 'gateway_startup_failed');
}
