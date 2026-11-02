import type { Page } from 'playwright';

/** Owner-only pixels. Never feed these frames to inference or use them as finding evidence.
 * Mask editable values, secret-bearing text (including split text), embedded documents and graphics
 * that could render credentials outside DOM text. Fail closed if instrumentation/capture fails. */
export async function protectedPreview(page: Page, secrets: readonly string[] | (() => Promise<readonly string[]>), expectedOrigin?: string): Promise<Buffer> {
  const marker = 'data-oddhound-preview-mask';
  const cdp = await page.context().newCDPSession(page);
  let frozen = false;
  let playbackRate: number | undefined;
  let executionContextId: number | undefined;
  let documentChanged = false;
  let frameId = '';
  const markNavigation = (event: { frame: { id: string; parentId?: string } }) => {
    if (!event.frame.parentId || event.frame.id === frameId) documentChanged = true;
  };
  const markSameDocumentNavigation = (event: { frameId: string }) => { if (event.frameId === frameId) documentChanged = true; };
  const isolated = async (expression: string) => {
    if (executionContextId === undefined) throw new Error('Privacy inspection world unavailable');
    const result = await cdp.send('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true, timeout: 2000 });
    if (result.exceptionDetails) throw new Error('Privacy inspection failed or requires hiding the entire page');
  };
  try {
    await cdp.send('Page.enable');
    cdp.on('Page.frameNavigated', markNavigation);
    cdp.on('Page.navigatedWithinDocument', markSameDocumentNavigation);
    const baseline = (await cdp.send('Page.getFrameTree')).frameTree.frame;
    frameId = baseline.id;
    if (expectedOrigin && new URL(baseline.url).origin !== expectedOrigin) throw new Error('Privacy capture outside the verified origin');
    // Page-owned observers/timers cannot change pixels between inspection and capture.
    // Fixed CDP instrumentation only; it adds no network or model-code authority.
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
    frozen = true;
    await cdp.send('Animation.enable');
    ({ playbackRate } = await cdp.send('Animation.getPlaybackRate'));
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
    const knownSecrets = typeof secrets === 'function' ? await secrets() : secrets;
    ({ executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId, worldName: 'oddhound-owner-preview' }));
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const pending = [root]; let nodes = 0;
    while (pending.length) {
      const node = pending.pop()!;
      if (++nodes > 20000) throw new Error('Privacy inspection exceeded its node bound');
      if (node.shadowRootType === 'closed') throw new Error('Privacy capture paused: closed shadow content cannot be inspected');
      pending.push(...(node.children ?? []), ...(node.shadowRoots ?? []));
      // Embedded documents are fully masked, so their private contents are not inspected.
    }
    const mask = ({ secrets, marker }: { secrets: readonly string[]; marker: string }) => {
      const all = [...document.querySelectorAll('*')];
      if (all.length > 12000) throw new Error('Page too large for bounded preview masking');
      const selected = new Set<Element>(document.querySelectorAll('input, textarea, select, [contenteditable], iframe, canvas, img, svg, video, object, embed'));
      const originals = new Map<Element, { style: string | null; marker: string | null }>();
      const remember = (el: Element) => { if (!originals.has(el)) originals.set(el, { style: el.getAttribute('style'), marker: el.getAttribute(marker) }); };
      const prepareStyle = (el: Element) => {
        remember(el);
        (el as HTMLElement).style.setProperty('transition', 'none', 'important');
        (el as HTMLElement).style.setProperty('animation', 'none', 'important');
      };
      const state = globalThis as unknown as { __oddhoundPreviewCleanup?: () => void };
      state.__oddhoundPreviewCleanup = () => {
        for (const [el, original] of originals) {
          if (original.style === null) el.removeAttribute('style'); else el.setAttribute('style', original.style);
          if (original.marker === null) el.removeAttribute(marker); else el.setAttribute(marker, original.marker);
        }
        delete state.__oddhoundPreviewCleanup;
      };
      for (const el of all) {
        if (el.shadowRoot) selected.add(el);
        const computed = getComputedStyle(el);
        // Inline important declarations dominate page selector specificity, and are restored exactly.
        // A string/custom counter marker reports content:normal but can still paint secret text.
        if (computed.display.includes('list-item')) {
          prepareStyle(el); (el as HTMLElement).style.setProperty('list-style-type', 'none', 'important');
        }
        for (const property of ['background-image', 'border-image-source', 'list-style-image',
          'mask-image', '-webkit-mask-image', 'clip-path', 'filter', 'backdrop-filter', '-webkit-backdrop-filter']) {
          if (computed.getPropertyValue(property).includes('url(')) {
            prepareStyle(el); (el as HTMLElement).style.setProperty(property, 'none', 'important');
          }
        }
        if (!['none', 'normal'].includes(computed.content)) selected.add(el);
        for (const pseudo of ['::before', '::after', '::marker']) {
          const paint = getComputedStyle(el, pseudo);
          if (!['none', 'normal'].includes(paint.content)) selected.add(el);
        }
        const text = el.textContent ?? '';
        const contains = secrets.some(s => s.length > 0 && text.includes(s));
        // An intact child copy must not conceal a second split copy in the same parent.
        const remaining = [...el.childNodes].map(child => child.nodeType === Node.ELEMENT_NODE &&
          secrets.some(s => s && child.textContent?.includes(s)) ? '' : child.textContent ?? '').join('');
        if (contains && secrets.some(s => s && remaining.includes(s))) selected.add(el);
      }
      if (selected.has(document.documentElement) || selected.has(document.body)) throw new Error('Privacy capture requires hiding the entire page');
      const hidden = new Set<Element>();
      const pending = [...selected];
      while (pending.length) {
        const el = pending.pop()!;
        if (hidden.has(el)) continue;
        hidden.add(el);
        if (hidden.size > 20000) throw new Error('Privacy subtree exceeds its node bound');
        pending.push(...el.children, ...(el.shadowRoot?.children ?? []));
        remember(el); el.setAttribute(marker, '');
        // Opacity hides the composited subtree, including pseudo elements and filter silhouettes
        // outside its bounding box. Visibility alone can be overridden by visible descendants.
        const style = (el as HTMLElement).style;
        style.setProperty('transition', 'none', 'important');
        style.setProperty('animation', 'none', 'important');
        style.setProperty('opacity', '0', 'important');
        style.setProperty('visibility', 'hidden', 'important');
        style.setProperty('filter', 'none', 'important');
        style.setProperty('text-shadow', 'none', 'important');
      }
    };
    // A page may replace main-world DOM methods before scripts are frozen. The isolated world
    // has trusted DOM wrappers; page-owned prototypes cannot suppress inspection or cleanup.
    await isolated(`(${mask.toString()})(${JSON.stringify({ secrets: [...knownSecrets], marker })})`);
    if (documentChanged) throw new Error('Privacy capture paused: document changed');
    const frame = await page.screenshot({ type: 'jpeg', quality: 50, fullPage: false, timeout: 2500,
      // The CDP animation timeline is already frozen; do not fast-forward CSS generated content.
      animations: 'allow', caret: 'hide',
      mask: [page.locator(`input, textarea, select, [contenteditable], iframe, canvas, img, svg, video, object, embed, [${marker}]`)],
      maskColor: '#262d2a',
    });
    const current = (await cdp.send('Page.getFrameTree')).frameTree.frame;
    if (documentChanged || current.id !== baseline.id || current.loaderId !== baseline.loaderId || current.url !== baseline.url) {
      throw new Error('Privacy capture paused: document changed');
    }
    return frame;
  } finally {
    let cleanupFailed = false;
    if (executionContextId !== undefined) await isolated('globalThis.__oddhoundPreviewCleanup?.()').catch(() => { cleanupFailed = true; });
    cdp.off('Page.frameNavigated', markNavigation);
    cdp.off('Page.navigatedWithinDocument', markSameDocumentNavigation);
    try { if (playbackRate !== undefined) await cdp.send('Animation.setPlaybackRate', { playbackRate }); }
    finally {
      try { if (frozen) await cdp.send('Emulation.setScriptExecutionDisabled', { value: false }); }
      finally { await cdp.detach().catch(() => {}); }
    }
    if (cleanupFailed && !documentChanged) throw new Error('Privacy capture paused: restoration failed');
  }
}
