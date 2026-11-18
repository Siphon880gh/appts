"""Offline mode gates (G40-G49) in headless Chromium against php -S with temp storage, demo and temp
accounts only (never wf). Turn it on while the server runs, stop the server, reload, open every view
and a document, queue edits (entry edit, new entry with a pasted image, type edit), restart, turn it
off, sync, and confirm through the API that the edits were saved and merged with a server-side edit.
Run: python3 tests/offline.test.py [--no-screens]"""
import base64, json, os, pathlib, shutil, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, Client, demo_password, PHP
from playwright.sync_api import sync_playwright

SCREENS = ROOT / 'docs' / 'screenshots'
WANT_SCREENS = '--no-screens' not in sys.argv
php = lambda code, env=None: subprocess.run([PHP, '-r', code], cwd=ROOT, capture_output=True, check=True, env=dict(os.environ, **(env or {}))).stdout
PNG_B64 = base64.b64encode(php('require "includes/demo-seed.php"; echo synthetic_png("Clinic letter photo", [30, 110, 90]);')).decode()
checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)
    print('  ok -', what)

PASTE_JS = """([selector, b64, name, mime]) => {
  const target = document.querySelector(selector); const dt = new DataTransfer(); const bin = atob(b64);
  dt.items.add(new File([Uint8Array.from(bin, c => c.charCodeAt(0))], name, { type: mime }));
  target.focus(); target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}"""
def wait_js(page, expr, timeout=15000):
    """Poll a JS expression (wait_for_function's string eval is blocked by the app's CSP)."""
    import time
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception: pass
        page.wait_for_timeout(150)
    raise SystemExit(f'FAIL: timed out waiting for {expr}')
FETCH_JS = """async url => { try { const r = await fetch(url, { headers: { 'X-Appts': '1' } }); const b = await r.blob();
  return { status: r.status, type: r.headers.get('Content-Type') || '', size: b.size, marker: r.headers.get('X-Appts-Offline') || '' }; } catch (e) { return { status: 0, error: String(e) }; } }"""

tmp = pathlib.Path(tempfile.mkdtemp(prefix='appts-offline-'))
real_storage = ROOT / 'storage'
before_real = sorted(p.name for p in real_storage.glob('**/*')) if real_storage.exists() else []
# A second account in the same temp storage, with its own condition and upload: must never be in demo's plan.
OTHER = php("""require "includes/domain.php"; require "includes/uploads.php"; require "includes/demo-seed.php";
$f = store_bytes('otheracct', synthetic_png('Other account only', [200, 30, 30]));
$doc = new_doc(); $doc['conditions'][] = ['id' => 'cond-other-secret', 'name' => 'Other account secret condition', 'status' => 'active', 'color' => '#aa3333', 'diagnosedOn' => '', 'summary' => '', 'notes' => ['html' => '', 'text' => '', 'imageIds' => []], 'attachments' => [['id' => $f['id'], 'name' => 'secret.png', 'kind' => 'image', 'mime' => 'image/png', 'bytes' => $f['bytes'], 'label' => 'other', 'addedAt' => '2026-01-01']], 'sortOrder' => 0];
write_doc('otheracct', $doc); echo $f['id'];""", {'APPTS_STORAGE_DIR': str(tmp)}).decode()

server = Server(tmp).start()
port = server.port
pw = demo_password()
base = server.url('')
try:
    # ---- G41: offline-plan (logged-in only, this account only, deduplicated, sized)
    anon = Client(server)
    ok(anon.api('offline-plan')[0] == 401, 'offline-plan requires sign-in (G41)')
    ok(anon.api('version')[0] == 200 and len(anon.api('version')[1]['version']) == 10, 'api.php?action=version answers without sign-in (G45)')
    api = Client(server); ok(api.login('demo', pw)[0] == 200, 'demo signs in over the API')
    status, plan = api.api('offline-plan')
    ok(status == 200 and plan['account'] == 'demo', 'offline-plan answers for the signed-in account')
    urls = [x['url'] for x in plan['shell']]
    ok(all(u in urls for u in ['./', 'index.php', 'styles.css', 'js/app.js', 'js/offline.js', f"manifest.php?v={plan['version']}"]), 'plan lists the shell: page, styles, every module, manifest (G41)')
    ok(all(x['bytes'] > 0 for x in plan['shell']), 'every shell item has a byte size')
    ok([d['url'] for d in plan['data']] == ['api.php?action=session', 'api.php?action=data', 'api.php?action=images', 'api.php?action=files'], 'plan lists the account data through the API (G41)')
    ok({'index.php#/', 'index.php#/timeline', 'index.php#/upcoming', 'index.php#/documents', 'index.php#/types'} <= set(plan['views']) and sum(v.startswith('index.php#/c/') for v in plan['views']) == len(plan['conditions']) == 3, 'plan lists a URL for every view, one per condition (G41)')
    ups = [u for c in plan['conditions'] for u in c['uploads']]
    ok(ups and all(u['bytes'] > 0 and u['url'] == f"api.php?action=file&id={u['id']}" for u in ups), 'uploads are listed per condition with byte sizes')
    ok(all(len({u['id'] for u in c['uploads']}) == len(c['uploads']) for c in plan['conditions']) and plan['estimate']['uploads'] == len({u['id'] for u in ups}), 'uploads are deduplicated, and the estimate counts each once')
    ok(plan['estimate']['totalBytes'] == plan['estimate']['shellBytes'] + plan['estimate']['dataBytes'] + plan['estimate']['uploadBytes'] > 0, 'plan carries a size estimate')
    raw = json.dumps(plan)
    ok(OTHER not in raw and 'Other account secret' not in raw and 'cond-other-secret' not in raw, "another account's condition and upload never appear in the plan (G41)")
    ok(api.raw(f'api.php?action=file&id={OTHER}')[0] == 404, "the other account's upload is not readable as demo")
    status, body, headers = anon.raw('sw.php')
    ok(status == 200 and 'javascript' in headers.get('Content-Type', '') and plan['version'].encode() in body and 'no-store' in headers.get('Cache-Control', ''), 'sw.php serves the worker with the version, not cached (G45)')
    status, body, _ = anon.raw(f"manifest.php?v={plan['version']}")
    man = json.loads(body)
    ok(status == 200 and man['start_url'] == './index.php' and man['scope'] == './' and len(man['icons']) == 3, 'manifest.php is a web app manifest scoped to the app folder (G45)')

    with sync_playwright() as p:
        channel = os.environ.get('APPTS_BROWSER_CHANNEL')
        browser = p.chromium.launch(**({'channel': channel} if channel else {}))
        ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
        errors = []
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(base); pg.click('#fill-demo'); pg.click('#login-form [type=submit]'); pg.wait_for_selector('.condition-card')
        ok(pg.evaluate("document.querySelector('link[rel=manifest]').getAttribute('href')") == f"manifest.php?v={plan['version']}", 'page links the manifest with the version (G45)')
        wait_js(pg, "navigator.serviceWorker.controller !== null", 10000)
        scope = pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r.scope)")
        ok(scope == base, 'service worker registered with the app folder as scope under php -S (G40)')
        ok(pg.locator('#offline-slot .offline-pill').inner_text().replace('\n', ' ').strip() == 'Offline Off', 'header shows the Offline mode toggle, off (G40)')
        order = pg.evaluate("[...document.querySelector('body > header').children].map(e => e.id || e.className)")
        inner = pg.evaluate("[[...document.querySelector('#offline-slot').children].map(e => e.className), [...document.querySelector('#account-actions').children].map(e => e.className)]")
        ok(order == ['brand', 'local', 'offline-slot', 'nav', 'account-actions'] and inner == [['offline-controls', 'nav-sep'], ['more-wrap']] and pg.locator('.nav-sep').get_attribute('aria-hidden') == 'true', f'the Offline group and a separator sit at the left of the navbar, before the main links; "…" is alone at the right ({order}, {inner}) (G50)')
        left = pg.evaluate("[document.querySelector('.nav-sep').getBoundingClientRect().right, document.querySelector('#nav a').getBoundingClientRect().left]")
        ok(left[0] < left[1] and not pg.evaluate("document.querySelector('body > header').classList.contains('offline-collapsed')"), f'desktop (1280px): inline, separator before the first nav link ({left}) (G50, G59)')
        ok(pg.evaluate("document.querySelector('.nav-sep').getBoundingClientRect().width") == 1 and pg.locator('.nav-sep').is_visible(), 'the separator is a visible 1px rule at desktop width (G50)')
        if WANT_SCREENS: SCREENS.mkdir(exist_ok=True); pg.locator('body > header').screenshot(path=SCREENS / 'header-desktop.png')

        # ---- G58: account and demo options collapsed under "…" (t19u)
        btn, menu = pg.locator('#more-btn'), pg.locator('#more-menu')
        focused = lambda: pg.evaluate("document.activeElement.dataset.action || document.activeElement.id")
        visible_text = pg.evaluate("document.querySelector('#account-actions').innerText")
        ok(btn.get_attribute('aria-haspopup') == 'menu' and btn.get_attribute('aria-expanded') == 'false' and btn.get_attribute('aria-controls') == 'more-menu' and 'More' in btn.get_attribute('aria-label') and menu.is_hidden(), 'the "…" button is a closed menu button (aria-haspopup, aria-expanded, aria-controls, label) (G58)')
        ok('Sign out' not in visible_text and 'Reset demo' not in visible_text and 'Demo Patient' not in visible_text, 'name, Reset demo, and Sign out are not in the header until the menu opens (G58)')
        btn.click()
        ok(btn.get_attribute('aria-expanded') == 'true' and menu.is_visible() and menu.get_attribute('role') == 'menu' and focused() == 'reset-demo', 'clicking "…" opens the menu with focus on the first item (G58)')
        mt = menu.inner_text()
        ok('Demo Patient' in mt and 'Signed in as demo' in mt and 'Reset demo data' in mt and 'Sign out' in mt and pg.locator('#more-menu [role=menuitem]:visible').count() == 2 and pg.locator('#more-menu .more-offline').is_hidden(), 'with room for the inline group, the menu holds who is signed in, the demo option, and Sign out (G58)')
        pg.keyboard.press('ArrowDown'); a = focused(); pg.keyboard.press('ArrowDown'); b = focused(); pg.keyboard.press('End'); c = focused(); pg.keyboard.press('Home'); d = focused()
        ok([a, b, c, d] == ['logout', 'reset-demo', 'logout', 'reset-demo'], f'↓ moves and wraps, End/Home jump ({[a, b, c, d]}) (G58)')
        pg.keyboard.press('Escape')
        ok(menu.is_hidden() and btn.get_attribute('aria-expanded') == 'false' and focused() == 'more-btn', 'Escape closes it and returns focus to "…" (G58)')
        pg.keyboard.press('ArrowUp')
        ok(menu.is_visible() and focused() == 'logout', '↑ on the button opens the menu on the last item (G58)')
        pg.keyboard.press('Tab'); ok(menu.is_hidden(), 'Tab closes the menu')
        btn.focus(); pg.keyboard.press('Enter')
        ok(menu.is_visible() and focused() == 'reset-demo', 'Enter on the button opens it from the keyboard (G58)')
        pg.mouse.click(640, 600)
        ok(menu.is_hidden() and btn.get_attribute('aria-expanded') == 'false', 'a click outside closes it (G58)')
        btn.click(); pg.evaluate("location.hash = '#/timeline'"); pg.wait_for_selector('#tl-presets')
        ok(pg.locator('#more-menu').is_hidden() and pg.locator('#more-btn').get_attribute('aria-expanded') == 'false', 'navigating closes it (G58)')
        pg.evaluate("location.hash = '#/'"); pg.wait_for_selector('.condition-card')
        pg.locator('#more-btn').click()
        r = pg.evaluate("(() => { const m = document.querySelector('#more-menu').getBoundingClientRect(); return [m.left, m.right, innerWidth]; })()")
        ok(r[0] >= 0 and r[1] <= r[2], f'the open menu stays on screen at desktop width ({r}) (G58)')
        if WANT_SCREENS: pg.screenshot(path=SCREENS / 'header-menu-open.png', clip={'x': 0, 'y': 0, 'width': 1280, 'height': 330})
        pg.keyboard.press('Escape')
        other = pg.evaluate("(async () => (await import('./js/moreMenu.js')).moreMenuHTML({ displayName: 'Pat Lee', username: 'pat', isDemo: false }))()")
        ok('reset-demo' not in other and 'data-action="logout"' in other and 'Demo' not in other, 'a real account sees no demo options in its menu (G58)')

        # ---- G42: (i) explainer
        pg.click('#offline-slot .offline-info'); pg.wait_for_selector('#offline-dialog[open] .offline-art')
        info = pg.locator('#offline-dialog').inner_text()
        lead = pg.locator('#offline-dialog .offline-lead')
        ok(lead.inner_text() == 'Want to show clinical information to your doctor?' and pg.evaluate("(() => { const l = document.querySelector('#offline-dialog .offline-lead'), a = document.querySelector('#offline-dialog .offline-art'); return !!(l.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) && getComputedStyle(l).fontWeight === '800' && getComputedStyle(l).color === 'rgb(23, 41, 67)'; })()"), 'the explainer opens with the bold, brand-colored headline above the clinic picture (G51)')
        ok("Turn this on first, while you're still online" in info and "don't share their internet" in info, 'the (i) explainer says to turn it on first, while still online (G42)')
        ok(pg.evaluate("!!document.querySelector('#offline-dialog svg title') && document.querySelector('#offline-dialog svg').getAttribute('role') === 'img'") and 'clinic' in pg.locator('#offline-dialog svg title').text_content().lower(), 'the explainer has an inline, labelled SVG of a clinic with no Wi-Fi (G42)')
        ok(pg.evaluate("[...document.querySelectorAll('#offline-dialog img, #offline-dialog script')].length") == 0, 'the illustration needs no extra files (inline SVG only)')
        if WANT_SCREENS: SCREENS.mkdir(exist_ok=True); pg.locator('#offline-dialog').screenshot(path=SCREENS / 'offline-info.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        ok(not pg.evaluate("document.querySelector('#offline-dialog').open"), 'Escape closes the explainer')

        # ---- G43: turning on (choose conditions, estimate, persist, fill n of N)
        pg.click('#offline-slot .offline-pill'); pg.wait_for_selector('#offline-dialog[open] input[name=offline-cond]')
        ok(pg.locator('input[name=offline-cond]').count() == 3 and pg.locator('input[name=offline-cond]:checked').count() == 3, 'setup lists each condition to choose, all checked (G43)')
        est = pg.locator('.offline-estimate').inner_text()
        ok('About' in est and 'items' in est and 'free on this device' in est, f'setup shows the size estimate against free storage: "{est}" (G43)')
        progress = []
        pg.expose_function('__progress', lambda t: progress.append(t))
        pg.evaluate("new MutationObserver(() => { const t = document.querySelector('.offline-progress-text'); if (t && t.textContent) window.__progress(t.textContent); }).observe(document.querySelector('#offline-dialog'), { subtree: true, childList: true, characterData: true })")
        pg.click('#offline-dialog [data-offline=on]'); pg.wait_for_selector('#offline-dialog .offline-onoff.on', timeout=30000)
        ok(any(t.startswith('Saving ') and ' of ' in t for t in progress), f'progress reads "n of N" while saving ({progress[-1] if progress else "none"}) (G43)')
        state = pg.evaluate("JSON.parse(localStorage.getItem('appts-offline'))")
        ok(state['on'] and state['items'] > 20 and state['bytes'] > 50000 and state['failed'] == 0 and state['version'] == plan['version'], f"state saved: {state['items']} items, {state['bytes']} bytes (G43)")
        panel = pg.locator('#offline-dialog .offline-status').text_content()
        ok('On' in panel and 'Last saved' in panel and str(state['items']) in panel and ('KB' in panel or 'MB' in panel), 'status panel shows on/off, last saved, items, and size (G44)')
        ok(pg.locator('#offline-slot .offline-pill.on').count() == 1, 'header toggle shows On')
        # ---- G59: no room -> the Offline group moves into "…" with its live state; room again -> back inline
        pg.click('#offline-dialog [data-offline-close]')
        pg.set_viewport_size({'width': 375, 'height': 812}); wait_js(pg, "document.querySelector('body > header').classList.contains('offline-collapsed')", 5000)
        pg.click('#more-btn'); toggle = pg.locator('#more-menu .more-offline-toggle')
        ok(pg.locator('#offline-slot').is_hidden() and toggle.is_visible() and 'On' in toggle.inner_text() and pg.locator('#more-menu .more-offline-toggle.on').count() == 1 and toggle.get_attribute('aria-label').startswith('Offline mode: on'), 'collapsed at 375px: the menu shows Offline mode with its live state (On) (G59)')
        pg.keyboard.press('Escape')
        pg.set_viewport_size({'width': 1280, 'height': 900}); wait_js(pg, "!document.querySelector('body > header').classList.contains('offline-collapsed')", 5000)
        pg.click('#more-btn')
        ok(pg.locator('#offline-slot .offline-pill.on').is_visible() and pg.locator('#more-menu .more-offline').is_hidden() and pg.evaluate("!document.querySelector('#offline-slot').inert"), 'back at 1280px: the inline group returns (still On) and leaves the menu (G59)')
        pg.keyboard.press('Escape')
        pg.click('#offline-slot .offline-pill'); pg.wait_for_selector('#offline-dialog[open] .offline-status')
        if WANT_SCREENS: pg.locator('#offline-dialog').screenshot(path=SCREENS / 'offline-panel.png')
        pg.click('#offline-dialog [data-offline-close]')
        caches_ = pg.evaluate("caches.keys()")
        ok(set(caches_) >= {'appts-offline-shell', 'appts-offline-acct-demo', 'appts-offline-state'} and 'appts-offline-acct-otheracct' not in caches_, f'caches: {sorted(caches_)} (G43)')

        # ---- G46: on = cache only, even with the server running; only the version check reaches it
        r = pg.evaluate(FETCH_JS, 'api.php?action=session&probe=1')
        ok(r['status'] in (504, 200) and r['marker'] == 'miss', 'with the mode on, an unsaved API URL is not fetched even though the server is up (G46)')
        r = pg.evaluate(FETCH_JS, 'api.php?action=version')
        ok(r['status'] == 200, 'the version check still reaches the server (G46)')
        r = pg.evaluate(FETCH_JS, 'api.php?action=data&v=9&t=1')
        ok(r['status'] == 200 and 'json' in r['type'], 'normalized lookup ignores v and t (G46)')

        # ---- stop the server: everything from the copy
        server.stop()
        pg.goto(base); pg.wait_for_selector('.condition-card', timeout=10000)
        ok(pg.locator('.condition-card').count() == 3, 'server stopped: the front page URL (dir/) opens from the copy (G46)')
        for url in ['index.php', 'index.php?from=bookmark&v=3', '']:
            pg.goto(base + url); pg.wait_for_selector('.condition-card', timeout=10000)
        ok(True, 'index.php and index.php?anything open the saved app page (nearest saved page)')
        views = ['#/', '#/upcoming', '#/timeline', '#/documents', '#/types'] + [f"#/c/{c['id']}" for c in plan['conditions']]
        for v in views:
            pg.evaluate(f"location.hash = '{v}'"); pg.wait_for_timeout(250)
            text = pg.locator('#app').inner_text()
            ok(len(text) > 80 and 'Could not' not in text and 'Opening your records' not in text, f'offline view {v} renders from the copy (G46)')
        pg.evaluate("location.hash = '#/documents'"); pg.wait_for_selector('.doc-card [data-action=view-file][data-kind=pdf]')
        pg.click('.doc-card [data-action=view-file][data-kind=pdf] >> nth=0'); pg.wait_for_selector('#viewer[open] iframe')
        src = pg.evaluate("document.querySelector('#viewer iframe').getAttribute('src')")
        r = pg.evaluate(FETCH_JS, src)
        ok(r['status'] == 200 and r['type'] == 'application/pdf' and r['size'] > 500, f'a PDF opens offline from the copy (viewer src with name=) (G46)')
        pg.click('#viewer [data-close] >> nth=0')
        img = next(u for u in ups if u['kind'] == 'image')
        r = pg.evaluate(FETCH_JS, f"api.php?action=image&id={img['id']}")
        ok(r['status'] == 200 and r['type'].startswith('image/'), 'an image URL (action=image) is served from the saved file copy (G46)')
        pg.goto(base + 'not-a-page.php'); 
        ok('Not saved for offline use' in pg.locator('body').inner_text(), 'an unknown page shows the friendly "not saved" page, not a browser error (G46)')

        # ---- G47: edits queue on this device
        pg.goto(base + '#/c/cond-skin'); pg.wait_for_selector('.entry-row')
        target = pg.evaluate("(async () => { const m = await import('./js/store.js'); return m.store.doc.entries.find(e => e.id === 'visit-biopsy'); })()")
        pg.click(f".entry-row[data-id='{target['id']}']"); pg.click('dialog[open] [data-action=edit-entry]'); pg.wait_for_selector('#entry-title')
        pg.fill('#entry-title', 'Wound check (edited offline)'); pg.click('#entry-form [type=submit]')
        pg.wait_for_selector('.dialog-head h2:has-text("Wound check (edited offline)")')
        ok('Kept on this device' in pg.locator('#status').inner_text(), 'an entry edit offline is kept on this device (G47)')
        pg.click('dialog[open] [data-close] >> nth=0')
        pg.select_option('#add-type', 'letter')
        pg.wait_for_selector('#entry-title'); pg.fill('#entry-title', 'Clinic letter (photo offline)')
        pg.evaluate(PASTE_JS, ['#entry-notes', PNG_B64, 'letter.png', 'image/png']); pg.wait_for_selector('#entry-notes img')
        pg.click('#entry-form [type=submit]'); pg.wait_for_selector('.dialog-head h2:has-text("Clinic letter (photo offline)")')
        pg.wait_for_selector('dialog[open] .note-content img')
        r = pg.evaluate(FETCH_JS, pg.evaluate("document.querySelector('dialog[open] .note-content img').getAttribute('src')"))
        ok(r['status'] == 200 and r['type'] == 'image/png', 'a pasted image offline is stored on this device and shows in the entry (G47)')
        pg.click('dialog[open] [data-close] >> nth=0')
        pg.evaluate("(async () => { const m = await import('./js/store.js'); const t = m.store.doc.types.find(t => t.id === 'supply'); await m.save([m.put('type', { ...t, name: 'Supplies (renamed offline)' })], 'Type saved.'); })()")
        # t18u: a Disruptions edit offline queues like any record and merges on sync (G53).
        pg.evaluate("(async () => { const m = await import('./js/store.js'); const S = await import('./js/schema.js'); await m.save([m.put('filter', S.toggleDisruption(m.store.doc, 'visit-biopsy'))], 'Added to Disruptions.'); })()")
        pending = pg.evaluate("(async () => (await import('./js/outbox.js')).listPending())()")
        ok(len(pending) == 4 and {x['kind'] for x in pending} == {'entry', 'type', 'filter'}, f'4 queued records (entry edit, new entry, type edit, Disruptions edit) (G47)')
        files = pg.evaluate("(async () => (await import('./js/outbox.js')).listFiles())()")
        ok(len(files) == 1, 'the pasted image is queued as a file (G47)')
        pg.goto(base + '#/c/cond-skin'); pg.wait_for_selector('.entry-row')
        ok(pg.locator('.entry-row:has-text("Wound check (edited offline)")').count() == 1 and pg.locator('.entry-row:has-text("Clinic letter (photo offline)")').count() == 1, 'after an offline reload the queued edits are still shown (G47)')
        ok(pg.locator('#offline-slot .offline-count').inner_text() == '5', 'the toggle shows 5 changes waiting (4 records + 1 file)')
        pg.click('#more-btn'); pg.click('#more-menu [data-action=logout]'); pg.wait_for_selector('#offline-dialog[open] .offline-warn')
        ok('saved only on this device' in pg.locator('.offline-warn').inner_text() and pg.locator('.condition-card, .entry-row').count() > 0, 'sign-out warns about unsynced changes and does not sign out (G48)')
        pg.click('#offline-dialog [data-offline-close]')
        pg.click('#more-btn'); pg.click('#more-menu [data-action=reset-demo]')
        ok('sync' in pg.locator('#status').inner_text().lower(), 'Reset demo is blocked while changes are queued')

        # ---- G48: restart, a server-side edit meanwhile, turn off, sync, merged
        server = Server(tmp, port=port).start()
        srv = Client(server); srv.login('demo', pw)
        doc = srv.api('data')[1]['doc']
        e = next(x for x in doc['entries'] if x['id'] == target['id'])
        e2 = {**e, 'values': {**e.get('values', {}), 'location': 'Changed on the server meanwhile'}}
        ok(srv.api('ops', {'ops': [{'op': 'put', 'kind': 'entry', 'value': e2}]})[0] == 200, 'server-side edit to another field of the same entry while offline')
        pg.click('#offline-slot .offline-pill'); pg.wait_for_selector('#offline-dialog[open] [data-offline=off]')
        pg.click('#offline-dialog [data-offline=off]'); pg.wait_for_selector('#offline-dialog [data-offline=sync]')
        ok('5 changes made offline are ready to sync' in pg.locator('#offline-dialog').inner_text(), 'turning it off offers to sync (G48)')
        pg.click('#offline-dialog [data-offline=sync]'); wait_js(pg, "document.querySelector('#status').textContent.includes('Synced')", 15000)
        ok('Synced 4 changes' in pg.locator('#status').inner_text(), f"sync notice: {pg.locator('#status').inner_text()}")
        doc = srv.api('data')[1]['doc']
        e = next(x for x in doc['entries'] if x['id'] == target['id'])
        ok(e['title'] == 'Wound check (edited offline)' and e['values'].get('location') == 'Changed on the server meanwhile', 'the offline edit is saved and the server edit kept (three-way merge) (G48)')
        new = next((x for x in doc['entries'] if x['title'] == 'Clinic letter (photo offline)'), None)
        ok(new and len(new['notes']['imageIds']) == 1 and srv.raw(f"api.php?action=image&id={new['notes']['imageIds'][0]}")[0] == 200, 'the new entry and its pasted image reached the server (G48)')
        ok(next(t for t in doc['types'] if t['id'] == 'supply')['name'] == 'Supplies (renamed offline)', 'the type edit reached the server (G48)')
        ok([f['include'] for f in doc.get('filters', []) if f['id'] == 'disruptions'] == [['visit-biopsy']], 'the offline Disruptions edit reached the server (G53)')
        ok(pg.evaluate("(async () => { const o = await import('./js/outbox.js'); return (await o.listPending()).length + (await o.listFiles()).length; })()") == 0, 'nothing left in the queue after sync')
        pg.click('#offline-dialog [data-offline-close]')

        # ---- G49: a new version re-saves the shell, stays on, reloads
        pg.click('#offline-slot .offline-pill'); pg.wait_for_selector('#offline-dialog [data-offline=on]:not([disabled])')
        pg.click('#offline-dialog [data-offline=on]'); pg.wait_for_selector('#offline-dialog .offline-onoff.on', timeout=30000)
        v1 = pg.evaluate("JSON.parse(localStorage.getItem('appts-offline')).version")
        f = ROOT / 'js' / 'merge.js'; st = f.stat()
        try:
            os.utime(f, (st.st_atime, st.st_mtime + 7))
            v2 = Client(server).api('version')[1]['version']
            ok(v2 != v1, 'touching a shell file changes the app version')
            pg.goto(base); wait_js(pg, f"(JSON.parse(localStorage.getItem('appts-offline')) || {{}}).version === '{v2}' && document.querySelector('meta[name=appts-version]').content === '{v2}'", 20000)
            pg.wait_for_selector('.condition-card')
            ok(pg.evaluate("JSON.parse(localStorage.getItem('appts-offline')).on") and pg.evaluate("document.querySelector('meta[name=appts-version]').content") == v2, 'new version: the copy is re-saved, the mode stays on, and the page reloads into it (G49)')
            ok(wait_js(pg, f"navigator.serviceWorker.getRegistration().then(r => !!r.active && r.active.scriptURL.endsWith('sw.php?v={v2}'))"), 'the new worker (URL carries the new version) takes over (G49)')
            ok(pg.evaluate(FETCH_JS, 'api.php?action=session&probe=2')['marker'] == 'miss', 'the new worker still answers from the copy (mode stayed on) (G49)')
        finally:
            os.utime(f, (st.st_atime, st.st_mtime))

        # ---- quota: the estimate is compared with free space, and a full device leaves the mode off
        q = ctx.new_page(); q.on('pageerror', lambda e: errors.append(str(e))); q.on('dialog', lambda d: d.accept())
        q.add_init_script("navigator.storage.estimate = async () => ({ quota: 60000, usage: 50000 });")
        q.goto(base); q.wait_for_selector('.condition-card')
        q.evaluate("localStorage.setItem('appts-offline', JSON.stringify({ on: false }))")
        q.click('#offline-slot .offline-pill'); q.wait_for_selector('#offline-dialog [data-offline=on]:not([disabled])')
        q.click('#offline-dialog [data-offline=on]'); wait_js(q, "document.querySelector('.offline-error').textContent.length > 0")
        ok('free for Appts' in q.locator('.offline-error').inner_text() and not q.evaluate("JSON.parse(localStorage.getItem('appts-offline')).on"), 'not enough space: it stops cleanly and Offline mode stays off (G43)')
        q.close()

        # ---- G48: sign-out (nothing pending) clears this account's offline copy
        pg.click('#more-btn'); pg.click('#more-menu [data-action=logout]'); pg.wait_for_selector('#login-form')
        ok(not any(k.startswith('appts-offline-acct-') or k == 'appts-offline-shell' for k in pg.evaluate("caches.keys()")) and pg.evaluate("localStorage.getItem('appts-offline')") is None, 'sign-out removes the account copy and turns the mode off (G48)')
        # ---- G40: the toggle fits a 390px phone
        mob = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2).new_page()
        mob.on('pageerror', lambda e: errors.append(str(e)))
        mob.goto(base); mob.click('#fill-demo'); mob.click('#login-form [type=submit]'); mob.wait_for_selector('.condition-card')
        ok(mob.evaluate('document.documentElement.scrollWidth') <= 390 and mob.evaluate("document.querySelector('body > header').classList.contains('offline-collapsed')") and mob.locator('#offline-slot').is_hidden(), 'phone (390px): no room, so the inline Offline group collapses into "…"; no horizontal overflow (G40, G59)')
        if WANT_SCREENS: mob.screenshot(path=SCREENS / 'offline-mobile.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 260})
        mob.set_viewport_size({'width': 375, 'height': 812}); mob.wait_for_timeout(150)
        ok(mob.evaluate('document.documentElement.scrollWidth') <= 375, 'no horizontal overflow at 375px (G50)')
        if WANT_SCREENS: mob.locator('body > header').screenshot(path=SCREENS / 'header-narrow.png')
        mob.click('#more-btn')
        r = mob.evaluate("(() => { const m = document.querySelector('#more-menu').getBoundingClientRect(); return [m.left, m.right]; })()")
        ok(r[0] >= 0 and r[1] <= 375 and mob.evaluate('document.documentElement.scrollWidth') <= 375, f'375px: the open menu fits the screen ({r}) (G58)')
        mitems = mob.evaluate("[...document.querySelectorAll('#more-menu [role=menuitem]')].filter(b => b.getClientRects().length).map(b => b.dataset.offline || b.dataset.action)")
        mt = mob.locator('#more-menu .more-offline-toggle').inner_text()
        ok(mitems == ['panel', 'info', 'reset-demo', 'logout'] and 'Offline mode' in mt and 'Off' in mt, f'375px: the menu lists Offline mode (Off) and its (i) first, then the demo and account items ({mitems}) (G59)')
        if WANT_SCREENS: mob.screenshot(path=SCREENS / 'header-narrow-menu.png', clip={'x': 0, 'y': 0, 'width': 375, 'height': 560})
        mfoc = lambda: mob.evaluate("document.activeElement.dataset.offline || document.activeElement.dataset.action || document.activeElement.id")
        a = mfoc(); mob.keyboard.press('ArrowDown'); b = mfoc(); mob.keyboard.press('End'); c = mfoc(); mob.keyboard.press('ArrowDown'); d = mfoc()
        ok([a, b, c, d] == ['panel', 'info', 'logout', 'panel'], f'keyboard reaches the Offline items: ↓, End, wrap ({[a, b, c, d]}) (G59)')
        mob.keyboard.press('ArrowDown'); mob.keyboard.press('Enter'); mob.wait_for_selector('#offline-dialog[open] .offline-art')
        ok(mob.locator('#more-menu').is_hidden() and mob.locator('#offline-dialog .offline-lead').is_visible(), 'Enter on "What is Offline mode?" closes the menu and opens the (i) explainer (G59)')
        mob.keyboard.press('Escape'); mob.wait_for_timeout(100)
        ok(mfoc() == 'more-btn', 'closing the explainer returns focus to "…" (G59)')
        mob.click('#more-btn'); mob.click('#more-menu .more-offline-toggle'); mob.wait_for_selector('#offline-dialog [data-offline=on]:not([disabled])')
        ok(True, 'the menu Offline mode item opens the same Offline panel (G59)')
        ok(mob.evaluate("document.querySelector('#offline-dialog').scrollWidth <= document.querySelector('#offline-dialog').clientWidth"), 'the Offline panel fits at 390px')
        if WANT_SCREENS: mob.screenshot(path=SCREENS / 'offline-mobile-panel.png')
        mob.close()
        ok(not errors, f'no page errors ({errors[:2]})')
        browser.close()
    ok(len(json.loads(php('require "includes/domain.php"; echo json_encode(read_doc("otheracct"));', {'APPTS_STORAGE_DIR': str(tmp)}))['conditions']) == 1, 'the other temp account is untouched')
    after_real = sorted(p.name for p in real_storage.glob('**/*')) if real_storage.exists() else []
    ok(before_real == after_real, 'real storage/ untouched (no wf writes)')
finally:
    server.stop(); shutil.rmtree(tmp, ignore_errors=True)
print(f'offline.test.py: {checks} checks passed')
