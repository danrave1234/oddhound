// Owned, synthetic exploration fixture. It performs no outbound requests.
// Navigation is discovered through real DOM controls; no route list is handed to the test planner.
import { createServer, type Server } from 'node:http';

export const EXPLORATION_ROUTE_COUNT = 88;
export type ExplorationSite = {
  origin: string;
  port: number;
  arrivals: { method: string; path: string }[];
  writes(): number;
  close(): Promise<void>;
};

const document = (body: string) => `<!doctype html><html><head><title>Exploration fixture</title><meta name="viewport" content="width=device-width"></head><body>${body}</body></html>`;
const filler = 'Synthetic application documentation and ordinary page content. '.repeat(26);

export async function startExplorationSite(): Promise<ExplorationSite> {
  const arrivals: { method: string; path: string }[] = [];
  let writes = 0;
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.invalid');
    arrivals.push({ method: req.method ?? 'GET', path: `${url.pathname}${url.search}` });
    const send = (body: string, status = 200) => { res.writeHead(status, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(document(body)); };
    if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') return void res.writeHead(404).end();
    if (url.pathname.startsWith('/denied')) return void send('<h1>Forbidden fixture destination</h1>');
    if (url.pathname === '/redirect-start') return void res.writeHead(302, { location: '/redirect-middle' }).end();
    if (url.pathname === '/redirect-middle') return void res.writeHead(307, { location: '/redirect-final' }).end();
    if (url.pathname === '/save') { writes++; return void send('<h1>Saved</h1>'); }
    if (url.pathname === '/') return void send(`
      <header><button id="product-menu" aria-haspopup="menu" aria-expanded="false">Product menu</button><nav id="product-nav"></nav></header>
      <aside><button id="side-menu" aria-haspopup="menu" aria-expanded="false">Sidebar menu</button><nav id="side-nav"></nav></aside>
      <main><h1>Exploration home</h1><p>${filler}</p>
        <a href="/visited-only">Read-only visit</a>
        <a href="https://outside.invalid/partner">Off-origin partner</a>
        <a href="/denied/delete">Denied destination</a>
      </main>
      <script>
        document.getElementById('product-menu').onclick = event => {
          event.currentTarget.setAttribute('aria-expanded', 'true');
          setTimeout(() => {
            document.getElementById('product-nav').innerHTML = '<button id="advanced-menu" aria-haspopup="menu" aria-expanded="false">Advanced menu</button><a href="/redirect-start">Redirect entry</a>';
            document.getElementById('advanced-menu').onclick = nested => {
              nested.currentTarget.setAttribute('aria-expanded', 'true');
              setTimeout(() => { nested.target.insertAdjacentHTML('afterend', '<a href="/header/deep">Nested header destination</a>'); }, 180);
            };
          }, 180);
        };
        document.getElementById('side-menu').onclick = event => {
          event.currentTarget.setAttribute('aria-expanded', 'true');
          setTimeout(() => { document.getElementById('side-nav').innerHTML = '<a href="/area/section-001">Browse sections</a><a href="/variants?tab=one">Settings</a><a href="/variants?tab=two">Settings</a>'; }, 180);
        };
      </script>`);
    if (url.pathname === '/header/deep') return void send(`
      <main><h1>Nested header destination</h1><p>${filler}</p><div id="late"></div></main>
      <script>setTimeout(() => { document.getElementById('late').innerHTML = '<a href="/late-discovery">Discovered after rendering</a>'; }, 180);</script>`);
    if (url.pathname === '/visited-only') return void send(`
      <main><h1>Visited-only area</h1><p>${filler}</p>
      <form method="post" action="/save"><label>Record name<input name="name" required></label><button>Save record</button></form></main>`);
    const section = /^\/area\/section-(\d{3})$/.exec(url.pathname);
    if (section) {
      const n = Number(section[1]);
      return void send(`<main><h1>Section ${n}</h1><p>${filler}</p>${n < EXPLORATION_ROUTE_COUNT ? `<a href="/area/section-${String(n + 1).padStart(3, '0')}">Continue</a>` : '<p>End of the observed sections.</p>'}</main>`);
    }
    if (url.pathname === '/variants') return void send(`<main><h1>Settings ${url.searchParams.get('tab')}</h1><p>${filler}</p></main>`);
    if (url.pathname === '/redirect-final' || url.pathname === '/late-discovery') return void send(`<main><h1>${url.pathname === '/redirect-final' ? 'Redirect final destination' : 'Late discovery destination'}</h1><p>${filler}</p></main>`);
    return void send('<h1>Not found</h1>', 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('Fixture did not get a TCP port');
  return {
    origin: `http://127.0.0.1:${address.port}`, port: address.port, arrivals,
    writes: () => writes,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
