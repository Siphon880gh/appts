"""t18u gates (G52-G57) in headless Chromium against php -S with temp storage (demo only, never wf):
the built-in Disruptions timeline filter and Edit Disruption mode, and @mentions in rich notes.
Run: python3 tests/disruptions-mentions.test.py [--no-screens]"""
import json, os, pathlib, shutil, sys, tempfile, time
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, Client, demo_password
from playwright.sync_api import sync_playwright

SCREENS = ROOT / 'docs' / 'screenshots'
WANT_SCREENS = '--no-screens' not in sys.argv
checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)
    print('  ok -', what)
def wait_js(page, expr, timeout=10000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception: pass
        page.wait_for_timeout(100)
    raise SystemExit(f'FAIL: timed out waiting for {expr}')

tmp = pathlib.Path(tempfile.mkdtemp(prefix='appts-t18-'))
real = ROOT / 'storage'
before_real = sorted(p.name for p in real.glob('**/*')) if real.exists() else []
server = Server(tmp).start()
base = server.url('')
try:
    with sync_playwright() as p:
        channel = os.environ.get('APPTS_BROWSER_CHANNEL')
        browser = p.chromium.launch(**({'channel': channel} if channel else {}))
        pg = browser.new_context(viewport={'width': 1280, 'height': 900}).new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(base); pg.click('#fill-demo'); pg.click('#login-form [type=submit]'); pg.wait_for_selector('.condition-card')
        api = Client(server); api.login('demo', demo_password())
        titles = lambda: pg.locator('.event-list .event strong').all_inner_texts()

        # ---- G52: built-in Disruptions filter
        pg.evaluate("location.hash = '#/timeline'"); pg.wait_for_selector('#tl-presets')
        chip = pg.locator('#tl-presets [data-action=tl-disruptions]')
        ok(chip.count() == 1 and chip.get_attribute('aria-pressed') == 'false', 'Timeline has a built-in Disruptions filter (G52)')
        ok(pg.locator('[data-action=tl-dis-edit]').count() == 0, 'Edit Disruption mode is not offered until the Disruptions filter is on (G53)')
        everything = titles()
        chip.click(); pg.wait_for_selector('[data-action=tl-disruptions][aria-pressed=true]')
        shown = titles()
        ok('MRI prior authorization denied' in shown and 'Radiation authorization approved' not in shown and 'Home health nursing approved (6 visits)' not in shown, 'it shows insurance denials and leaves approvals out (G52)')
        need = ['MRI denial — first-level appeal', 'Radiation machine down for repair', 'Telehealth visit cancelled by clinic', 'Visits paused until insurance approves more', 'Wound edge redder and weeping']
        ok(all(t in shown for t in need) and 'Dressing change' in shown, 'it shows appeals, other care disruptions, missed home health visits, waiting-for-approval events, and clinical events (G52)')
        ok(len(shown) < len(everything) and 'disruption' in pg.locator('#tl-count').inner_text(), f'{len(shown)} of {len(everything)} timeline items are disruptions')
        if WANT_SCREENS: SCREENS.mkdir(exist_ok=True); pg.screenshot(path=SCREENS / 'timeline-disruptions.png', full_page=False)
        pg.click('.event-list .event >> nth=0'); pg.wait_for_selector('dialog[open] [data-action=edit-entry]')
        ok(True, 'outside Edit Disruption mode, a row still opens its entry'); pg.click('dialog[open] [data-close] >> nth=0')

        # ---- G53: Edit Disruption mode (gray until un-grayed, persisted, sync-safe)
        pg.click('[data-action=tl-dis-edit]'); pg.wait_for_selector('.dis-banner')
        ok(pg.locator('.dis-row.dis-out').count() > 0 and pg.locator('.dis-row.dis-in').count() > 0 and len(titles()) == len(everything), 'Edit Disruption mode shows every item, the ones not in the filter grayed out (G53)')
        out_row = pg.locator('.dis-row.dis-out:has(strong:text-is("Called the home health case manager"))')
        ok(out_row.count() == 1 and float(pg.evaluate("getComputedStyle(document.querySelector('.dis-row.dis-out .event')).opacity")) < 0.6, 'an event outside the filter is grayed (G53)')
        if WANT_SCREENS: pg.screenshot(path=SCREENS / 'disruption-edit.png', full_page=False)
        out_row.locator('.event').click()
        pg.wait_for_selector('.dis-row.dis-in:has(strong:text-is("Called the home health case manager"))')
        ok('Added to Disruptions' in pg.locator('#status').inner_text(), 'clicking a grayed event un-grays it and adds it (G53)')
        pg.locator('.dis-row.dis-in:has(strong:text-is("Knee swelling after stairs")) .event').click()
        pg.wait_for_selector('.dis-row.dis-out:has(strong:text-is("Knee swelling after stairs"))')
        ok(True, 'clicking an event that is in grays it out again (G53)')
        f = next(x for x in api.api('data')[1]['doc']['filters'] if x['id'] == 'disruptions')
        ok(f['include'] == ['hh-ev-case-mgr'] and len(f['exclude']) == 1, f'the edits are saved on the server per account: {f["include"]} / {len(f["exclude"])} removed (G53)')
        pg.click('[data-action=tl-dis-edit]'); pg.wait_for_selector('.dis-banner', state='detached')
        shown = titles()
        ok('Called the home health case manager' in shown and 'Knee swelling after stairs' not in shown, 'after Done editing, the filter uses the edits (G53)')
        pg.reload(); pg.wait_for_selector('#tl-presets'); pg.click('[data-action=tl-disruptions]')
        ok('Called the home health case manager' in titles(), 'the edited filter survives a reload')
        pg.click('[data-action=tl-disruptions]')
        ok(pg.locator('[data-action=tl-dis-edit]').count() == 0 and pg.locator('.dis-row').count() == 0, 'turning the filter off hides Edit Disruption mode (only for this filter) (G53)')
        st, body = api.api('ops', {'ops': [{'op': 'put', 'kind': 'filter', 'value': {'id': 'favorites', 'include': []}}]})
        ok(st == 400, 'the server accepts only the built-in filter')

        # ---- G54-G56: @mentions in notes
        pg.evaluate("location.hash = '#/c/cond-knee'"); pg.wait_for_selector('#add-type')
        pg.select_option('#add-type', 'visit'); pg.wait_for_selector('#entry-notes')
        pg.fill('#entry-title', 'Follow-up with linked records'); pg.fill('#fld-date', '2026-12-01')
        pg.click('#entry-notes'); pg.keyboard.type('Bring @')
        pg.wait_for_selector('.mention-pop:not([hidden]) .mention-lib')
        libs = pg.locator('.mention-lib b').all_inner_texts()
        ok(libs == ['Documents', 'Events', 'Notes'], f'typing @ opens a popover of libraries: {libs} (G54)')
        pg.hover('.mention-lib:has(b:text-is("Documents"))'); pg.wait_for_selector('.mention-items .mention-item')
        docs = pg.locator('.mention-items .mention-item b').all_inner_texts()
        api_docs = {a['name'] for e in api.api('data')[1]['doc']['entries'] for a in e.get('attachments', [])} | {a['name'] for c in api.api('data')[1]['doc']['conditions'] for a in c.get('attachments', [])}
        ok(docs and set(docs) <= api_docs and len(docs) == len(set(docs)), f'hovering Documents lists the documents you can link ({len(docs)}) (G54)')
        ok(pg.locator('.mention-items .mention-kind.pdf').count() > 0, 'documents show their file type')
        if WANT_SCREENS: pg.screenshot(path=SCREENS / 'mention-popover.png')
        first_doc = docs[0]
        pg.click(f'.mention-items .mention-item:has(b:text-is("{first_doc}"))')
        ok(pg.locator('#entry-notes .mention[data-mention=file]').count() == 1 and pg.locator('.mention-pop').is_hidden(), 'clicking a document inserts a link chip and closes the popover (G54)')
        pg.keyboard.type('and @mri')
        pg.wait_for_selector('.mention-pop:not([hidden]) .mention-flat')
        flat = pg.locator('.mention-flat .mention-item').all_inner_texts()
        ok(flat and all('mri' in x.lower() for x in flat) and pg.locator('.mention-libs').count() == 0, f'typing after @ filters across every library ({len(flat)} matches) (G55)')
        pg.keyboard.type('zzqx'); pg.wait_for_selector('.mention-empty')
        ok('Nothing matches' in pg.locator('.mention-pop').inner_text(), 'no match says so')
        for _ in range(4): pg.keyboard.press('Backspace')
        pg.wait_for_selector('.mention-flat .mention-item'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter')
        ok(pg.locator('#entry-notes .mention').count() == 2, 'arrow keys and Enter pick a filtered item (G55)')
        pg.keyboard.type('then @'); pg.wait_for_selector('.mention-lib')
        pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowRight'); pg.wait_for_selector('.mention-items .mention-item.active')
        pg.keyboard.press('Enter')
        ok(pg.locator('#entry-notes .mention[data-mention=entry]').count() >= 1 and pg.locator('#entry-notes .mention').count() == 3, 'keyboard: ↓ to Events, → into it, Enter links an event (G55)')
        pg.keyboard.type('x @'); pg.wait_for_selector('.mention-lib'); pg.keyboard.press('Escape')
        ok(pg.locator('.mention-pop').is_hidden() and pg.locator('#editor[open]').count() == 1, 'Escape closes the popover and keeps the form open')
        pg.keyboard.type(' see @Notes'); pg.wait_for_selector('.mention-flat .mention-item')
        ok(all(x.split('\n')[-1].startswith('Notes') for x in pg.locator('.mention-flat .mention-item').all_inner_texts()), 'typing a library name narrows to it: notes already written are linkable (G55)')
        pg.keyboard.press('Enter')
        pg.click('#entry-form [type=submit]'); pg.wait_for_selector('.dialog-head h2:has-text("Follow-up with linked records")')
        chips = pg.locator('dialog[open] .note-content .mention[data-action=open-mention]')
        ok(chips.count() == 4, 'saved: the note shows 4 clickable link chips (G56)')
        if WANT_SCREENS: pg.locator('dialog[open]').screenshot(path=SCREENS / 'mention-chips.png')
        saved = next(e for e in api.api('data')[1]['doc']['entries'] if e['title'] == 'Follow-up with linked records')
        html = saved['notes']['html']
        ok(html.count('class="mention"') == 4 and 'data-action' not in html and 'contenteditable="false"' in html, 'the server keeps chips as id references only (no handlers stored) (G56)')
        chips.first.click(); pg.wait_for_selector('#viewer[open] iframe, #viewer[open] img')
        ok(first_doc in pg.locator('#viewer .dialog-head').inner_text(), 'clicking a document chip opens the document (G56)')
        pg.click('#viewer [data-close] >> nth=0')
        ev_chip = pg.locator('dialog[open] .note-content .mention[data-mention=entry] >> nth=0')
        target = ev_chip.get_attribute('data-ref'); ev_chip.focus(); pg.keyboard.press('Enter')
        want = next(e['title'] for e in api.api('data')[1]['doc']['entries'] if e['id'] == target)
        pg.wait_for_selector(f'.dialog-head h2:has-text("{want[:30]}")')
        ok(True, 'a chip is reachable by keyboard and Enter opens the linked event (G56)')
        pg.click('dialog[open] [data-close] >> nth=0')
        pg.reload(); pg.wait_for_selector('#add-type')
        pg.click('.entry-row:has-text("Follow-up with linked records")'); pg.click('dialog[open] [data-action=edit-entry]'); pg.wait_for_selector('#entry-notes')
        ok(pg.locator('#entry-notes .mention').count() == 4 and pg.locator('#entry-notes .mention[data-action]').count() == 0, 'chips survive reload and are inert while editing (G56)')
        pg.click('dialog[open] [data-close] >> nth=0')

        # ---- G57: narrow screen
        mob = browser.new_context(viewport={'width': 375, 'height': 812}).new_page(); mob.on('pageerror', lambda e: errors.append(str(e)))
        mob.goto(base); mob.click('#fill-demo'); mob.click('#login-form [type=submit]'); mob.wait_for_selector('.condition-card')
        mob.evaluate("location.hash = '#/timeline'"); mob.wait_for_selector('#tl-presets'); mob.click('[data-action=tl-disruptions]'); mob.click('[data-action=tl-dis-edit]'); mob.wait_for_selector('.dis-banner')
        ok(mob.evaluate('document.documentElement.scrollWidth') <= 375, 'Edit Disruption mode fits at 375px (G57)')
        mob.evaluate("location.hash = '#/c/cond-knee'"); mob.wait_for_selector('#add-type'); mob.select_option('#add-type', 'visit'); mob.wait_for_selector('#entry-notes')
        mob.click('#entry-notes'); mob.keyboard.type('@'); mob.wait_for_selector('.mention-lib'); mob.hover('.mention-lib >> nth=0')
        box = mob.evaluate("(() => { const r = document.querySelector('.mention-pop').getBoundingClientRect(); return [r.left, r.right]; })()")
        ok(box[0] >= 0 and box[1] <= 375 and mob.evaluate('document.documentElement.scrollWidth') <= 375, 'the @ popover stays on screen at 375px (G57)')
        mob.close()
        ok(not errors, f'no page errors ({errors[:2]})')
        browser.close()
    after_real = sorted(p.name for p in real.glob('**/*')) if real.exists() else []
    ok(before_real == after_real, 'real storage/ untouched (no wf writes)')
finally:
    server.stop(); shutil.rmtree(tmp, ignore_errors=True)
print(f'disruptions-mentions.test.py: {checks} checks passed')
