import { chromium } from 'playwright';
if (process.getuid() === 0) throw new Error('Non-root browser UID required');
const wsPath = process.env.RUN_WS_PATH;
if (!/^\/[A-Za-z0-9_-]{24,}$/.test(wsPath ?? '')) throw new Error('Random control path required');
const server = await chromium.launchServer({
  channel: 'chromium', headless: true, chromiumSandbox: true, host: '::', port: 3000, wsPath,
  env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/pwuser', PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
  proxy: { server: 'http://127.0.0.1:8080', bypass: '<-loopback>' },
  args: ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
});
console.log(JSON.stringify({ browserServer: 'ready', uid: process.getuid(), port: 3000 }));
const stop = async () => { await server.close().catch(() => {}); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
