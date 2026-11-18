"""Live check against an already-running Apache/MAMP install (not started by this script).
Run: python3 tests/live.check.py [base-url]   default http://localhost:8888/weng/app/healthcare/appts/
Writes only to the demo account (uploads, removed again where possible); signs in to wf read-only.
Screenshot: docs/screenshots/mamp-overview.png. Never prints the password."""
import base64, json, pathlib, subprocess, sys, urllib.parse
from serve import ROOT, Client, PNG, PHP, demo_password
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8888/weng/app/healthcare/appts/').rstrip('/') + '/'
PATH = urllib.parse.urlparse(BASE).path
checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)
    print('  ok -', what)

class Remote:
    def url(self, path): return BASE + path
pw = demo_password()
php = lambda code: subprocess.run([PHP, '-r', f'require "includes/demo-seed.php"; {code}'], cwd=ROOT, capture_output=True, check=True).stdout

doc_version = int(subprocess.run([PHP, '-r', 'require "includes/domain.php"; echo DOC_VERSION;'], cwd=ROOT, capture_output=True, check=True).stdout)
anon = Client(Remote())
st, body, h = anon.raw('')
ok(st == 200 and b'Appts' in body, f'index.php renders at {BASE}')
st, body, h = anon.raw('api.php?action=session')
ok(st == 200 and 'json' in h.get('Content-Type', '') and json.loads(body) == {'account': None}, 'api.php answers JSON (no PHP parse error)')
print('  server:', h.get('X-Powered-By', 'PHP version hidden'))

demo = Client(Remote())
st, body, h = demo.raw('api.php?action=login', 'POST', json.dumps({'username': 'demo', 'password': pw}).encode(), {'Content-Type': 'application/json', 'X-Appts': '1'})
cookie = h.get('Set-Cookie', '')
ok(st == 200, 'demo signs in')
ok(f'path={PATH}' in cookie and 'HttpOnly' in cookie and 'SameSite=Strict' in cookie, f'session cookie scoped to {PATH}, HttpOnly, SameSite=Strict')
# Reset the demo (synthetic data only) so it carries the current sample story, home health included.
st, data = demo.api('reset-demo', {})
ok(st == 200 and data['doc']['version'] == doc_version and any(e['typeId'] == 'hh_auth' for e in data['doc']['entries']), 'demo reset to the current sample data (home health story included)')
st, data = demo.api('data')
ok(st == 200 and len(data['doc']['entries']) > 0 and len(data['doc']['conditions']) > 0, f"demo records load ({len(data['doc']['conditions'])} conditions, {len(data['doc']['entries'])} entries)")

st, png = demo.upload(PNG, 'pasted.png', 'image/png', field='image')
ok(st in (200, 201) and png['file']['kind'] == 'image', 'pasted-image upload accepted')
pdf = php('echo synthetic_pdf("Live check lab", ["value 1"]);')
st, small = demo.upload(pdf, 'lab.pdf', 'application/pdf')
ok(st in (200, 201) and small['file']['kind'] == 'pdf', 'PDF upload accepted')
st, got, gh = demo.raw('api.php?action=file&id=' + small['file']['id'])
ok(st == 200 and got == pdf and gh.get('Content-Type', '').startswith('application/pdf'), 'PDF reads back byte-for-byte')
# 17 MB PDF: above MAMP's default post_max_size (16M); proves the .htaccess limits apply.
big = pdf[:9] + b'%' + b'p' * (17 * 1024 * 1024) + b'\n' + pdf[9:]
st, bigr = demo.upload(big, 'big-scan.pdf', 'application/pdf')
ok(st in (200, 201) and bigr['file']['kind'] == 'pdf', '17 MB PDF accepted (Apache .htaccess upload limits in effect)')
big_path = ROOT / 'storage' / 'uploads' / 'demo' / (bigr['file']['id'] + '.php')
if big_path.exists(): big_path.unlink()

for p in ['storage/', 'storage/data/demo.json.php', 'storage/uploads/demo/' + png['file']['id'] + '.php', 'storage/uploads/demo/' + small['file']['id'] + '.php', 'storage/locks/demo.lock.php', 'storage/backups/demo/', 'storage/.htaccess', 'includes/accounts.php', 'includes/seed-types.json', 'tools/set-password.php', 'tools/intake.php', '.agents/skills/log-health-update/SKILL.md', 'tests/serve.py']:
    st, body, _ = anon.raw(p)
    leaked = b'"entries"' in body or PNG in body or b'%PDF' in body or b'$2y$' in body or b'"visit_kind"' in body or b'DEMO_PASSWORD' in body
    ok(st in (403, 404) and not leaked, f'{p} blocked ({st}, no data bytes)')

# wf is Weng's real account: never write to it. Loading its records would apply a pending
# document migration (a write), so the records are only loaded when the stored file is current.
import hashlib, re as _re
wf_file = ROOT / 'storage' / 'data' / 'wf.json.php'
wf_hash = hashlib.sha256(wf_file.read_bytes()).hexdigest() if wf_file.exists() else None
wf_version = int(_re.search(rb'"version":\s*(\d+)', wf_file.read_bytes()).group(1)) if wf_file.exists() else None
wf = Client(Remote())
st, _ = wf.login('wf', pw)
ok(st == 200, 'wf signs in (same password as demo)')
st, sess = wf.api('session')
ok(st == 200 and sess['account']['username'] == 'wf', 'wf session works under the subpath')
if wf_version is not None and wf_version < doc_version:
    print(f'  skip - wf records not loaded: stored document is v{wf_version}, loading would migrate it to v{doc_version} (that happens on Weng\'s next visit)')
else:
    st, wdata = wf.api('data')
    ok(st == 200 and 'entries' in wdata['doc'], f"wf records load ({len(wdata['doc']['conditions'])} conditions, {len(wdata['doc']['entries'])} entries) - read only")
st, _, _ = wf.raw('api.php?action=file&id=' + small['file']['id'])
ok(st in (403, 404), "wf cannot read demo's upload")

# ---- Offline mode under MAMP (G40, G41, G45)
st, plan = demo.api('offline-plan')
ok(st == 200 and plan['account'] == 'demo' and plan['estimate']['totalBytes'] > 0 and 'wf' not in json.dumps([c['name'] for c in plan['conditions']]), 'offline-plan answers for demo through Apache (own account only)')
st, body, headers = Client(Remote()).raw('sw.php')
ok(st == 200 and 'javascript' in headers.get('Content-Type', '') and plan['version'].encode() in body, 'sw.php serves the service worker through Apache')
ok(Client(Remote()).raw('includes/sw.js')[0] in (403, 404) and Client(Remote()).raw('includes/offline.php')[0] in (403, 404), 'includes/sw.js and includes/offline.php are not web-readable')
ok(Client(Remote()).api('offline-plan')[0] == 401, 'offline-plan needs sign-in through Apache')
with sync_playwright() as p:
    import os
    channel = os.environ.get('APPTS_BROWSER_CHANNEL')
    browser = p.chromium.launch(**({'channel': channel} if channel else {}))
    page = browser.new_context(viewport={'width': 1440, 'height': 1000}).new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE); page.click('#fill-demo'); page.click('#login-form [type=submit]'); page.wait_for_selector('.condition-card')
    ok(page.locator('.condition-card').count() > 0, 'browser signs in to demo through Apache')
    ok('2 of 5 authorized visits left' in page.locator('.hh-overview').inner_text(), 'home health countdown renders through Apache')
    for _ in range(60):  # (string wait_for_function is blocked by the app's CSP once pages come from the copy)
        if page.evaluate("navigator.serviceWorker.controller !== null"): break
        page.wait_for_timeout(150)
    scope = page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.scope)")
    ok(scope == BASE, f'service worker registers under the MAMP subpath with scope {scope}')
    page.click('#account-actions .offline-pill'); page.wait_for_selector('#offline-dialog [data-offline=on]:not([disabled])')
    page.click('#offline-dialog [data-offline=on]'); page.wait_for_selector('#offline-dialog .offline-onoff.on', timeout=30000)
    probe = page.evaluate("fetch('api.php?action=session&probe=live').then(r => r.headers.get('X-Appts-Offline'))")
    ok(probe == 'miss', 'Offline mode turns on under MAMP and answers from the copy, not Apache')
    page.click('#offline-dialog [data-offline=off]'); page.wait_for_selector('#offline-dialog .offline-onoff.off')
    page.click('#offline-dialog [data-offline-close]')
    page.click('[data-action=add-condition] >> nth=0'); page.wait_for_selector('#condition-notes')
    page.evaluate("""([b64]) => { const t = document.querySelector('#condition-notes'); const dt = new DataTransfer(); const bin = atob(b64);
      dt.items.add(new File([Uint8Array.from(bin, c => c.charCodeAt(0))], 'clip.png', { type: 'image/png' })); t.focus();
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", [base64.b64encode(PNG).decode()])
    page.wait_for_selector('dialog[open] #condition-notes img[data-image-id]', timeout=10000)
    ok(True, 'Ctrl/Cmd+V image paste uploads through Apache and shows in the note')
    # t18u through Apache: @ links in a note (G54), unsaved; then the Disruptions preset (G52).
    page.keyboard.type(' @'); page.wait_for_selector('.mention-pop:not([hidden]) .mention-lib')
    page.hover('.mention-lib:has(b:text-is("Documents"))'); page.wait_for_selector('.mention-items .mention-item')
    page.click('.mention-items .mention-item >> nth=0'); page.wait_for_selector('#condition-notes .mention[data-mention=file]')
    ok(True, '@ opens the libraries popover and links a document through Apache (G54)')
    page.click('dialog[open] [data-close] >> nth=0'); page.wait_for_timeout(300)
    page.evaluate("location.hash = '#/timeline'"); page.wait_for_selector('#tl-presets'); page.click('[data-action=tl-disruptions]')
    page.wait_for_selector('[data-action=tl-disruptions][aria-pressed=true]')
    shown = ' '.join(page.locator('main .event-list').all_inner_texts())
    ok('MRI prior authorization denied' in shown and 'Radiation authorization approved' not in shown and page.locator('[data-action=tl-dis-edit]').count() == 1, 'Disruptions preset shows insurance denials, not approvals, through Apache (G52)')
    page.click('[data-action=tl-disruptions]'); page.evaluate("location.hash = '#/'"); page.wait_for_selector('.condition-card')
    page.click('#more-btn'); page.wait_for_selector('#more-menu:not([hidden]) [data-action=logout]')
    ok(page.locator('#more-btn').get_attribute('aria-expanded') == 'true' and 'Reset demo data' in page.locator('#more-menu').inner_text(), 'the "…" menu opens with the account and demo options through Apache (G58)')
    page.keyboard.press('Escape'); page.wait_for_selector('#more-menu[hidden]', state='attached')
    shot = ROOT / 'docs' / 'screenshots' / 'mamp-overview.png'
    page.screenshot(path=str(shot), full_page=True)
    ok(errors == [], f'no page errors: {errors}')
    browser.close()
if wf_hash is not None and wf_version is not None and wf_version < doc_version:
    ok(hashlib.sha256(wf_file.read_bytes()).hexdigest() == wf_hash, "wf's stored file is byte-identical after the live check")
print(f'PASS: {checks} live checks against {BASE}')
