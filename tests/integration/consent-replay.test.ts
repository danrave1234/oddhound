// A sign-up form that only submits once its consent box is ticked (as on SolarMatch, Nov 3 2026, where
// replays stalled because the consent label was saved as the submit button). The recipe now records the
// box as "tick this" and the replay ticks it before pressing the real submit.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { CHECK_FIELD, fillAndSubmit } from '../../packages/core/verifier/scenario.ts';

const consent = 'I agree to the Terms of Service and Privacy Policy, and I consent to the processing of my data under the Data Privacy Act';
let server: Server, browser: Browser, origin = '';
const posted: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === 'POST') {
      let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { posted.push(body); res.writeHead(303, { location: '/welcome' }).end(); });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/welcome' ? '<h1>Welcome</h1>' : `<form method="post" action="/register">
      <label>Email <input name="email" type="email" required></label>
      <label><input type="checkbox" name="consent" required> ${consent}</label>
      <button type="submit">Create account</button></form>`);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.close(); });

describe('consent box in a recorded sign-up', () => {
  it('ticks the box and presses the real submit', async () => {
    const page = await browser.newPage();
    await fillAndSubmit(page, origin, { path: '/register', fields: { Email: '{email}', [consent.slice(0, 80)]: CHECK_FIELD }, submit: 'Create account' }, { email: 'a@example.test' });
    expect(new URL(page.url()).pathname).toBe('/welcome');
    expect(posted.at(-1)).toContain('consent=on');
    await page.close();
  });

  it('cannot submit when the box is left out, so the old recipe stalled', async () => {
    const page = await browser.newPage();
    await fillAndSubmit(page, origin, { path: '/register', fields: { Email: '{email}' }, submit: 'Create account' }, { email: 'b@example.test' });
    expect(new URL(page.url()).pathname).toBe('/register');
    await page.close();
  });
});
