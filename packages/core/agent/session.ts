// A run's browser session: actor/device contexts, scope policy, element references and the
// trusted execution of browser tools. The model only ever refers to element refs like "e7".

import type { Browser, BrowserContext, Page, Response } from 'playwright';
import { createHash } from 'node:crypto';
import { newScopedContext } from '../browser/runtime.ts';
import { attachScope, type ScopeDecision, type ScopePolicy } from '../browser/scope.ts';
import { observe, type Observation, type ObservedElement } from '../browser/snapshot.ts';
import { attachSentinels, checkPage, gatewayBlockReason, type Signal } from '../browser/sentinels.ts';
import type { DeviceProfileName } from '../contracts/limits.ts';
import { redactKnownSecrets } from '../ledger/credentials.ts';
import { sensitiveQueryValues } from '../browser/site-map.ts';

export type Actor = 'A' | 'B';

export type CookieObservation = { origin: string; name: string; httpOnly: boolean; secure: boolean; sameSite: string | null; path: string };
export type HeaderObservation = { path: string; csp: boolean; frameProtection: boolean; contentTypeOptions: boolean };

export class ScopeViolation extends Error {}

/** The site did not load in the run's browser (after a retry). Not an Oddhound fault. */
export class SiteUnreachable extends Error {
  readonly url: string;
  readonly detail: string;
  /** 'bot_challenge': the site's bot protection (e.g. a Cloudflare managed challenge) refused the run's browser. */
  readonly kind: 'unreachable' | 'bot_challenge';
  constructor(url: string, detail: string, kind: 'unreachable' | 'bot_challenge' = 'unreachable') {
    super(`site unreachable: ${url}`);
    this.url = url;
    this.detail = detail;
    this.kind = kind;
  }
}

export class RunSession {
  readonly #browser: Browser;
  readonly #policy: ScopePolicy;
  readonly #onScope: (d: ScopeDecision) => void;
  readonly #contexts = new Map<string, { ctx: BrowserContext; page: Page }>();
  #actor: Actor = 'A';
  #device: DeviceProfileName = 'desktop';
  #version = 0;
  #observationMs = 0;
  #observationCount = 0;
  get observationTiming() { return { count: this.#observationCount, elapsedMs: Math.round(this.#observationMs) }; }
  #lastInScopeUrl: string;
  lastObservation: Observation | null = null;
  readonly cookies = new Map<string, CookieObservation>();
  readonly headers = new Map<string, HeaderObservation>();
  readonly #secrets = new Set<string>();
  readonly #authContexts = new Map<string, { fingerprint: string; generation: number }>();
  /** Opaque generation only: link evidence cannot be borrowed across roles, devices or changed sessions. */
  get discoveryContext() {
    const key = `${this.#actor}:${this.#device}`;
    return `${key}:${this.#authContexts.get(key)?.generation ?? 0}`;
  }
  #screenshotsWithheld = false;
  readonly #navigations = new Set<string>();
  readonly #popupTasks = new Set<Promise<void>>();
  readonly #retiredPages = new Set<Page>();
  drainNavigations() { const urls = [...this.#navigations]; this.#navigations.clear(); return redactKnownSecrets(urls, this.#secrets); }
  #watchPage(page: Page) {
    attachSentinels(page, (o) => this.inScope(o), (s) => { this.#signals.push(s); });
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) this.#noteNavigation(frame.url()); });
    page.on('dialog', (d) => { this.#dialogs.push(`${d.type()}: ${d.message().replace(/\s+/g, ' ').slice(0, 120)}`); void d.dismiss().catch(() => {}); });
    page.setDefaultTimeout(10_000); page.setDefaultNavigationTimeout(30_000);
  }
  #noteNavigation(url: string) {
    try { if (new URL(url).origin === this.#policy.primaryOrigin) this.#navigations.add(url); } catch { /* blank */ }
  }
  protectSecret(value: string, withholdScreenshot = false) { this.#secrets.add(value); this.#screenshotsWithheld ||= withholdScreenshot; }
  redact<T>(value: T): T { return redactKnownSecrets(value, this.#secrets); }
  /** Controller-only session material. Never return these values in tools, events or model messages. */
  async #refreshSessionSecrets(page: Page) {
    const origins = [this.origin, ...this.#policy.apiOrigins];
    const hosts = origins.map(origin => new URL(origin).hostname);
    const authMaterial: string[] = [];
    for (const cookie of await page.context().cookies()) {
      const domain = cookie.domain.replace(/^\./, '');
      if (cookie.value && hosts.some(host => host === domain || host.endsWith(`.${domain}`))) {
        this.protectSecret(cookie.value, true);
        authMaterial.push(JSON.stringify([cookie.domain, cookie.path, cookie.name, cookie.value]));
      }
    }
    const pairs: { name: string; value: string }[] = [];
    const currentOrigin = new URL(page.url()).origin;
    const storage = await page.context().newCDPSession(page);
    try {
      await storage.send('DOMStorage.enable');
      for (const origin of origins) for (const isLocalStorage of [true, false]) {
        try {
          const result = await storage.send('DOMStorage.getDOMStorageItems', { storageId: { securityOrigin: origin, isLocalStorage } });
          pairs.push(...result.entries.map(([name = '', value = '']) => ({ name, value })));
        } catch (error) {
          // An API origin with no page has no DOM storage. Failure for the current page is fail closed.
          if (origin === currentOrigin) throw error;
        }
      }
    } finally { await storage.detach().catch(() => {}); }
    const sensitive = /token|auth|session|secret|credential|password|jwt/i;
    const scan = (name: string, value: unknown): void => {
      if (typeof value === 'string') {
        if (sensitive.test(name) && value) { this.protectSecret(value, true); authMaterial.push(JSON.stringify([name, value])); }
        try { const parsed: unknown = JSON.parse(value); if (parsed && typeof parsed === 'object') scan(name, parsed); } catch { /* plain value */ }
      } else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) scan(key, child);
    };
    for (const pair of pairs) scan(pair.name, pair.value);
    // Keep the digest private. Cookie/token removal advances the generation too, including logout.
    // This is conservative provenance invalidation, not a claim to infer successful authentication.
    const key = `${this.#actor}:${this.#device}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(authMaterial.sort())).digest('hex');
    const previous = this.#authContexts.get(key);
    this.#authContexts.set(key, { fingerprint, generation: (previous?.generation ?? 0) + (previous && previous.fingerprint !== fingerprint ? 1 : 0) });
  }
  get screenshotsWithheld() { return this.#screenshotsWithheld; }

  constructor(browser: Browser, policy: ScopePolicy, onScope: (d: ScopeDecision) => void) {
    this.#browser = browser; this.#policy = policy; this.#onScope = onScope;
    this.#lastInScopeUrl = `${policy.primaryOrigin}/`;
  }

  get actor() { return this.#actor; }
  get device() { return this.#device; }
  get origin() { return this.#policy.primaryOrigin; }

  /** The verified site and verified API hosts: failures there are the site's own. */
  inScope(origin: string): boolean { return origin === this.#policy.primaryOrigin || this.#policy.apiOrigins.has(origin); }

  // Sentinel signals and scope blocks since the last drain (one action's window).
  #signals: Signal[] = [];
  #scopeBlocks = 0;
  /** Blocks of requests to the verified site or its APIs, or of a page navigation (not third-party noise). */
  #ownScopeBlocks = 0;
  /** Signals raised since the last call, plus whether Oddhound blocked any request in that window. */
  async drainSignals(): Promise<{ signals: Signal[]; scopeBlocked: boolean; ownScopeBlocked: boolean }> {
    const page = await this.page();
    this.#signals.push(...await checkPage(page, this.#device === 'mobile'));
    const out = { signals: this.#signals, scopeBlocked: this.#scopeBlocks > 0, ownScopeBlocked: this.#ownScopeBlocks > 0 };
    this.#signals = []; this.#scopeBlocks = 0; this.#ownScopeBlocks = 0;
    return redactKnownSecrets(out, this.#secrets);
  }

  /** The element kind of a ref in the observation the model acted on. */
  kindOf(ref: string): string | null {
    return this.elementOf(ref)?.kind ?? null;
  }

  /** The element behind a ref in the observation the model acted on. */
  elementOf(ref: string): ObservedElement | null {
    return (this.#turnObservation ?? this.lastObservation)?.elements.find((e) => e.ref === ref) ?? null;
  }

  // Dialogs (alert/confirm/prompt/beforeunload) since the last drain. They are dismissed, which is the
  // safe choice a user can make (Cancel), and reported to the runner as a surprise.
  #dialogs: string[] = [];
  drainDialogs(): string[] { const d = this.#dialogs; this.#dialogs = []; return redactKnownSecrets(d, this.#secrets); }

  /** Owner sign-in handoff: relaxes scope for owner-driven sign-in only (see scope.ts). */
  setHandoff(active: boolean) { this.#policy.handoffActive = active; }
  get handoffActive() { return this.#policy.handoffActive; }

  /** Cookies and storage of the current actor/device context (kept in memory by the caller only). */
  async storageState() {
    const entry = this.#contexts.get(`${this.#actor}:${this.#device}`);
    return entry ? entry.ctx.storageState() : undefined;
  }

  async page(): Promise<Page> {
    if (this.#popupTasks.size) await Promise.allSettled([...this.#popupTasks]);
    for (const retired of this.#retiredPages) await retired.close().catch(() => {});
    this.#retiredPages.clear();
    const key = `${this.#actor}:${this.#device}`;
    let entry = this.#contexts.get(key);
    if (!entry) {
      // Carry the actor's session across devices by copying its storage state from the other device.
      const other = this.#contexts.get(`${this.#actor}:${this.#device === 'desktop' ? 'mobile' : 'desktop'}`);
      const state = other ? await other.ctx.storageState() : undefined;
      const ctx = await newScopedContext(this.#browser, this.#device, state);
      await attachScope(ctx, this.#policy, (d) => {
        if (!d.allowed) {
          this.#scopeBlocks++;
          let own = d.resourceType === 'document';
          try { own ||= this.inScope(new URL(d.url).origin); } catch { /* invalid URL: third-party noise */ }
          if (own) this.#ownScopeBlocks++;
        }
        this.#onScope(d);
      }, { allowPrimaryPopups: true });
      ctx.on('response', (r) => {
        const reason = gatewayBlockReason(r);
        if (!reason) return;
        this.#scopeBlocks++;
        const resourceType = r.request().resourceType();
        let own = resourceType === 'document';
        try { own ||= this.inScope(new URL(r.url()).origin); } catch { /* invalid URL */ }
        if (own) this.#ownScopeBlocks++;
        this.#onScope({ allowed: false, reason: `gateway:${reason}`, method: r.request().method(), url: r.url(), resourceType });
      });
      ctx.on('response', (r) => {
        void this.#recordResponse(r);
        try { if (r.request().isNavigationRequest() && r.request().frame().parentFrame() === null) this.#noteNavigation(r.url()); } catch { /* detached */ }
      });
      const page = await ctx.newPage();
      this.#watchPage(page);
      entry = { ctx, page };
      this.#contexts.set(key, entry);
      ctx.on('page', (popup) => {
        if (this.#popupTasks.size >= 4) {
          this.#onScope({ allowed: false, reason: 'popup_concurrency_limit', method: 'GET', url: popup.url(), resourceType: 'document' });
          void popup.close().catch(() => {}); return;
        }
        this.#watchPage(popup);
        const task = (async () => {
          // Runner-created independent tabs (e.g. stale-tab assertions) are not user popups.
          if (!await popup.opener()) return;
          if (popup.url() === 'about:blank') await popup.waitForURL(u => u.origin === this.#policy.primaryOrigin, { waitUntil: 'domcontentloaded', timeout: 5_000 }).catch(() => {});
          await popup.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
          if (popup.isClosed()) return;
          if (new URL(popup.url()).origin !== this.#policy.primaryOrigin) { await popup.close(); return; }
          const owner = this.#contexts.get(key);
          if (!owner) { await popup.close(); return; }
          // Keep one active page per actor/device. The adopted popup retains the same scoped context.
          const previous = owner.page; owner.page = popup;
          this.#noteNavigation(popup.url());
          if (previous !== popup) this.#retiredPages.add(previous);
        })().catch(() => {});
        this.#popupTasks.add(task); void task.finally(() => this.#popupTasks.delete(task));
      });
      const startUrl = other ? other.page.url() : `${this.#policy.primaryOrigin}/`;
      const target = startUrl.startsWith(this.#policy.primaryOrigin) ? startUrl : `${this.#policy.primaryOrigin}/`;
      // First load: generous timeout and one retry, then a clear "site unreachable" instead of a crash.
      let lastError: unknown;
      let challenged = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          challenged = resp?.headers()['cf-mitigated'] === 'challenge';
          lastError = challenged ? new Error(`bot challenge (HTTP ${resp?.status()}, cf-mitigated: challenge)`) : undefined;
          if (!challenged) break;
        } catch (e) {
          lastError = e;
          challenged = /^just a moment/i.test(await page.title().catch(() => ''));
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2_000));
      }
      if (lastError) {
        this.#contexts.delete(key);
        await ctx.close().catch(() => {});
        throw new SiteUnreachable(target, (lastError as Error).message.split('\n')[0]!.slice(0, 200), challenged ? 'bot_challenge' : 'unreachable');
      }
    }
    return entry.page;
  }

  async #recordResponse(r: Response) {
    try {
      const url = new URL(r.url());
      if (url.origin !== this.#policy.primaryOrigin) return;
      const headers = await r.allHeaders(); // headers() omits cookie headers
      const setCookie = r.request().resourceType() === 'document' || r.request().resourceType() === 'fetch' || r.request().resourceType() === 'xhr' ? headers['set-cookie'] : undefined;
      if (setCookie) {
        for (const line of setCookie.split('\n')) {
          const [pair, ...attrs] = line.split(';').map((s) => s.trim());
          const name = pair?.split('=')[0];
          if (!name) continue;
          const lower = attrs.map((a) => a.toLowerCase());
          if (lower.some((a) => a.startsWith('max-age=0'))) continue; // a deletion, not a session cookie
          const sameSite = lower.find((a) => a.startsWith('samesite='))?.split('=')[1] ?? null;
          this.cookies.set(name, { origin: url.origin, name, httpOnly: lower.includes('httponly'), secure: lower.includes('secure'), sameSite, path: lower.find((a) => a.startsWith('path='))?.split('=')[1] ?? '/' });
        }
      }
      if (r.request().resourceType() === 'document' && (headers['content-type'] ?? '').includes('text/html')) {
        const route = url.pathname.replace(/\/\d+(?=\/|$)/g, '/:id');
        this.headers.set(route, {
          path: route,
          csp: Boolean(headers['content-security-policy']),
          frameProtection: Boolean(headers['x-frame-options']) || /frame-ancestors/i.test(headers['content-security-policy'] ?? ''),
          contentTypeOptions: (headers['x-content-type-options'] ?? '').toLowerCase() === 'nosniff',
        });
      }
    } catch { /* evidence collection must never break the run */ }
  }

  async observe(): Promise<Observation> {
    const started = performance.now(); this.#observationCount++;
    try {
    const page = await this.page();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    // A bounded quiet render window catches hydrated menus/links without waiting on polling sockets.
    // Fixed instrumentation observes DOM mutations only; it never executes page-authored instructions.
    await page.evaluate(() => new Promise<void>((resolve) => {
      const started = performance.now(); let last = started;
      const watcher = new MutationObserver(() => { last = performance.now(); });
      watcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'href'] });
      const timer = setInterval(() => {
        const now = performance.now();
        if ((now - started >= 350 && now - last >= 150) || now - started >= 1500) { clearInterval(timer); watcher.disconnect(); resolve(); }
      }, 50);
    })).catch(() => {});
    await this.#refreshSessionSecrets(page);
    const raw = await observe(page, ++this.#version);
    for (const href of [raw.url, ...raw.elements.flatMap(e => e.href ? [e.href] : []), ...raw.navigationLinks?.map(link => link.href) ?? []]) {
      for (const value of sensitiveQueryValues(href, raw.url)) this.protectSecret(value, true);
    }
    this.lastObservation = redactKnownSecrets(raw, this.#secrets);
    return this.lastObservation;
    } finally { this.#observationMs += performance.now() - started; }
  }

  /** Called when a model turn starts: refs in that turn resolve against the observation the model saw. */
  beginTurn() { this.#turnVersion = this.#version; this.#turnObservation = this.lastObservation; }
  #turnVersion = 0;
  #turnObservation: Observation | null = null;
  /** The observation refs currently resolve against (the model's, until a batch rebases it). */
  get turnObservation(): Observation | null { return this.#turnObservation ?? this.lastObservation; }
  get turnVersion(): number { return this.#turnVersion; }

  /** True when a ref from the current turn observation still points at exactly one element. */
  async hasRef(ref: string): Promise<boolean> {
    const page = await this.page();
    return (await page.locator(`[data-oh-ref~="${ref}@${this.#turnVersion}"]`).count()) === 1;
  }

  /** Resolve a model-supplied ref against the turn's snapshot version. Refs from older versions, or
   *  whose element left the document (navigation, re-render), are rejected rather than guessed. */
  async locate(ref: string) {
    const page = await this.page();
    const loc = page.locator(`[data-oh-ref~="${ref}@${this.#turnVersion}"]`);
    if (await loc.count() !== 1) throw new Error(`Element ${ref} from observation v${this.#turnVersion} is no longer on the page. Observe again.`);
    return loc;
  }

  /** The visible label of a ref in the observation the model acted on (for recording recipes). */
  labelOf(ref: string): string | null {
    return (this.#turnObservation ?? this.lastObservation)?.elements.find((e) => e.ref === ref)?.label ?? null;
  }

  describe(ref: string): string {
    const el = (this.#turnObservation ?? this.lastObservation)?.elements.find((e) => e.ref === ref);
    return el ? `${el.kind} "${el.label}"` : ref;
  }

  async useActor(actor: Actor) { this.#actor = actor; await this.page(); }
  async setDevice(device: DeviceProfileName) { this.#device = device; await this.page(); }

  /** After any action: the main frame must still be on the verified origin, else return to safety. */
  async enforceMainFrameOrigin(): Promise<string | null> {
    const page = await this.page();
    let origin = '';
    try { origin = new URL(page.url()).origin; } catch { origin = ''; }
    if (origin === this.#policy.primaryOrigin) { this.#lastInScopeUrl = page.url(); return null; }
    const left = page.url();
    await page.goto(this.#lastInScopeUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    return left;
  }

  async ownerPreview(): Promise<Buffer> {
    const { protectedPreview } = await import('../browser/protected-preview.ts');
    const page = await this.page();
    if (new URL(page.url()).origin !== this.origin) throw new Error('Preview outside the verified origin');
    return protectedPreview(page, async () => { await this.#refreshSessionSecrets(page); return [...this.#secrets]; }, this.origin);
  }

  async screenshot(): Promise<Buffer> {
    if (this.#screenshotsWithheld) throw new Error('Model screenshots are withheld after credentials or session secrets are observed; text-only testing continues.');
    const page = await this.page();
    return page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
  }

  async close(): Promise<void> {
    await Promise.all([...this.#contexts.values()].map((e) => e.ctx.close().catch(() => {})));
    this.#contexts.clear();
  }
}
