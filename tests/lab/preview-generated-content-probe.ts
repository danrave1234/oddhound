// Standalone, local-only privacy adversarial probe. Every secret and page below is synthetic.
// Different known secrets must not change protected pixels. A refused capture is fail-closed.
import { chromium } from 'playwright';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { protectedPreview } from '../../packages/core/browser/protected-preview.ts';
import { checkChromiumSandbox } from '../../packages/core/browser/runtime.ts';

const secrets = ['AAA-SECRET-123', 'BBB-SECRET-456'];
const source = resolve('packages/core/browser/protected-preview.ts');
const fingerprint = async () => createHash('sha256').update(await readFile(source)).digest('hex');
const before = await fingerprint();
const prefix = `preview-generated-content-${randomUUID().slice(0, 8)}`;
const directory = resolve('docs/evidence');
await mkdir(directory, { recursive: true });
const graphic = (secret: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><text x="0" y="40" font-family="monospace" font-size="28">${secret}</text></svg>`)}`;
const cases: { id: string; content(secret: string): string }[] = [
  { id: 'ordinary-before-control', content: s => `<style>#leak::before {content:"${s}";font:28px monospace}</style><div id="leak"></div>` },
  { id: 'specific-before', content: s => `<style>#leak::before {visibility:visible!important;content:"${s}"!important;font:28px monospace}</style><div id="leak"></div>` },
  { id: 'specific-after', content: s => `<style>#leak::after {visibility:visible!important;content:"${s}"!important;font:28px monospace}</style><div id="leak"></div>` },
  { id: 'attribute-before', content: s => `<style>#leak::before {visibility:visible!important;content:attr(data-private)!important;font:28px monospace}</style><div id="leak" data-private="${s}"></div>` },
  { id: 'specific-marker', content: s => `<style>#leak::marker {visibility:visible!important;content:"${s} "!important;font:28px monospace}</style><ul style="padding-left:300px"><li id="leak">Public item</li></ul>` },
  { id: 'list-style-string', content: s => `<ul style="padding-left:300px"><li id="leak" style="list-style-type:'${s} ';font:28px monospace">Public item</li></ul>` },
  { id: 'custom-counter-marker', content: s => `<style>@counter-style private-marker {system:cyclic;symbols:"${s}";suffix:" "} #leak{list-style-type:private-marker;font:28px monospace}</style><ul style="padding-left:300px"><li id="leak">Public item</li></ul>` },
  { id: 'css-mask-image', content: s => `<div id="leak" style="background:black;mask-image:url('${graphic(s)}');mask-repeat:no-repeat"></div>` },
  { id: 'css-filter-resource', content: s => `<svg width="0" height="0"><defs><filter id="private-filter" x="0" y="0" width="100%" height="100%"><feImage href="${graphic(s)}" width="300" height="80"/></filter></defs></svg><div id="leak" style="background:black;filter:url(#private-filter)"></div>` },
  { id: 'canvas-shadow', content: s => `<canvas id="leak" width="300" height="80" style="filter:drop-shadow(350px 0 red)"></canvas><script>const c=document.querySelector('canvas').getContext('2d');c.font='28px monospace';c.fillText('${s}',10,40)</script>` },
  { id: 'iframe-shadow', content: s => `<iframe id="leak" style="border:0;width:300px;height:80px;background:transparent;filter:drop-shadow(350px 0 red)" srcdoc="<style>html,body{background:transparent;margin:0;font:28px monospace}</style>${s}"></iframe>` },
];
const browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
const version = browser.version(), sandbox = await checkChromiumSandbox(browser);
const results: { id: string; outcome: 'leak' | 'protected' | 'paused' | 'inconclusive' | 'invalid-control'; rawPixelsDiffer: boolean; protectedPixelsDiffer?: boolean; errors: string[] }[] = [];
try {
  if (sandbox !== 'sandbox_on') throw new Error('Actual Chromium sandbox unavailable');
  for (const probe of cases) {
    const raw: Buffer[] = [], frames: Buffer[] = [], errors: string[] = [];
    for (const [index, secret] of secrets.entries()) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
      try {
        await page.setContent(`<!doctype html><html><head><style>body{margin:20px;background:white;color:black} #leak{width:300px;height:80px}</style></head><body><h1>Public workspace</h1>${probe.content(secret)}</body></html>`);
        raw.push(await page.screenshot({ type: 'jpeg', quality: 50, animations: 'disabled' }));
        try {
          const frame = await protectedPreview(page, secrets); frames.push(frame);
          await writeFile(resolve(directory, `${prefix}-${probe.id}-${index + 1}.jpg`), frame);
        } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      } finally { await page.close(); }
    }
    const rawPixelsDiffer = !raw[0]!.equals(raw[1]!);
    const protectedPixelsDiffer = frames.length === 2 ? !frames[0]!.equals(frames[1]!) : undefined;
    const outcome = !rawPixelsDiffer ? 'invalid-control' : errors.length ? frames.length ? 'inconclusive' : 'paused' : protectedPixelsDiffer ? 'leak' : 'protected';
    results.push({ id: probe.id, outcome, rawPixelsDiffer, protectedPixelsDiffer, errors });
    console.log(JSON.stringify(results.at(-1)));
  }
} finally { await browser.close(); }
const after = await fingerprint();
const report = { at: new Date().toISOString(), node: process.version, playwright: '1.64.1', chromium: version, sandbox,
  sourceBefore: before, sourceAfter: after, sourceChangedDuringProbe: before !== after,
  mocked: 'All pages and secret markers are synthetic. Real local Chromium/capture code. No provider, account, external target or deployment.', results,
  cleanup: 'All local browser contexts and browser closed' };
const file = resolve(directory, `${prefix}.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: file, leaks: results.filter(result => result.outcome === 'leak').length, sourceChangedDuringProbe: before !== after }));
process.exitCode = results.some(result => ['leak', 'invalid-control', 'inconclusive'].includes(result.outcome)) || before !== after ? 1 : 0;
