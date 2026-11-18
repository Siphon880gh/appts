// Appts service worker (served by sw.php with the app version). Scope: the app folder, so it works
// under MAMP's /weng/app/healthcare/appts/ and under php -S at /.
// Offline mode off: the network as usual (a failed navigation falls back to the saved shell).
// Offline mode on: every same-origin GET is answered from Cache Storage only. Lookups go exact match,
// then a normalized URL, then the saved app page, then a friendly "not saved" page. Only the version
// check may reach the network. Requests sent with X-Appts-Fill: 1 (saving the copy) always pass through.
const VERSION = '__APPTS_VERSION__';
const PREFIX = 'appts-offline-', STATE = 'appts-offline-state', FLAG = './__appts-offline-mode';
let offlineOn = null, index = null;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  const m = event.data || {};
  if (m.type === 'appts-offline-mode') { offlineOn = !!m.on; index = null; }
  else if (m.type === 'appts-offline-reindex') index = null;
  else if (m.type === 'appts-skip-waiting') self.skipWaiting();
  else if (m.type === 'appts-skip-waiting') self.skipWaiting();
  if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true, version: VERSION, on: offlineOn });
});

async function readMode() {
  if (offlineOn !== null) return offlineOn;
  try { const hit = await (await caches.open(STATE)).match(new URL(FLAG, self.registration.scope).href); offlineOn = hit ? !!(await hit.json()).on : false; }
  catch (e) { offlineOn = false; }
  return offlineOn;
}

/** dir/ = dir/index.php; query sorted; v and t ignored; image and file downloads share one copy. */
function normKey(input) {
  const u = new URL(input, self.registration.scope);
  let path = u.pathname;
  if (path.endsWith('/')) path += 'index.php';
  const p = new URLSearchParams(u.search);
  const action = p.get('action');
  const drop = new Set(['v', 't']);
  if (action === 'file' || action === 'image') { drop.add('name'); drop.add('download'); p.set('action', 'file'); }
  const q = [...p].filter(([k]) => !drop.has(k)).sort((a, b) => a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : (a[0] < b[0] ? -1 : 1));
  return path + '?' + new URLSearchParams(q).toString();
}

async function buildIndex() {
  const map = new Map();
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === STATE) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) { const key = normKey(req.url); if (!map.has(key)) map.set(key, { name, url: req.url }); }
  }
  return map;
}
function cacheIndex() { if (!index) index = buildIndex().catch(e => { index = null; throw e; }); return index; }
async function fromEntry(entry) { return entry ? (await caches.open(entry.name)).match(entry.url) : null; }

function missPage() {
  const home = new URL('./', self.registration.scope).href;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not saved for offline use · Appts</title>
<style>body{font:16px/1.55 system-ui,sans-serif;background:#f4f3ed;color:#172943;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:460px;margin:24px;padding:28px;background:#fffef8;border:1px solid #d7d9d9;border-top:4px solid #8cc8f2}h1{font-size:22px;margin:0 0 8px}a{color:#1d4466;font-weight:700}</style></head>
<body><main><h1>Not saved for offline use</h1><p>Offline mode is on, and this page wasn't part of the saved copy, so Appts didn't try the network.</p><p><a href="${home}">Open your saved records</a></p></main></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Appts-Offline': 'miss' } });
}

/** Pages the app itself serves (everything in scope that is not an API, worker, or asset request). */
function isAppPage(url, request) {
  if (request.mode === 'navigate') return true;
  const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  return rel === '' || rel === 'index.php';
}

async function cacheOnly(request) {
  const url = new URL(request.url);
  const exact = await caches.match(request, { ignoreVary: true });
  if (exact) return exact;
  const map = await cacheIndex();
  const hit = await fromEntry(map.get(normKey(url)));
  if (hit) return hit;
  if (isAppPage(url, request)) {
    const scope = new URL(self.registration.scope).pathname;
    const inScope = url.pathname.startsWith(scope);
    const rel = url.pathname.slice(scope.length);
    // Any page of the app (dir/, index.php, index.php?anything) is the one saved app page.
    if (inScope && (rel === '' || rel === 'index.php')) {
      const page = await fromEntry(map.get(normKey(new URL('index.php', self.registration.scope))));
      if (page) return page;
    }
    return missPage();
  }
  return new Response(JSON.stringify({ error: 'Not saved for offline use.', offline: true }), { status: 504, statusText: 'Not saved for offline use', headers: { 'Content-Type': 'application/json', 'X-Appts-Offline': 'miss' } });
}

function isVersionCheck(url) { return url.pathname.endsWith('/api.php') && url.searchParams.get('action') === 'version'; }

async function offlineResponse(request, url) {
  if (isVersionCheck(url)) return fetch(request, { cache: 'no-store' }).catch(() => new Response(JSON.stringify({ version: null, offline: true }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  return cacheOnly(request);
}

async function savedShell(request) {
  const map = await cacheIndex().catch(() => new Map());
  return (await fromEntry(map.get(normKey(request.url)))) || (await fromEntry(map.get(normKey(new URL('index.php', self.registration.scope))))) || missPage();
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (url.origin !== location.origin || request.method !== 'GET') return;
  if (request.headers.get('X-Appts-Fill') === '1') return;
  if (url.pathname.endsWith('/sw.php')) return;
  if (offlineOn === false) { if (request.mode === 'navigate') event.respondWith(fetch(request).catch(() => savedShell(request))); return; }
  event.respondWith(readMode().then(on => on ? offlineResponse(request, url) : (request.mode === 'navigate' ? fetch(request).catch(() => savedShell(request)) : fetch(request))));
});
