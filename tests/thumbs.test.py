"""PDF page-1 previews (t64u): server thumbnails in the Documents grid, entry attachments, and the
📎 gallery; the thumb endpoint; and the browser fallback (vendored pdf.js + IndexedDB cache) when
the server has no generator (APPTS_THUMB_TOOL=none). Run: python3 tests/thumbs.test.py [--no-screens]"""
import os, pathlib, shutil, sys, tempfile, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, Client, demo_password
from playwright.sync_api import sync_playwright

WANT = '--no-screens' not in sys.argv
SHOTS = pathlib.Path(os.environ.get('APPTS_SHOTS') or (ROOT / 'docs' / 'screenshots' / 'ui'))
checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)
    print('  ok -', what)
def shot(pg, name, **kw):
    if WANT: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / name), **kw)

pw = demo_password()
def wait_js(pg, fn, timeout=30000):
    # Poll from Python: page.wait_for_function needs eval, which the app's CSP (rightly) refuses.
    import time; end = time.time() + timeout / 1000
    while time.time() < end:
        if pg.evaluate(fn): return True
        pg.wait_for_timeout(150)
    raise AssertionError('timed out waiting for ' + fn[:90])
def run(tool, browser):
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='appts-th-'))
    old = os.environ.get('APPTS_THUMB_TOOL')
    if tool: os.environ['APPTS_THUMB_TOOL'] = tool
    else: os.environ.pop('APPTS_THUMB_TOOL', None)
    server = Server(tmp).start()
    try:
        c = Client(server)
        st, _ = c.api('data'); ok(st == 401, 'data needs a login')
        st, _, _ = c.raw('api.php?action=thumb&id=' + 'a' * 64 + '.pdf'); ok(st == 401, 'the thumb endpoint needs a login')
        c.login('demo', pw); st, body = c.api('data'); pdfs = [a for e in body['doc']['entries'] for a in e.get('attachments', []) if a['id'].endswith('.pdf')]
        ok(len(pdfs) >= 3, f'demo has PDFs ({len(pdfs)})')
        st, raw, h = c.raw('api.php?action=thumb&id=' + pdfs[0]['id'])
        st2, raw2, h2 = c.raw('api.php?thumb=' + pdfs[0]['id'])
        st3, _, _ = c.raw('api.php?action=thumb&id=' + 'c' * 64 + '.pdf')
        st4, _, _ = c.raw('api.php?action=thumb&id=../../x.pdf')
        if tool == 'none':
            ok(st == 404 and st2 == 404, 'with no generator the thumb endpoint answers 404 (the browser draws it instead)')
        else:
            ok(st == 200 and h.get('Content-Type') == 'image/jpeg' and raw[:2] == b'\xff\xd8' and 'sandbox' in h.get('Content-Security-Policy', ''), 'action=thumb returns a sandboxed JPEG')
            ok(st2 == 200 and raw2 == raw, 'api.php?thumb=<id> returns the same JPEG')
        ok(st3 == 404 and st4 == 404, 'unknown or malformed ids get 404')

        pg = browser.new_context(viewport={'width': 1360, 'height': 950}).new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(server.url('')); pg.click('#fill-demo'); pg.click('#login-form [type=submit]'); pg.wait_for_selector('.condition-card')
        pg.evaluate("location.hash = '#/documents'"); pg.wait_for_selector('.doc-card[data-doc-kind=pdf]')
        wait_js(pg, "() => [...document.querySelectorAll('.doc-card[data-doc-kind=pdf] img.pdf-thumb-img')].every(i => i.classList.contains('ready') && i.naturalWidth > 0)")
        srcs = pg.eval_on_selector_all('.doc-card[data-doc-kind=pdf] img.pdf-thumb-img', 'l => l.map(i => i.currentSrc)')
        ok(len(srcs) >= 3, f'every PDF card in Documents shows a page-1 preview ({len(srcs)})')
        if tool == 'none':
            ok(all(s.startswith('blob:') for s in srcs), 'with no server generator the previews are drawn in the browser (pdf.js)')
            n = pg.evaluate("""() => new Promise(r => { const q = indexedDB.open('appts-thumbs'); q.onsuccess = () => { const c = q.result.transaction('thumbs').objectStore('thumbs').count(); c.onsuccess = () => r(c.result); }; })""")
            ok(n >= 3, f'browser-drawn previews are cached in IndexedDB ({n})')
            hits = []; pg.on('request', lambda r: hits.append(r.url) if 'action=file' in r.url else None)
            pg.reload(); pg.wait_for_selector('.doc-card[data-doc-kind=pdf]')
            wait_js(pg, "() => { const l = [...document.querySelectorAll('.doc-card[data-doc-kind=pdf] img.pdf-thumb-img')]; return l.length && l.every(i => i.classList.contains('ready')); }")
            ok(not hits, 'after a reload the cached previews are used without downloading the PDFs again')
            shot(pg, 'pdf-thumbs-browser-fallback.png')
        else:
            ok(all('action=thumb' in s for s in srcs), 'the previews come from the server thumbnail')
            shot(pg, 'pdf-thumbs-documents.png')
        light = pg.eval_on_selector('.doc-card[data-doc-kind=pdf] img.pdf-thumb-img', """i => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 40, 40); const d = x.getImageData(0, 0, 40, 40).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k]; return s / (d.length / 4); }""")
        ok(light > 180, f'the preview is a light document page, not the dark PDF tile (mean {light:.0f})')

        # entry attachments (detail view)
        pg.click('.doc-card[data-doc-kind=pdf] .owner [data-action=open-entry]'); pg.wait_for_selector('dialog[open] .attachments')
        wait_js(pg, "() => { const i = document.querySelector('dialog[open] .attachments img.pdf-thumb-img'); return i && i.classList.contains('ready'); }")
        ok(True, 'the entry detail shows the PDF preview in its attachments')
        shot(pg, f'pdf-thumbs-entry{"-fallback" if tool == "none" else ""}.png')
        pg.keyboard.press('Escape')

        # 📎 gallery
        pg.evaluate("location.hash = '#/timeline'"); pg.wait_for_selector('.att-icon[data-gallery]')
        icons = pg.locator('.att-icon[data-gallery]')
        for i in range(icons.count()):
            icons.nth(i).hover(); pg.wait_for_selector('#att-gallery:not([hidden])')
            if pg.locator('#att-gallery img.pdf-thumb-img').count(): break
            pg.mouse.move(5, 5); pg.wait_for_timeout(300)
        wait_js(pg, "() => { const i = document.querySelector('#att-gallery img.pdf-thumb-img'); return i && i.classList.contains('ready'); }")
        ok(True, 'the 📎 gallery shows the PDF preview')
        if tool != 'none': shot(pg, 'pdf-thumbs-gallery.png')
        ok(errors == [], f'no page errors: {errors}')
        pg.context.close()
    finally:
        server.stop(); shutil.rmtree(tmp, ignore_errors=True)
        if old is None: os.environ.pop('APPTS_THUMB_TOOL', None)
        else: os.environ['APPTS_THUMB_TOOL'] = old

with sync_playwright() as p:
    browser = p.chromium.launch()
    print('# server generator (whatever this PHP has)'); run(None, browser)
    print('# no server generator: browser fallback'); run('none', browser)
    browser.close()
print(f'PASS: {checks} PDF preview checks.')
