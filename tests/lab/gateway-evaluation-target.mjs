// Synthetic HTTPS target, API, resource and invalid-certificate origins for the internal Docker lab.
// No real credentials/data or outbound fetches. Every effect is recorded with a test-owned nonce.
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = '/evaluation-target';
const cert = readFileSync(`${root}/server.pem`), key = readFileSync(`${root}/server-key.pem`);
const untrusted = tls.createSecureContext({ cert: readFileSync(`${root}/untrusted.pem`), key: readFileSync(`${root}/untrusted-key.pem`) });
const trusted = tls.createSecureContext({ cert, key });
const events = [];
const activeByNonce = new Map();
const record = (e) => { if (events.length < 5000) events.push(e); };
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><h1>Owned gateway TLS canary</h1></body></html>';
const listener = https.createServer({ cert, key, SNICallback: (name, cb) => cb(null, name === 'badcert.test' ? untrusted : trusted) }, async (req, res) => {
  const url = new URL(req.url ?? '/', `https://${req.headers.host}`);
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) { res.writeHead(413).end(); return; } chunks.push(chunk); }
  const body = Buffer.concat(chunks).toString();
  const nonce = url.searchParams.get('nonce') ?? '';
  const activeForNonce = (activeByNonce.get(nonce) ?? 0) + 1;
  if (nonce) activeByNonce.set(nonce, activeForNonce);
  res.once('finish', () => { if (nonce) activeByNonce.set(nonce, Math.max(0, (activeByNonce.get(nonce) ?? 1) - 1)); });
  record({ kind: 'http', host: url.hostname, nonce, path: url.pathname, method: req.method, body, origin: req.headers.origin ?? null, activeForNonce });
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (url.pathname === '/transport-failure') { req.socket.destroy(); return; }
  if (url.pathname === '/target-502') {
    res.setHeader('server', url.searchParams.has('spoof') ? 'oddhound-evaluation-gateway/12.3.1' : 'Owned TLS fixture');
    if (url.searchParams.has('spoof')) res.setHeader('x-oddhound-blocked', 'upstream_error');
    res.writeHead(502, { 'content-type': 'text/plain' }).end('Synthetic genuine target 502'); return;
  }
  if (url.pathname === '/redirect') {
    const next = new URL(url.searchParams.get('target') ?? '/sink', 'https://fixture.test');
    next.searchParams.set('nonce', url.searchParams.get('nonce') ?? '');
    res.writeHead(Number(url.searchParams.get('code') ?? '307'), { location: next.href }).end(); return;
  }
  if (url.pathname === '/worker.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' }).end('self.onmessage = async ({data}) => { try { const r = await fetch(data.url, {method:"POST",body:data.body,mode:"no-cors"}); self.postMessage("response:"+r.status); } catch(e) { self.postMessage("error:"+e.message); } };'); return;
  }
  if (url.pathname === '/asset.css') {
    if (url.searchParams.get('delay') === '200') await new Promise((done) => setTimeout(done, 200));
    res.writeHead(200, { 'content-type': 'text/css' }).end('body { color: rgb(1, 2, 3); }'); return;
  }
  if (url.pathname === '/sink') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ saved: true, nonce: url.searchParams.get('nonce') })); return; }
  res.writeHead(200, { 'content-type': 'text/html' }).end(html);
});
listener.on('tlsClientError', (error) => record({ kind: 'tls_error', code: error.code ?? 'unknown' }));
listener.on('upgrade', (req, socket) => {
  const url = new URL(req.url ?? '/', `https://${req.headers.host}`);
  record({ kind: 'websocket', host: url.hostname, nonce: url.searchParams.get('nonce') ?? '', path: url.pathname, method: req.method, body: '', origin: req.headers.origin ?? null });
  socket.on('error', () => {});
  const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  setTimeout(() => socket.destroy(), 100);
});
listener.listen(443, '0.0.0.0');
// Control is published only on host loopback; it is outside the gateway's permitted target ports.
const admin = http.createServer((req, res) => {
  if (req.url === '/events') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(events)); return; }
  if (req.url === '/health') { res.writeHead(200).end('ready'); return; }
  res.writeHead(404).end();
});
admin.listen(8080, '0.0.0.0', () => console.log('Owned gateway TLS canary ready'));
const stop = () => { listener.closeAllConnections(); listener.close(); admin.closeAllConnections(); admin.close(); };
process.on('SIGTERM', stop);
