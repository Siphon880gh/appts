"""t68u gates: versioned PDF thumb URLs, and Offline mode throwing away EVERY cache (all appts-offline-*
caches and the IndexedDB preview cache) on turn-on, sync, and a new release, then saving fresh copies,
thumbnails included. Demo account in temp storage only. Run: python3 tests/cache-refresh.test.py"""
import json, os, pathlib, sys, tempfile, time
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, Client, demo_password
from playwright.sync_api import sync_playwright

checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)
    print('  ok -', what)
def wait_js(page, expr, timeout=20000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception: pass
        page.wait_for_timeout(150)
    raise SystemExit(f'FAIL: timed out waiting for {expr}')

SEED_STALE = """async () => {
  const c = await caches.open('appts-offline-acct-stale-old'); await c.put(new URL('stale-thing', location.href).href, new Response('stale'));
  const d = await new Promise(res => { const r = indexedDB.open('appts-thumbs', 1); r.onupgradeneeded = () => r.result.createObjectStore('thumbs'); r.onsuccess = () => res(r.result); });
  await new Promise(res => { const t = d.transaction('thumbs', 'readwrite'); t.objectStore('thumbs').put(new Blob(['PDF'], { type: 'text/plain' }), 'stale-key'); t.oncomplete = res; });
  d.close(); return true; }"""
STALE_LEFT = """async () => {
  const names = await caches.keys();
  const d = await new Promise(res => { const r = indexedDB.open('appts-thumbs', 1); r.onupgradeneeded = () => r.result.createObjectStore('thumbs'); r.onsuccess = () => res(r.result); });
  const v = await new Promise(res => { const q = d.transaction('thumbs').objectStore('thumbs').get('stale-key'); q.onsuccess = () => res(q.result || null); });
  d.close(); return { cache: names.includes('appts-offline-acct-stale-old'), idb: !!v, names }; }"""
CACHED_THUMBS = """async () => { const c = await caches.open('appts-offline-acct-demo'); const out = [];
  for (const r of await c.keys()) if (r.url.includes('action=thumb&')) { const m = await c.match(r); out.push({ url: r.url, type: m.headers.get('Content-Type') }); }
  const s = await caches.open('appts-offline-shell'); const pdfjs = (await s.keys()).filter(r => r.url.includes('vendor/pdfjs/')).length;
  return { thumbs: out, pdfjs }; }"""

tmp = pathlib.Path(tempfile.mkdtemp(prefix='appts-cache-'))
server = Server(tmp).start()
pw = demo_password()
try:
    anon = Client(server)
    ok(anon.api('thumbs')[0] == 401, 'api.php?action=thumbs requires sign-in')
    api = Client(server); api.login('demo', pw); api.api('data')  # first read seeds the demo files
    thumbs = api.api('thumbs')[1]['thumbs']
    ok(len(thumbs) >= 1 and all(k.endswith('.pdf') and v.isdigit() for k, v in thumbs.items()), f'thumbs lists each stored preview with its version ({len(thumbs)})')
    status, plan = api.api('offline-plan')
    ok('api.php?action=thumbs' in [d['url'] for d in plan['data']], 'the offline plan saves the thumb versions')
    ok({'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js'} <= {s['url'] for s in plan['shell']}, 'the offline plan saves pdf.js, so in-browser previews work from the saved copy')
    pdfs = [u for c in plan['conditions'] for u in c['uploads'] if u['kind'] == 'pdf']
    ok(pdfs and all(u.get('thumb', {}).get('url') == f"api.php?action=thumb&id={u['id']}&v={thumbs[u['id']]}" for u in pdfs if u['id'] in thumbs), 'each PDF in the plan carries its versioned preview URL')
    one = next(iter(thumbs))
    st, body, h = api.raw(f'api.php?action=thumb&id={one}&v={thumbs[one]}')
    ok(st == 200 and h.get('Content-Type') == 'image/jpeg' and 'immutable' in h.get('Cache-Control', '') and h.get('ETag'), 'a versioned thumb URL is a cacheable JPEG with an ETag')
    st, _, h2 = api.raw(f'api.php?action=thumb&id={one}')
    ok(st == 200 and 'no-cache' in h2.get('Cache-Control', ''), 'an unversioned thumb URL must revalidate')
    st, body, _ = api.raw(f'api.php?action=thumb&id={one}&v=1', headers={'If-None-Match': h['ETag']})
    ok(st == 304 and not body, 'If-None-Match with the same ETag answers 304')
    st, body, h3 = api.raw('api.php?action=thumb&id=' + '0' * 64 + '.pdf')
    ok(st == 404 and 'no-store' in h3.get('Cache-Control', ''), 'a missing preview is a 404 that is never cached')

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_context(viewport={'width': 1280, 'height': 900}).new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(server.url('')); pg.click('#fill-demo'); pg.click('#login-form [type=submit]'); pg.wait_for_selector('.condition-card')
        wait_js(pg, "navigator.serviceWorker.controller !== null", 10000)
        pg.evaluate("location.hash = '#/documents'"); pg.wait_for_selector('.doc-card[data-doc-kind=pdf]')
        wait_js(pg, "document.querySelectorAll('.doc-card img.pdf-thumb-img.ready').length > 0")
        srcs = pg.evaluate("[...document.querySelectorAll('.doc-card img.pdf-thumb-img')].map(i => i.getAttribute('src'))")
        ok(srcs and all('&v=' in s for s in srcs) and any(f"&v={thumbs[one]}" in s for s in srcs), 'Documents asks for thumbs with ?v=<version>')

        # ---- turn on: every old cache and the preview cache are dropped, then fresh copies saved
        pg.evaluate(SEED_STALE); ok(pg.evaluate(STALE_LEFT)['cache'] and pg.evaluate(STALE_LEFT)['idb'], 'seeded a stale cache and a stale "PDF" preview')
        pg.click('#offline-slot .offline-pill'); pg.wait_for_selector('#offline-dialog[open] [data-offline=on]:not([disabled])')
        pg.click('#offline-dialog [data-offline=on]'); pg.wait_for_selector('#offline-dialog .offline-onoff.on', timeout=60000)
        left = pg.evaluate(STALE_LEFT)
        ok(not left['cache'] and not left['idb'], f'turning Offline mode on invalidates every cache first ({left["names"]})')
        saved = pg.evaluate(CACHED_THUMBS)
        ok(len(saved['thumbs']) == len([u for u in pdfs if 'thumb' in u]) and all(t['type'] == 'image/jpeg' for t in saved['thumbs']) and saved['pdfjs'] == 2, f"fresh previews saved: {len(saved['thumbs'])} JPEG thumbs + pdf.js")
        pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_selector('.doc-card[data-doc-kind=pdf]')
        wait_js(pg, "document.querySelectorAll('.doc-card img.pdf-thumb-img.ready').length === document.querySelectorAll('.doc-card[data-doc-kind=pdf]').length")
        ok(True, 'in Offline mode every PDF card shows its page-1 preview from the saved copy')

        # ---- a change, then off + sync: invalidated again and re-saved
        pg.evaluate("(async () => { const m = await import('./js/store.js'); const e = m.store.doc.entries[0]; await m.save([m.put('entry', { ...e, title: e.title + ' (synced)' })]); })()")
        pg.wait_for_timeout(400); pg.evaluate(SEED_STALE)
        pg.click('#offline-slot .offline-pill'); pg.wait_for_selector('#offline-dialog[open] [data-offline=off]')
        pg.click('#offline-dialog [data-offline=off]'); pg.wait_for_selector('#offline-dialog [data-offline=sync]')
        pg.click('#offline-dialog [data-offline=sync]'); wait_js(pg, "document.querySelector('#status').textContent.includes('Synced')", 20000)
        wait_js(pg, "caches.keys().then(n => !n.includes('appts-offline-acct-stale-old'))")
        left = pg.evaluate(STALE_LEFT)
        ok(not left['cache'] and not left['idb'], 'sync invalidates every cache and the preview cache')
        wait_js(pg, "(async () => { const c = await caches.open('appts-offline-acct-demo'); return (await c.keys()).some(r => r.url.includes('action=thumb&')); })()", 30000)
        ok(len(pg.evaluate(CACHED_THUMBS)['thumbs']) == len(saved['thumbs']), 'after sync the saved copy is pulled in again, previews included')

        # ---- a new release: browser-made previews are forgotten
        pg.evaluate(SEED_STALE); pg.evaluate("localStorage.setItem('appts-assets-version', 'older-release')")
        pg.evaluate("(async () => { await (await import('./js/offline.js')).forgetStaleAssets(); })()"); pg.wait_for_timeout(500)
        ok(not pg.evaluate(STALE_LEFT)['idb'] and pg.evaluate("localStorage.getItem('appts-assets-version')") == pg.evaluate("document.querySelector('meta[name=appts-version]').content"), 'a new app version clears the preview cache')
        ok(not errors, f'no page errors ({errors[:2]})')
        browser.close()
finally:
    server.stop()
print(f'cache-refresh: {checks} checks passed')
