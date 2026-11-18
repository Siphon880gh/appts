"""Browser gates with headless Chromium (Playwright, already on this Mac): demo click-fill, both
logins, custom types (create/use/reload/remove field/archive), icons + colors, tags on the fly,
timeline type/tag filters, paste + drop images/PDFs, rich-text persistence, injection, Documents
filters, 390px overflow, and README screenshots. Run: python3 tests/browser.test.py [--no-screens]"""
import base64, json, os, pathlib, shutil, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, demo_password, PHP
from playwright.sync_api import sync_playwright

SCREENS = ROOT / 'docs' / 'screenshots'
WANT_SCREENS = '--no-screens' not in sys.argv
php = lambda code: subprocess.run([PHP, '-r', f'require "includes/demo-seed.php"; {code}'], cwd=ROOT, capture_output=True, check=True).stdout
PNG_B64 = base64.b64encode(php('echo synthetic_png("Pasted screenshot", [40, 90, 140]);')).decode()
PDF_B64 = base64.b64encode(php('echo synthetic_pdf("Pasted lab PDF", ["CBC (test)"]);')).decode()
checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)
    print('  ok -', what)

PASTE_JS = """([selector, b64, name, mime, html]) => {
  const target = document.querySelector(selector); const dt = new DataTransfer();
  if (b64) { const bin = atob(b64); dt.items.add(new File([Uint8Array.from(bin, c => c.charCodeAt(0))], name, { type: mime })); }
  if (html) { dt.setData('text/html', html); dt.setData('text/plain', 'x'); }
  target.focus(); target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}"""
DROP_JS = """([selector, b64, name, mime]) => {
  const target = document.querySelector(selector); const dt = new DataTransfer(); const bin = atob(b64);
  dt.items.add(new File([Uint8Array.from(bin, c => c.charCodeAt(0))], name, { type: mime }));
  for (const t of ['dragover', 'drop']) target.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
}"""

tmp = pathlib.Path(tempfile.mkdtemp(prefix='appts-browser-'))
server = Server(tmp).start()
pw = demo_password()
base = server.url('')
try:
    with sync_playwright() as p:
        # APPTS_BROWSER_CHANNEL=chrome uses installed Chrome (temporary profile) so the PDF viewer renders in screenshots.
        channel = os.environ.get('APPTS_BROWSER_CHANNEL')
        browser = p.chromium.launch(**({'channel': channel} if channel else {}))
        errors = []
        def page_for(width=1440, height=1000):
            pg = browser.new_context(viewport={'width': width, 'height': height}).new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.on('dialog', lambda d: d.accept('https://example.org/care-plan') if d.type == 'prompt' else d.accept())
            return pg
        go = lambda pg, h: (pg.evaluate(f"location.hash = '{h}'"), pg.wait_for_timeout(250))

        # ---- G9: demo row click-fills and signs in
        demo = page_for(); demo.goto(base)
        demo.click('#fill-demo')
        ok(demo.input_value('[name=username]') == 'demo' and len(demo.input_value('[name=password]')) > 0, 'demo row click fills the form (G9)')
        if WANT_SCREENS: SCREENS.mkdir(exist_ok=True); demo.screenshot(path=SCREENS / 'sign-in.png')
        demo.click('#login-form [type=submit]'); demo.wait_for_selector('.condition-card')
        ok(demo.locator('.condition-card').count() == 3, 'demo overview shows 3 synthetic conditions (G9, G12)')
        ok(demo.locator('.next-up .event').count() > 0, 'overview answers "what is next" (G9)')

        # ---- wf: real account starts empty (G5, G12)
        wf = page_for(); wf.goto(base)
        wf.fill('[name=username]', 'wf'); wf.fill('[name=password]', pw); wf.click('#login-form [type=submit]')
        wf.wait_for_selector('text=Start with a condition')
        ok(True, 'wf signs in with the same password and starts empty (G5, G12)')
        bad = page_for(); bad.goto(base); bad.fill('[name=username]', 'wf'); bad.fill('[name=password]', pw + '!'); bad.click('#login-form [type=submit]')
        bad.wait_for_selector('.form-error:has-text("incorrect")'); ok(True, 'wrong password rejected in UI')

        # ---- wf: condition with rich notes (bold, list, link) (G20)
        wf.click('[data-action=add-condition] >> nth=0'); wf.fill('#c-name', 'Chronic wound, left shin')
        wf.click('#condition-notes'); wf.keyboard.type('Plan summary')
        wf.keyboard.press('Meta+A' if sys.platform == 'darwin' else 'Control+A')
        wf.click('.rich-toolbar [data-command=bold]')
        wf.click('#condition-notes'); wf.keyboard.press('End'); wf.keyboard.press('Enter')
        wf.click('.rich-toolbar [data-command=insertUnorderedList]'); wf.keyboard.type('Change dressing daily')
        wf.keyboard.press('Shift+Home'); wf.click('.rich-toolbar [data-link]')
        wf.click('dialog [type=submit]'); wf.wait_for_selector('.condition-head h1:has-text("Chronic wound")')
        cond_url = wf.url

        # ---- Entry types: custom type with every kind, icon + color (G4, G17, G18)
        go(wf, '#/types'); wf.click('[data-action=new-type]')
        wf.fill('#t-name', 'Lab results'); wf.fill('#t-singular', 'Lab result'); wf.fill('#t-title', 'Test')
        wf.click('.icon-grid [data-icon=flask]'); wf.click('[data-swatch="#0f766e"]')
        for label, kind, extra in [('Drawn', 'date', None), ('Value', 'number', None), ('Flag', 'select', 'Low\nNormal\nHigh'), ('Fasting', 'checkbox', None), ('Interpretation', 'longtext', None), ('Ordering doctor', 'link', 'doctor'), ('Lab code', 'text', None)]:
            wf.fill('#nf-label', label); wf.select_option('#nf-kind', kind)
            if kind == 'select': wf.fill('#nf-options', extra)
            if kind == 'link': wf.select_option('#nf-target', extra)
            wf.click('#nf-add')
        ok(wf.locator('.field-rows li').count() == 7, 'seven fields of every kind added in the editor')
        wf.click('.field-rows [data-move][data-delta="-1"] >> nth=-1')  # reorder: move Lab code up
        wf.click('dialog [type=submit]'); wf.wait_for_selector('.type-table h3:has-text("Lab results")')
        wf.click('[data-action=new-type]'); wf.fill('#t-name', 'Second opinions'); wf.click('dialog [type=submit]')
        wf.wait_for_selector('.type-table h3:has-text("Second opinions")')
        row = wf.locator('.type-table li', has_text='Second opinions')
        ok(row.locator('[data-icon=placeholder]').count() == 1, 'custom type without an icon shows the placeholder (G18)')
        # change a built-in's icon + color
        wf.click('.type-table li:has-text("Visits") [data-action=edit-type]'); wf.click('.icon-grid [data-icon=heart]'); wf.click('[data-swatch="#be185d"]'); wf.click('dialog [type=submit]')
        wf.wait_for_timeout(300); wf.reload(); wf.wait_for_selector('.type-table')
        visit_badge = wf.locator('.type-table li:has-text("Visits") .type-icon')
        ok(visit_badge.locator('[data-icon=heart]').count() == 1 and '#be185d' in visit_badge.get_attribute('style'), 'built-in icon + color change survives reload (G17)')
        lab_badge = wf.locator('.type-table li:has-text("Lab results") .type-icon')
        ok(lab_badge.locator('[data-icon=flask]').count() == 1 and '#0f766e' in lab_badge.get_attribute('style'), 'custom icon + color survive reload (G17)')

        # ---- Use the types: doctor, then a lab result linked to it, tags on the fly, paste image + PDF
        wf.goto(cond_url); wf.wait_for_selector('#add-type')
        wf.select_option('#add-type', 'doctor'); wf.fill('#entry-title', 'Dr. Real Wound Specialist'); wf.click('#entry-form [type=submit]')
        wf.wait_for_selector('.dialog-head h2:has-text("Dr. Real")'); wf.click('dialog[open] [data-close] >> nth=0')
        lab_type = wf.evaluate("fetch('api.php?action=data').then(r => r.json()).then(r => r.doc.types.find(t => t.name === 'Lab results').id)")
        wf.select_option('#add-type', lab_type)
        wf.fill('#entry-title', 'CBC with differential'); wf.get_by_label('Drawn').fill('2026-12-02'); wf.get_by_label('Value', exact=True).fill('7.2')
        wf.get_by_label('Flag', exact=True).select_option('High'); wf.get_by_label('Fasting').check(); wf.get_by_label('Interpretation').fill('Mild elevation')
        wf.get_by_label('Ordering doctor').select_option(label='Dr. Real Wound Specialist'); wf.get_by_label('Lab code').fill('CBC-77')
        tag_input = wf.locator('#entry-tags input')
        for t in ['Fasting labs', 'Billing']: tag_input.fill(t); tag_input.press('Enter')
        ok(wf.locator('#entry-tags .picked button').count() == 2, 'two tags created on the fly in the form (G15)')
        wf.click('#entry-notes'); wf.keyboard.type('Results reviewed by phone. ')
        wf.evaluate(PASTE_JS, ['#entry-notes', PNG_B64, 'shot.png', 'image/png', None])
        wf.wait_for_selector('#entry-notes img[data-image-id]')
        ok(True, 'Ctrl/Cmd+V image into rich notes uploads and inserts inline (G11)')
        wf.evaluate(PASTE_JS, ['#entry-title', PDF_B64, 'cbc.pdf', 'application/pdf', None])
        wf.wait_for_selector('#entry-docs .doc-item:has-text("cbc.pdf")')
        ok(True, 'paste of a PDF anywhere in the form adds it to Documents (G11)')
        wf.evaluate(DROP_JS, ['#entry-docs', PNG_B64, 'dropped.png', 'image/png'])
        wf.wait_for_selector('#entry-docs .doc-item:has-text("dropped.png")')
        ok(wf.locator('#entry-docs input[type=file]').get_attribute('accept').count('application/pdf') == 1, 'drag-drop works and the file picker accepts PDFs and images (G11)')
        wf.fill('#entry-docs [data-label="0"]', 'Blood panel')
        wf.click('#entry-form [type=submit]'); wf.wait_for_selector('.dialog-head h2:has-text("CBC with differential")')

        # ---- reload: everything persisted (G4, G15, G20, G21, G24)
        wf.reload(); wf.wait_for_selector('.entry-row:has-text("CBC with differential")'); wf.click('.entry-row:has-text("CBC with differential")')
        det = wf.locator('dialog[open]')
        text = det.inner_text()
        ok(all(s in text for s in ['7.2', 'High', 'Yes', 'Mild elevation', 'CBC-77', 'Dr. Real Wound Specialist', 'Fasting labs', 'Billing']), 'custom-type entry with every field kind survives reload (G4)')
        det.locator('.note-content img[data-image-id]').first.scroll_into_view_if_needed()  # images are loading=lazy
        try: wf.wait_for_function("(() => { const i = document.querySelector('dialog[open] .note-content img[data-image-id]'); return i && i.complete && i.naturalWidth > 1; })()", timeout=5000); img_ok = True
        except Exception: img_ok = False
        ok(img_ok and det.locator('.note-content img[data-image-id]').count() == 1, 'pasted notes image persists and loads after reload (G21)' + ('' if img_ok else ': ' + det.locator('.note-content').first.inner_html()[:600]))
        ok(det.locator('.attachments small:has-text("Blood panel")').count() == 1 and det.locator('.attachments .pdf-tile').count() == 1, 'PDF saved with the custom label (G24)')
        det.locator('button.link:has-text("Dr. Real")').click(); wf.wait_for_selector('dialog[open] h3:has-text("Linked from")')
        ok(True, 'link opens the doctor; backlink shows the lab result')
        wf.click('dialog[open] [data-close] >> nth=0')
        go(wf, '#/'); wf.click('.condition-card a')
        notes = wf.locator('.note-content').first
        ok(notes.locator('strong, b').count() >= 1 and notes.locator('ul li').count() >= 1 and notes.locator('a[href="https://example.org/care-plan"]').count() >= 1, 'condition notes keep bold, bullet list, and link after reload (G20): ' + notes.inner_html())

        # ---- a visit tagged with one of the tags, then timeline filters (G14, G16)
        wf.select_option('#add-type', 'visit'); wf.fill('#entry-title', 'Wound clinic'); wf.fill('#fld-date', '2026-12-05')
        tag_input = wf.locator('#entry-tags input'); tag_input.fill('fasting'); wf.wait_for_selector('.tag-options [data-tag]')
        wf.click('.tag-options [data-tag]'); wf.click('#entry-form [type=submit]'); wf.wait_for_selector('.dialog-head h2:has-text("Wound clinic")'); wf.click('dialog[open] [data-close] >> nth=0')
        go(wf, '#/timeline'); wf.wait_for_selector('#tl-types')
        chip_ids = set(wf.locator('#tl-types [data-action=tl-type]').evaluate_all('bs => bs.map(b => b.dataset.id)'))
        ok(chip_ids == {lab_type, 'visit'}, f'timeline type chips = types present in the timeline only (G14): {chip_ids}')
        wf.click(f'#tl-types [data-id="{lab_type}"]')
        titles = wf.locator('.event-main strong').all_inner_texts()
        ok(titles and all('CBC' in t for t in titles), 'type filter shows only that type (G14)')
        wf.click(f'#tl-types [data-id="{lab_type}"]')
        tag_ids = wf.evaluate("fetch('api.php?action=data').then(r => r.json()).then(r => Object.fromEntries(r.doc.tags.map(t => [t.label, t.id])))")
        wf.click(f'#tl-tags [data-id="{tag_ids["Fasting labs"]}"]')
        one = set(wf.locator('.event-main strong').all_inner_texts())
        wf.click(f'#tl-tags [data-id="{tag_ids["Billing"]}"]')
        two = set(wf.locator('.event-main strong').all_inner_texts())
        ok(one == {'CBC with differential', 'Wound clinic'} and two == {'CBC with differential'}, f'tag filter works for one and for two tags (AND) (G16): {one} / {two}')
        wf.reload(); wf.wait_for_selector('#tl-tags')
        ok(set(wf.locator('#tl-tags [data-action=tl-tag]').all_inner_texts()) >= {'Fasting labs1', 'Billing1'} or wf.locator('#tl-tags [data-action=tl-tag]').count() == 2, 'tags created on the fly persist across reload (G15)')

        # ---- documents: quick upload reuses the custom label; filters (G24, G25)
        go(wf, '#/documents'); wf.click('[data-action=quick-upload]')
        ok('Blood panel' in wf.locator('#quick-docs datalist').inner_html(), 'custom label offered on the next upload (G24)')
        wf.locator('#quick-docs input[type=file]').set_input_files(files=[{'name': 'wound-photo.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(PNG_B64)}])
        wf.wait_for_selector('#quick-docs .doc-item'); wf.fill('#quick-docs [data-label="0"]', 'blood PANEL'); wf.click('dialog[open] [type=submit]')
        wf.wait_for_timeout(400)
        labels = wf.evaluate("fetch('api.php?action=data').then(r => r.json()).then(r => r.doc.docLabels.filter(l => l.label.toLowerCase() === 'blood panel').length)")
        ok(labels == 1, 'custom label reused (case-insensitive), not duplicated (G24)')
        kinds = wf.locator('#doc-kinds [data-action=doc-kind]').evaluate_all('bs => bs.map(b => b.dataset.id)')
        ok(sorted(kinds) == ['image', 'pdf'], 'file-type chips derived from uploads (G25)')
        total = wf.locator('.doc-card').count()
        wf.click('#doc-kinds [data-id=pdf]')
        ok(wf.locator('.doc-card').count() == wf.locator('.doc-card[data-doc-kind=pdf]').count() == 1, 'filter by file type: PDF (G25)')
        wf.click('#doc-kinds [data-id=pdf]'); wf.click('#doc-labels button:has-text("Blood panel")')
        ok(wf.locator('.doc-card').count() == 2 and total == 3, 'filter by label (G25)')
        wf.click('.doc-card [data-action=view-file][data-kind=pdf]'); wf.wait_for_selector('#viewer[open] iframe')
        ok(True, 'PDF opens in the inline viewer'); wf.click('#viewer [data-close] >> nth=0')

        # ---- injection never survives (G22)
        wf.goto(cond_url); wf.wait_for_selector('#add-type'); wf.click('.entry-row:has-text("Wound clinic")'); wf.click('dialog[open] [data-action=edit-entry]')
        wf.evaluate(PASTE_JS, ['#entry-notes', None, None, None, '<p>ok</p><img src=x onerror="window.__xss=1"><script>window.__xss=2</script><a href="javascript:window.__xss=3">j</a>'])
        wf.click('#entry-form [type=submit]'); wf.wait_for_selector('.dialog-head h2:has-text("Wound clinic")')
        wf.evaluate("""fetch('api.php?action=data').then(r => r.json()).then(r => { const e = r.doc.entries.find(x => x.title === 'Wound clinic');
          return fetch('api.php?action=ops', { method: 'POST', headers: { 'X-Appts': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: [{ op: 'put', kind: 'entry', value: { ...e, notes: { html: e.notes.html + '<iframe src=//evil></iframe><svg onload=window.__xss=4></svg><b onclick=x>bold</b>' } } }] }) }); })""")
        wf.reload(); wf.wait_for_selector('#add-type'); wf.click('.entry-row:has-text("Wound clinic")'); wf.wait_for_selector('dialog[open] .note-content')
        stored = wf.evaluate("fetch('api.php?action=data').then(r => r.json()).then(r => r.doc.entries.find(x => x.title === 'Wound clinic').notes.html)")
        ok(wf.evaluate('window.__xss') is None and not any(s in stored.lower() for s in ['onerror', '<script', 'javascript:', '<iframe', '<svg', 'onclick']) and '<b>bold</b>' in stored, 'script/handler injection stripped client- and server-side (G22)')

        # ---- free-text statuses (G28, G29)
        data = lambda pg, js: pg.evaluate(f"fetch('api.php?action=data').then(r => r.json()).then(r => {js})")
        go(wf, '#/types'); wf.click('.type-table li:has-text("Visits") [data-action=edit-type]')
        ok(wf.locator('dialog[open] .field-rows li:has(input[value="Status"]) [data-custom]').is_checked(), 'built-in Visits status shows "Allow free text" on (G29)')
        wf.click('dialog[open] [data-close] >> nth=0'); wf.click('.type-table li:has-text("Doctors") [data-action=edit-type]')
        ok(not wf.locator('dialog[open] .field-rows li:has(input[value="Role"]) [data-custom]').is_checked(), 'other built-in selects stay preset-only by default (G29)')
        wf.click('dialog[open] [data-close] >> nth=0')
        ok(data(wf, "r.doc.types.filter(t => t.builtin).flatMap(t => t.fields.filter(f => f.label === 'Status').map(f => f.allowCustom))") == [True] * 5, 'all 5 built-in Status fields allow free text (G29)')
        wf.click('.type-table li:has-text("Lab results") [data-action=edit-type]'); wf.check('dialog[open] .field-rows li:has(input[value="Flag"]) [data-custom]')
        wf.click('dialog [type=submit]'); wf.wait_for_timeout(300)
        ok(data(wf, "r.doc.types.find(t => t.name === 'Lab results').fields.find(f => f.label === 'Flag').allowCustom") is True, 'a custom select can switch on free text from Entry types (G29)')
        wf.goto(cond_url); wf.wait_for_selector('#add-type')
        wf.select_option('#add-type', 'visit'); wf.fill('#entry-title', 'Wound clinic recheck'); wf.fill('#fld-date', '2026-12-05')
        ok(wf.locator('#fld-status option:has-text("Free text…")').count() == 1 and wf.locator('[name="f:status:custom"]').is_hidden(), 'visit Status offers Free text… (G29)')
        wf.select_option('#fld-status', '__free_text__')
        ok(wf.locator('[name="f:status:custom"]').is_visible(), 'choosing Free text… reveals a text box')
        wf.fill('[name="f:status:custom"]', 'Waiting on fax from PCP'); wf.click('#entry-form [type=submit]')
        wf.wait_for_selector('.dialog-head h2:has-text("Wound clinic recheck")')
        wf.reload(); wf.wait_for_selector('.entry-row:has-text("Wound clinic recheck")')
        ok(wf.locator('.entry-row:has-text("Wound clinic recheck")').inner_text().count('Waiting on fax from PCP') == 1, 'typed status shows on the entry row after reload (G28)')
        wf.click('.entry-row:has-text("Wound clinic recheck")')
        ok(wf.locator('dialog[open] dd:has-text("Waiting on fax from PCP")').count() == 1, 'typed status shows in the detail (G28)')
        wf.click('dialog[open] [data-action=edit-entry]'); wf.wait_for_selector('#fld-status')
        ok(wf.input_value('#fld-status') == 'Waiting on fax from PCP', 'editing keeps the typed status selected')
        wf.click('dialog[open] [data-close] >> nth=0')
        go(wf, '#/timeline'); wf.fill('#tl-search', 'fax from pcp'); wf.wait_for_timeout(400)
        ok(wf.locator('.event').count() == 1 and 'Wound clinic recheck' in wf.locator('.event').inner_text(), 'timeline search/filter finds the typed status (G28)')
        wf.goto(cond_url); wf.wait_for_selector('#add-type'); wf.select_option('#add-type', 'visit')
        ok(wf.locator('#fld-status optgroup[label="Used before"] option:has-text("Waiting on fax from PCP")').count() == 1, 'typed status offered again under Used before (G28)')
        wf.click('dialog[open] [data-close] >> nth=0')

        # ---- "Other care disruptions" everywhere (G30)
        go(demo, '#/c/cond-skin'); demo.wait_for_selector('.entry-row')
        ok(demo.locator('h2:has-text("Other care disruptions")').count() == 1 and demo.locator('button:has-text("+ Add other care disruption")').count() == 1, 'condition page uses Other care disruptions (G30)')
        go(demo, '#/timeline')
        ok(demo.locator('#tl-types button:has-text("Other care disruptions")').count() == 1, 'timeline chip uses Other care disruptions (G30)')
        go(demo, '#/types')
        ok(demo.locator('.type-table h3:has-text("Other care disruptions")').count() == 1, 'Entry types page uses Other care disruptions (G30)')
        old = [h for h in ['#/', '#/c/cond-skin', '#/timeline', '#/upcoming', '#/types'] if (go(demo, h), 'Care disruption' in demo.evaluate('document.body.innerText'))[1]]
        ok(old == [], f'old name "Care disruption" appears nowhere: {old} (G30)')

        # ---- remove a field and archive the type: data stays (G4)
        go(wf, '#/types'); wf.click('.type-table li:has-text("Lab results") [data-action=edit-type]')
        wf.click('.field-rows li:has(input[value="Lab code"]) [data-retire]'); wf.click('dialog [type=submit]'); wf.wait_for_timeout(300)
        wf.goto(cond_url); wf.wait_for_selector('#add-type'); wf.click('.entry-row:has-text("CBC with differential")')
        ok(wf.locator('dialog[open] .retired:has-text("CBC-77")').count() == 1, 'removed field value still shown (G4)')
        wf.click('dialog[open] [data-close] >> nth=0')
        go(wf, '#/types'); wf.click('.type-table li:has-text("Lab results") [data-action=edit-type]'); wf.click('[data-archive]'); wf.wait_for_timeout(300)
        wf.goto(cond_url); wf.wait_for_selector('.entry-row:has-text("CBC with differential")')
        ok(wf.locator('#add-type option:has-text("Lab result")').count() == 0, 'archived type leaves the Add menu, entries stay (G4)')

        # ---- isolation in the browser (G6)
        ok(demo.evaluate("fetch('api.php?action=data').then(r => r.json()).then(r => r.doc.entries.some(e => e.title === 'CBC with differential'))") is False, 'demo cannot see wf records (G6)')

        # ---- 390px: no horizontal overflow (G10)
        mobile = page_for(390, 844); mobile.goto(base); mobile.click('#fill-demo'); mobile.click('#login-form [type=submit]'); mobile.wait_for_selector('.condition-card')
        for h in ['#/', '#/c/cond-skin', '#/timeline', '#/upcoming', '#/documents', '#/types']:
            go(mobile, h); mobile.wait_for_timeout(200)
            sw = mobile.evaluate('document.documentElement.scrollWidth')
            ok(sw <= 390, f'390px {h} has no horizontal overflow ({sw}px) (G10)')
        go(mobile, '#/c/cond-skin'); mobile.wait_for_selector('.entry-row'); mobile.click('.entry-row >> nth=0'); mobile.click('dialog[open] [data-action=edit-entry]'); mobile.wait_for_timeout(200)
        ok(mobile.evaluate("document.querySelector('#editor').scrollWidth <= document.querySelector('#editor').clientWidth + 1"), '390px entry form fits (G10)')

        # ---- screenshots for README / critic (demo data only)
        if WANT_SCREENS:
            shots = demo
            go(shots, '#/'); shots.screenshot(path=SCREENS / 'overview.png', full_page=True)
            go(shots, '#/c/cond-skin'); shots.screenshot(path=SCREENS / 'condition.png', full_page=True)
            shots.click('.entry-row:has-text("Prior authorization")'); shots.wait_for_timeout(300); shots.screenshot(path=SCREENS / 'entry-detail.png')
            shots.click('dialog[open] [data-action=edit-entry]'); shots.wait_for_timeout(300); shots.screenshot(path=SCREENS / 'entry-form.png'); shots.click('dialog[open] [data-close] >> nth=0')
            go(shots, '#/timeline'); shots.click('#tl-tags button:has-text("Follow-up needed")'); shots.wait_for_timeout(200); shots.screenshot(path=SCREENS / 'timeline-filtered.png', full_page=True)
            shots.click('#tl-tags button:has-text("Follow-up needed")')
            go(shots, '#/upcoming'); shots.screenshot(path=SCREENS / 'upcoming.png', full_page=True)
            go(shots, '#/documents'); shots.screenshot(path=SCREENS / 'documents.png', full_page=True)
            shots.click('.doc-card [data-kind=pdf] >> nth=0'); shots.wait_for_timeout(800); shots.screenshot(path=SCREENS / 'document-viewer.png'); shots.click('#viewer [data-close] >> nth=0')
            go(shots, '#/types'); shots.screenshot(path=SCREENS / 'entry-types.png', full_page=True)
            shots.click('.type-table li:has-text("Visits") [data-action=edit-type]'); shots.wait_for_timeout(200); shots.screenshot(path=SCREENS / 'type-editor.png'); shots.click('dialog[open] [data-close] >> nth=0')
            go(mobile, '#/'); mobile.screenshot(path=SCREENS / 'mobile-overview.png', full_page=True)
            go(mobile, '#/c/cond-knee'); mobile.screenshot(path=SCREENS / 'mobile-condition.png', full_page=True)
            ok(True, f'screenshots written to {SCREENS.relative_to(ROOT)}')
        ok(errors == [], f'no page errors: {errors}')
        browser.close()
finally:
    server.stop(); shutil.rmtree(tmp, ignore_errors=True)
print(f'PASS: {checks} browser checks.')
