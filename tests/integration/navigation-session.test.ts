// Real local Chromium and browser context policy. Synthetic targets, no model or cloud calls.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { chromium, type Browser } from 'playwright';
import { RunSession } from '../../packages/core/agent/session.ts';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';
import { NavigationFrontier } from '../../packages/core/agent/frontier.ts';
import { formatObservation } from '../../packages/core/browser/snapshot.ts';

let browser: Browser, site: Server, outsider: Server, origin: string, offOrigin: string;
let offArrivals = 0;
const listen = async (server: Server) => { await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture address'); return `http://127.0.0.1:${address.port}`; };
beforeAll(async () => {
  outsider = createServer((_req, res) => { offArrivals++; res.end('Outside scope'); });
  offOrigin = await listen(outsider);
  site = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    if (req.url === '/as-owner') {
      res.setHeader('set-cookie', 'session=owner-provenance-marker; Path=/; HttpOnly; SameSite=Lax');
      return void res.end('<h1>Owner</h1><header><a href="/private-record/edit">Edit own record</a></header>');
    }
    if (req.url === '/as-guest') {
      res.setHeader('set-cookie', 'session=; Path=/; Max-Age=0');
      return void res.end('<h1>Signed out</h1>');
    }
    if (req.url === '/private-record/edit') return void res.writeHead(req.headers.cookie?.includes('owner-provenance-marker') ? 200 : 404).end('<h1>Record response</h1>');
    if (req.url === '/secret-links') return void res.end('<h1>Links</h1><a href="/ordinary?tab=one">Ordinary navigation</a><a href="/callback?auth_token=visible-link-private-marker">Token link</a><a href="/#/room?api_key=visible-hash-private-marker">Hash token link</a>');
    if (req.url === '/secret-session') {
      res.setHeader('set-cookie', 'sid=synthetic-cookie-private-marker-41; Path=/; HttpOnly; SameSite=Lax');
      return void res.end(`<h1>Session page</h1><p>synthetic-cookie-private-marker-41 synthetic-local-token-marker-42 synthetic-session-token-marker-43</p><script>localStorage.setItem('persisted', JSON.stringify({auth:{accessToken:'synthetic-local-token-marker-42'}}));sessionStorage.setItem('sessionToken','synthetic-session-token-marker-43');Object.defineProperty(Storage.prototype,'getItem',{value:()=>null});const originalKeys=Object.keys;Object.keys=o=>o===sessionStorage||o===localStorage?[]:originalKeys(o);</script>`);
    }
    if (req.url === '/popup') return void res.end(`<h1>Scoped popup</h1><a target="_blank" href="${offOrigin}/forbidden">Outside popup</a><a href="/popup-child">Popup child route</a>`);
    res.end(`<!doctype html><html><head><style>#hover-parent{margin:50px;width:200px}.menu{display:none}#hover-parent:hover>.menu{display:block}</style></head><body>
      <header><div id="hover-parent"><button aria-haspopup="menu">Browse menu</button><div class="menu"><a href="/hovered">Hover destination</a></div></div></header>
      <main><h1>Home</h1><a target="_blank" href="/popup">Open scoped popup</a></main>
      <script>setTimeout(()=>document.querySelector('main').insertAdjacentHTML('beforeend','<a href="/hydrated">Hydrated navigation</a>'),180)</script></body></html>`);
  });
  origin = await listen(site);
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
  expect(await checkChromiumSandbox(browser)).toBe('sandbox_on');
});
afterAll(async () => { await browser?.close(); await Promise.all([site, outsider].map(s => new Promise<void>(r => s.close(() => r())))); });
const session = () => new RunSession(browser, { primaryOrigin: origin, apiOrigins: new Set(), writes: false, deniedPathPrefixes: [], deniedPathKeywords: [], handoffActive: false }, () => {});

describe('navigation discovery in the scoped session', () => {
  it('does not borrow owner links for another actor or a signed-out session', async () => {
    const s = session(), frontier = new NavigationFrontier(origin, () => true);
    try {
      await (await s.page()).goto(`${origin}/as-owner`);
      frontier.observe(await s.observe(), s.discoveryContext);
      const ownerContext = s.discoveryContext;
      expect(ownerContext).toMatch(/^A:desktop:\d+$/);
      expect(frontier.wasListed('/private-record/edit', ownerContext)).toBe(true);
      expect((await (await s.page()).goto(`${origin}/private-record/edit`))?.status()).toBe(200);
      await s.useActor('B');
      frontier.observe(await s.observe(), s.discoveryContext);
      expect(frontier.wasListed('/private-record/edit', s.discoveryContext)).toBe(false);
      expect((await (await s.page()).goto(`${origin}/private-record/edit`))?.status()).toBe(404);
      await s.useActor('A');
      await s.observe(); expect(s.discoveryContext).toBe(ownerContext);
      await (await s.page()).goto(`${origin}/as-guest`);
      frontier.observe(await s.observe(), s.discoveryContext);
      expect(s.discoveryContext).not.toBe(ownerContext);
      expect(frontier.wasListed('/private-record/edit', s.discoveryContext)).toBe(false);
      expect((await (await s.page()).goto(`${origin}/private-record/edit`))?.status()).toBe(404);
      await (await s.page()).goto(`${origin}/as-owner`);
      frontier.observe(await s.observe(), s.discoveryContext);
      expect(s.discoveryContext).not.toBe(ownerContext);
      expect(frontier.wasListed('/private-record/edit', s.discoveryContext)).toBe(true);
    } finally { await s.close(); }
  });
  it('redacts sensitive link query values absent from storage while retaining ordinary navigation', async () => {
    const s = session();
    try {
      await (await s.page()).goto(`${origin}/secret-links`);
      const o = await s.observe();
      for (const marker of ['visible-link-private-marker', 'visible-hash-private-marker']) {
        expect(JSON.stringify(o)).not.toContain(marker);
        expect(formatObservation(o)).not.toContain(marker);
        expect(s.redact(`history ${marker}`)).toBe('history [redacted]');
      }
      const ordinary = o.elements.find(e => e.label === 'Ordinary navigation')!;
      expect(ordinary.href).toBe('/ordinary?tab=one');
      s.beginTurn(); expect(await (await s.locate(ordinary.ref)).getAttribute('href')).toBe('/ordinary?tab=one');
      expect(s.screenshotsWithheld).toBe(true);
    } finally { await s.close(); }
  });
  it('keeps a trusted independent tab separate from the active exploratory page', async () => {
    const s = session();
    try {
      const active = await s.page();
      const independent = await active.context().newPage();
      await independent.goto(`${origin}/popup`);
      expect(await s.page()).toBe(active);
      expect(active.isClosed()).toBe(false);
      await independent.close();
    } finally { await s.close(); }
  });
  it('keeps owned cookie and storage tokens out of observations and model pixels', async () => {
    const s = session();
    try {
      await (await s.page()).goto(`${origin}/secret-session`);
      const o = await s.observe();
      for (const marker of ['synthetic-cookie-private-marker-41', 'synthetic-local-token-marker-42', 'synthetic-session-token-marker-43']) {
        expect(JSON.stringify(o)).not.toContain(marker);
        expect(s.redact(`historical reflection: ${marker}`)).not.toContain(marker);
      }
      expect(o.text).toContain('[redacted]');
      expect(s.screenshotsWithheld).toBe(true);
      await expect(s.screenshot()).rejects.toThrow('Model screenshots are withheld');
    } finally { await s.close(); }
  });
  it('observes delayed hydration and hidden/hover-revealed navigation', async () => {
    const s = session();
    try {
      const first = await s.observe();
      expect(first.navigationLinks?.find(l => l.href.endsWith('/hovered'))?.hidden).toBe(true);
      expect(first.elements.some(e => e.href === '/hydrated')).toBe(true);
      const frontier = new NavigationFrontier(origin, () => true); frontier.observe(first);
      expect(frontier.pending().some(e => e.path === '/hovered')).toBe(true);
      const menu = first.elements.find(e => e.label === 'Browse menu')!;
      expect(menu.hasPopup).toBe(true);
      s.beginTurn(); await (await s.locate(menu.ref)).hover();
      const second = await s.observe();
      expect(second.elements.some(e => e.label === 'Hover destination')).toBe(true);
    } finally { await s.close(); }
  });

  it('adopts a primary-origin popup, keeps scope attached, and refuses an off-origin popup', async () => {
    const s = session();
    try {
      await s.observe();
      const opener = await s.page();
      await Promise.all([opener.waitForEvent('popup'), opener.getByRole('link', { name: 'Open scoped popup' }).click()]);
      const observed = await s.observe();
      expect(observed.path).toBe('/popup');
      expect(observed.elements.some(e => e.href === '/popup-child')).toBe(true);
      expect(s.drainNavigations()).toContain(`${origin}/popup`);
      const active = await s.page();
      await Promise.all([active.waitForEvent('popup'), active.getByRole('link', { name: 'Outside popup' }).click()]);
      expect((await s.observe()).path).toBe('/popup');
      expect(offArrivals).toBe(0);
      expect(active.context().pages()).toHaveLength(1);
    } finally { await s.close(); }
  });
});
