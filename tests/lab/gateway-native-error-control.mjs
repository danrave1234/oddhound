// Run as the browser UID inside the evaluation guest. This is a fixed lab client, not model code.
// Both clients use the existing permitted loopback gateway and verify its ephemeral public CA.
import net from 'node:net';
import tls from 'node:tls';
import http2 from 'node:http2';
import { readFileSync } from 'node:fs';
const [protocol, nonce, mode] = process.argv.slice(2);
if (!['http/1.1', 'h2'].includes(protocol) || !/^[a-f0-9-]{36}$/.test(nonce) || !['transport-failure', 'target-502'].includes(mode)) throw new Error('Invalid lab arguments');
const socket = net.connect(8080, '127.0.0.1');
const timeout = setTimeout(() => process.exit(2), 8000);
socket.on('error', () => process.exit(3));
await new Promise(resolve => socket.once('connect', resolve));
socket.write('CONNECT fixture.test:443 HTTP/1.1\r\nHost: fixture.test:443\r\n\r\n');
await new Promise((resolve, reject) => {
  let response = '';
  const receive = chunk => {
    response += chunk;
    if (!response.includes('\r\n\r\n')) return;
    socket.off('data', receive);
    if (!response.startsWith('HTTP/1.1 200')) reject(new Error('Lab CONNECT failed')); else resolve();
  };
  socket.on('data', receive);
});
const secure = tls.connect({ socket, servername: 'fixture.test', ca: readFileSync('/run/oddhound-evaluation/public-ca.pem'), ALPNProtocols: protocol === 'h2' ? ['h2', 'http/1.1'] : [protocol] });
secure.on('error', () => process.exit(4));
await new Promise(resolve => secure.once('secureConnect', resolve));
if (secure.alpnProtocol !== protocol) throw new Error('Requested ALPN protocol was not negotiated');
const path = `/${mode}?nonce=${nonce}&spoof=1`;
let result;
if (protocol === 'h2') {
  const session = http2.connect('https://fixture.test', { createConnection: () => secure });
  const stream = session.request({ ':path': path, ':method': 'GET', origin: 'https://fixture.test', 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'empty' });
  result = await new Promise((resolve, reject) => {
    let headers; stream.on('response', value => { headers = value; });
    stream.resume(); stream.on('error', reject);
    stream.on('end', () => resolve({ protocol, status: headers[':status'], server: headers.server ?? null, blocked: headers['x-oddhound-blocked'] ?? null }));
    stream.end();
  });
  session.close();
} else {
  result = await new Promise(resolve => {
    let response = '';
    secure.on('data', chunk => { response += chunk; });
    secure.on('end', () => resolve({ protocol, status: Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1]), server: response.match(/\r\nserver:\s*([^\r\n]+)/i)?.[1] ?? null, blocked: response.match(/\r\nx-oddhound-blocked:\s*([^\r\n]+)/i)?.[1] ?? null }));
    secure.write(`GET ${path} HTTP/1.1\r\nHost: fixture.test\r\nOrigin: https://fixture.test\r\nSec-Fetch-Site: same-origin\r\nSec-Fetch-Dest: empty\r\nConnection: close\r\n\r\n`);
  });
}
console.log(JSON.stringify(result));
secure.destroy(); clearTimeout(timeout);
