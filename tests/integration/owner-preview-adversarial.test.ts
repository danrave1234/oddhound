// Local Chromium canaries. Changing a secret must not change released pixels.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { protectedPreview } from '../../packages/core/browser/protected-preview.ts';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';

let browser: Browser;
const secrets = ['AAA-SECRET-123', 'BBB-SECRET-456'];
beforeAll(async () => {
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
  expect(await checkChromiumSandbox(browser)).toBe('sandbox_on');
});
afterAll(async () => { await browser?.close(); });

async function compareFrames(body: (secret: string) => string) {
  const frames: Buffer[] = [];
  const raw: Buffer[] = [];
  for (const secret of secrets) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    try {
      await page.setContent(`<style>body {font:20px monospace} p,section {width:700px;min-height:70px}</style><h1>Visible workspace</h1>${body(secret)}`);
      raw.push(await page.screenshot({ type: 'jpeg', quality: 50 }));
      frames.push(await protectedPreview(page, secrets));
    } finally { await page.close(); }
  }
  expect(frames[0]!.equals(frames[1]!)).toBe(true);
  expect(raw[0]!.equals(raw[1]!)).toBe(false); // The synthetic secret was actually visible without protection.
}

describe('owner preview privacy canaries', () => {
  it('masks a split secret even when the same parent also contains an intact copy', async () => {
    await compareFrames(s => `<section><span>${s.slice(0, 6)}</span><span>${s.slice(6)}</span><p>${s}</p></section>`);
  });
  it('does not expose secret text inside an open shadow root', async () => {
    await compareFrames(s => `<div id="host"></div><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<p>${s}</p>'</script>`);
  });
  it('pauses when closed shadow content cannot be inspected', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<div id="host"></div><script>document.querySelector('#host').attachShadow({mode:'closed'}).innerHTML='<p>${secrets[0]}</p>'</script>`);
      const result = await protectedPreview(page, secrets).then(() => 'released pixels', e => (e as Error).message);
      expect(result).toMatch(/shadow|privacy|inspect/i);
    } finally { await page.close(); }
  });
  it('prevents page script from reflecting a secret between masking and capture', async () => {
    await compareFrames(s => `<p>${s}</p><section id="reflection"></section><script>
      new MutationObserver(records => {
        if (records.some(r => r.attributeName === 'data-oddhound-preview-mask')) document.querySelector('#reflection').textContent = '${s}';
      }).observe(document.body, {attributes:true,subtree:true});
    </script>`);
  });
  it('uses trusted DOM methods despite page-owned querySelectorAll and prototype replacements', async () => {
    await compareFrames(s => `<p>${s}</p><script>
      document.querySelectorAll = () => [];
      Document.prototype.querySelectorAll = () => [];
      Element.prototype.setAttribute = () => {};
      Element.prototype.removeAttribute = () => {};
    </script>`);
  });
  it('discards pixels when navigation replaces the inspected document before screenshot capture', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<h1>Original workspace</h1>');
      const capture = page.screenshot.bind(page);
      const spy = vi.spyOn(page, 'screenshot').mockImplementation(async options => {
        await page.goto(`data:text/html,<h1>New document</h1><p>${secrets[0]}</p>`);
        return capture(options);
      });
      await expect(protectedPreview(page, secrets)).rejects.toThrow(/document changed/);
      spy.mockRestore();
      // Failure must restore script execution; a paused preview must not break later testing.
      expect(await page.evaluate(() => 2 + 2)).toBe(4);
    } finally { await page.close(); }
  });
  it('hides overflowing secret pixels despite page important visibility rules and restores inline styles', async () => {
    const frames: Buffer[] = [];
    for (const secret of secrets) {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      try {
        await page.setContent(`<style>#leak, #leak * {visibility:visible!important}</style><h1>Workspace</h1><p id="leak" style="width:1px;height:1px;white-space:nowrap;font:32px serif;text-shadow:40px 0 red">${secret}</p>`);
        const original = await page.locator('#leak').getAttribute('style');
        frames.push(await protectedPreview(page, secrets));
        expect(await page.locator('#leak').getAttribute('style')).toBe(original);
        expect(await page.locator('[data-oddhound-preview-mask]').count()).toBe(0);
      } finally { await page.close(); }
    }
    expect(frames[0]!.equals(frames[1]!)).toBe(true);
  });
  it('pauses instead of releasing a blank frame when privacy requires masking the page root', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<h1>Workspace</h1>${secrets[0]}`);
      await expect(protectedPreview(page, secrets)).rejects.toThrow(/entire page/);
      expect(await page.locator('body').getAttribute('style')).toBeNull();
      expect(await page.locator('[data-oddhound-preview-mask]').count()).toBe(0);
    } finally { await page.close(); }
  });
  it.each(['string', 'counter-style'] as const)('suppresses %s list markers whose computed content is normal', async kind => {
    await compareFrames(secret => kind === 'string'
      ? `<ul style="padding-left:300px"><li style="list-style-type:'${secret}'">Public item</li></ul>`
      : `<style>@counter-style private-marker {system:cyclic;symbols:'${secret}';suffix:' ';}</style><ul style="padding-left:300px"><li style="list-style-type:private-marker">Public item</li></ul>`);
  });
  it.each(['mask-image', 'filter'] as const)('suppresses a URL-backed %s that paints secret text outside DOM text', async kind => {
    const graphic = (secret: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><text x="0" y="40" font-size="28">${secret}</text></svg>`)}`;
    await compareFrames(secret => kind === 'mask-image'
      ? `<div style="width:300px;height:80px;background:black;mask-image:url('${graphic(secret)}');mask-repeat:no-repeat"></div>`
      : `<svg width="0" height="0"><defs><filter id="private-filter" x="0" y="0" width="100%" height="100%"><feImage href="${graphic(secret)}" width="300" height="80"/></filter></defs></svg><div style="width:300px;height:80px;background:black;filter:url(#private-filter)"></div>`);
  });
});
