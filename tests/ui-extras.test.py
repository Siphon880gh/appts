"""Playwright gates for t45u-t55u UI work: click outside closes dialogs (unsaved guard, drag-safe),
Clinical Significance drawer, key highlights, list ★/📎 icons, Quick preview, 📎 gallery, and the
Timeline filter panel. Run: python3 tests/ui-extras.test.py [--no-screens]
Screenshots go to $APPTS_SHOTS (default docs/screenshots/ui) when screens are on."""
import base64, json, os, pathlib, shutil, subprocess, sys, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, demo_password, PHP
from playwright.sync_api import sync_playwright

WANT = '--no-screens' not in sys.argv
SHOTS = pathlib.Path(os.environ.get('APPTS_SHOTS') or (ROOT / 'docs' / 'screenshots' / 'ui'))
php = lambda code: subprocess.run([PHP, '-r', f'require "includes/demo-seed.php"; {code}'], cwd=ROOT, capture_output=True, check=True).stdout
checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)
    print('  ok -', what)
def shot(pg, name, **kw):
    if WANT: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / name), **kw)

tmp = pathlib.Path(tempfile.mkdtemp(prefix='appts-ui-'))
work = pathlib.Path(tempfile.mkdtemp(prefix='appts-ui-files-'))
server = Server(tmp).start()
pw = demo_password()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        errors = []
        mode = {'confirm': True}
        def page_for(width=1440, height=1000, **ctx):
            pg = browser.new_context(viewport={'width': width, 'height': height}, **ctx).new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            def on_dialog(d):
                if d.type == 'prompt': d.accept('Follow-ups')
                elif d.type == 'confirm': (d.accept() if mode['confirm'] else d.dismiss())
                else: d.accept()
            pg.on('dialog', on_dialog)
            return pg
        def login(pg):
            pg.goto(server.url('')); pg.click('#fill-demo'); pg.click('#login-form [type=submit]'); pg.wait_for_selector('.condition-card')
        go = lambda pg, h: (pg.evaluate(f"location.hash = '{h}'"), pg.wait_for_timeout(300))
        pg = page_for(); login(pg)

        # ---- 4 attachments on one entry (intake CLI) for the gallery
        files = []
        for i, rgb in enumerate([[200, 60, 60], [60, 160, 90], [60, 90, 200]]):
            f = work / f'photo-{i + 1}.png'; f.write_bytes(php(f'echo synthetic_png("Gallery photo {i + 1}", [{rgb[0]}, {rgb[1]}, {rgb[2]}]);')); files.append({'path': str(f), 'label': 'Progress'})
        f = work / 'report.pdf'; f.write_bytes(php('echo synthetic_pdf("Gallery report", ["page 1"]);')); files.append({'path': str(f), 'label': 'Lab'})
        (work / 'plan.json').write_text(json.dumps({'condition': 'cond-knee', 'create': [{'type': 'Clinical event', 'title': 'Gallery test event', 'values': {'date': '2026-11-10'},
            'notes': 'Line one\n\nline three\n    indented four', 'attachments': files}]}))
        run = subprocess.run([PHP, 'tools/intake.php', 'apply', 'demo', str(work / 'plan.json')], cwd=ROOT, capture_output=True, text=True, env=dict(os.environ, APPTS_STORAGE_DIR=str(tmp)))
        ok(run.returncode == 0, f'intake adds an entry with 4 attachments: {run.stderr.strip()}')
        pg.reload(); pg.wait_for_selector('.condition-card')

        # ---- Timeline filter panel (t50u, t54u)
        go(pg, '#/timeline'); pg.wait_for_selector('#tl-views')
        shot(pg, 'filters-after-desktop.png', clip=pg.locator('.filters').bounding_box())
        labels = pg.locator('.fp .fp-label').all_inner_texts()
        ok([l.strip().upper() for l in labels][:3] == ['VIEWS', 'FILTER', 'TYPES'], f'one label column: Views / Filter / Types ({labels})')
        ok(pg.locator('#tl-views #tl-presets [data-action=tl-all]').count() == 1 and pg.locator('#tl-views #tl-presets [data-action=tl-disruptions]').count() == 1, 'built-in views and saved views share one Views row')
        boxes = [pg.locator(s).bounding_box() for s in ['#tl-cond', '#tl-filter .segmented', '#tl-search']]
        ok(max(b['y'] + b['height'] / 2 for b in boxes) - min(b['y'] + b['height'] / 2 for b in boxes) < 4, 'condition, time range, and search sit on one aligned Filter row')
        widths = {round(b['width']) for b in pg.locator('#tl-types .chip').evaluate_all('cs => cs.map(c => c.getBoundingClientRect().toJSON())')}
        ok(len(widths) == 1, f'type chips are one even grid (no orphan chip on its own wide line): {widths}')
        ok(pg.locator('#tl-count').inner_text().endswith('entries'), f'result line counts entries: {pg.locator("#tl-count").inner_text()}')
        pg.click('#tl-types .chip >> nth=0'); pg.wait_for_timeout(200)
        ok('filtered by type' in pg.locator('#tl-count').inner_text() and pg.locator('.fp-result [data-action=tl-clear]').count() == 1, 'the result line says what filters it, with Clear filters')
        pg.click('#tl-types .chip >> nth=0'); pg.wait_for_timeout(100)
        pg.click('#tl-tags .chip >> nth=0'); pg.wait_for_timeout(200)
        pg.click('[data-action=tl-view-save]'); pg.wait_for_timeout(400)
        pg.click('[data-action=tl-all]'); pg.wait_for_timeout(200)
        wrap = pg.locator('#tl-views .view-chip-wrap').first
        ok(wrap.locator('.view-del').count() == 1, 'the × is inside the saved-view chip')
        wb, db, ab = wrap.bounding_box(), wrap.locator('.view-del').bounding_box(), pg.locator('[data-action=tl-all]').bounding_box()
        ok(abs((db['y'] + db['height'] / 2) - (wb['y'] + wb['height'] / 2)) < 1.5 and abs(wb['height'] - ab['height']) < 1.5, f'× is vertically centered and the saved chip is the same height as the built-ins ({wb["height"]} vs {ab["height"]})')
        chips = pg.locator('#tl-views .view-chip-wrap, #tl-presets .view-chip').evaluate_all('cs => cs.map(c => c.getBoundingClientRect().toJSON()).sort((a, b) => a.x - b.x)')
        gaps = [round(b['x'] - (a['x'] + a['width'])) for a, b in zip(chips, chips[1:]) if abs(a['y'] - b['y']) < 2]
        ok(gaps and min(gaps) >= 6 and max(gaps) <= 10, f'views have an even ~8px gap ({gaps})')
        cnt, lab = pg.locator('[data-action=tl-disruptions] .count'), pg.locator('[data-action=tl-disruptions]')
        ok(cnt.evaluate('e => getComputedStyle(e).color') != lab.evaluate('e => getComputedStyle(e).color'), 'the count badge is muted')
        wrap.hover(); pg.wait_for_timeout(200)
        ok(float(wrap.locator('.view-del').evaluate('e => getComputedStyle(e).opacity')) > 0.5, 'the × shows on hover')
        shot(pg, 'views-row-after.png', clip=pg.locator('#tl-views').bounding_box())
        pg.click('#tl-views [data-action=tl-view]'); pg.wait_for_timeout(200)
        ok('on' in (wrap.get_attribute('class') or ''), 'the active saved view is clearly filled')
        pg.click('[data-action=tl-all]'); pg.wait_for_timeout(200)
        for w, name in [(820, 'ipad'), (390, 'narrow')]:
            m = page_for(w, 1000); login(m); go(m, '#/timeline'); m.wait_for_selector('#tl-views')
            ok(m.evaluate('document.documentElement.scrollWidth') <= w + 1, f'filter panel fits a {w}px screen without sideways scroll')
            shot(m, f'filters-after-{name}.png', clip=m.locator('.filters').bounding_box()); m.context.close()

        # ---- Key highlight ★ + 📎 icons in lists (t44u), sanitized
        go(pg, '#/c/cond-skin'); pg.wait_for_selector('.entry-row')
        row = pg.locator('.entry-row[data-id="letter-rad-auth"]').first
        ok(row.locator('.hl-icon').count() == 1 and row.locator('.att-icon .att-count').inner_text() == '1', 'a list row shows the ★ key-highlight and 📎 attachment icons')
        ok('key highlight' in (row.get_attribute('aria-label') or '') or row.get_attribute('aria-describedby'), 'the ★ highlight is exposed to screen readers')
        row.click(); pg.wait_for_selector('#editor[open] .key-hl, #viewer[open] .key-hl, dialog[open] .key-hl')
        ok('Authorization ends before' in pg.locator('dialog[open] .key-hl').inner_text(), 'the entry detail shows the key highlight at the top')
        pg.click('dialog[open] [data-action=edit-entry]'); pg.wait_for_selector('#entry-highlight')
        pg.fill('#entry-highlight', 'Ends <b>early</b>\nsecond line'); pg.click('dialog[open] [type=submit]'); pg.wait_for_selector('dialog[open] .key-hl')
        ok(pg.locator('dialog[open] .key-hl b').count() == 1 and 'Ends <b>early</b>' in pg.locator('dialog[open] .key-hl p').inner_text(), 'a key highlight is plain text: markup shows literally, never as HTML')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

        # ---- t46u: click outside closes; unsaved guard; drag from inside does not close
        row.click(); pg.wait_for_selector('dialog[open]')
        pg.mouse.click(8, 500); pg.wait_for_timeout(200)
        ok(pg.locator('dialog[open]').count() == 0, 'a click outside the box closes the entry detail')
        row.click(); pg.wait_for_selector('dialog[open]'); pg.click('dialog[open] [data-action=edit-entry]'); pg.wait_for_selector('#entry-title')
        t = pg.locator('#entry-title').bounding_box()
        pg.mouse.move(t['x'] + 10, t['y'] + t['height'] / 2); pg.mouse.down(); pg.mouse.move(8, 500, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
        ok(pg.locator('#entry-form').count() == 1, 'a text-selection drag that ends outside the box does not close it')
        pg.mouse.click(8, 500); pg.wait_for_timeout(200)
        ok(pg.locator('#entry-form').count() == 0, 'an untouched form closes on an outside click without asking')
        row.click(); pg.wait_for_selector('dialog[open]'); pg.click('dialog[open] [data-action=edit-entry]'); pg.wait_for_selector('#entry-title')
        pg.fill('#entry-title', 'Changed but not saved'); mode['confirm'] = False
        pg.mouse.click(8, 500); pg.wait_for_timeout(200)
        ok(pg.locator('#entry-form').count() == 1, 'with unsaved edits, an outside click asks first and stays open when declined')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        ok(pg.locator('#entry-form').count() == 1, 'Esc uses the same unsaved-edits guard')
        mode['confirm'] = True; pg.mouse.click(8, 500); pg.wait_for_timeout(200)
        ok(pg.locator('#entry-form').count() == 0, 'accepting the guard discards and closes')

        # ---- Clinical Significance drawer (right side; bottom-left corner stays clear)
        go(pg, '#/c/cond-skin'); pg.wait_for_selector('#cs')
        ok(pg.locator('#cs .cs-item, #cs li').count() >= 3, 'the condition shows its Clinical significance highlights')
        pg.click('#cs [data-action=open-highlight] >> nth=0'); pg.wait_for_selector('#cs-drawer[open]'); pg.wait_for_timeout(450)  # after the slide-in
        d = pg.locator('#cs-drawer').bounding_box(); vw = pg.viewport_size['width']
        ok(abs(d['x'] + d['width'] - vw) < 2 and d['x'] > 300, 'the detail opens in a right-side drawer, leaving the bottom-left corner clear')
        shot(pg, 'cs-drawer.png')
        pg.mouse.click(40, 500); pg.wait_for_timeout(300)
        ok(pg.locator('#cs-drawer[open]').count() == 0, 'a click outside the drawer closes it')

        # ---- Quick preview (t49u, t52u): off by default, whole tile, pre-wrap, translucent + blur, persisted
        go(pg, '#/c/cond-knee'); pg.wait_for_selector('.entry-row')
        tile = pg.locator('.entry-row:has-text("Gallery test event")').first
        ok(pg.locator('[data-action=toggle-quick-preview]').first.get_attribute('aria-pressed') == 'false', 'Quick preview is off by default')
        tile.hover(position={'x': 30, 'y': 10}); pg.wait_for_timeout(500)
        ok(pg.locator('#quick-preview:not([hidden])').count() == 0, 'with Quick preview off, hovering shows no popover')
        ok(tile.locator('text=✎').count() == 0, 'the ✎ pencil hover icon is gone')
        pg.click('[data-action=toggle-quick-preview] >> nth=0'); pg.wait_for_timeout(100)
        tile.hover(position={'x': 30, 'y': 10}); pg.wait_for_selector('#quick-preview:not([hidden])')
        txt = pg.locator('#quick-preview .qp-notes .qp-text')
        ok(txt.evaluate('e => getComputedStyle(e).whiteSpace') == 'pre-wrap' and txt.evaluate('e => e.textContent') == 'Line one\n\nline three\n    indented four', 'hovering anywhere on the tile shows the notes with spacing and line breaks kept')
        bg = pg.locator('#quick-preview').evaluate('e => [getComputedStyle(e).backgroundColor, getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter]')
        ok('rgba' in bg[0] and 'blur' in (bg[1] or ''), f'the popover is slightly see-through with a blur behind it ({bg})')
        ok(pg.locator('#quick-preview').bounding_box()['width'] >= 500, 'the popover is roomy')
        shot(pg, 'quick-preview.png')
        pg.reload(); pg.wait_for_selector('.entry-row')
        ok(pg.locator('[data-action=toggle-quick-preview]').first.get_attribute('aria-pressed') == 'true', 'Quick preview stays on after a reload')

        # ---- 📎 gallery (t53u): 3 at a time, chevrons + scroll-snap, opens the file, wins over Quick preview
        tile = pg.locator('.entry-row:has-text("Gallery test event")').first
        tile.locator('.att-icon').hover(); pg.wait_for_selector('#att-gallery:not([hidden])')
        g = pg.locator('#att-gallery')
        ok(g.locator('.ag-item').count() == 4 and g.locator('.ag-item > img').count() == 3 and g.locator('.ag-item .pdf-thumb').count() == 1 and g.locator('.ag-pdf').count() == 1, 'the gallery shows image thumbnails and a PDF preview (tile underneath as fallback)')
        tr = g.locator('.ag-track')
        ok(round(tr.evaluate('e => e.clientWidth') / 140) == 3, 'three thumbnails fit at a time')
        ok(tr.evaluate('e => getComputedStyle(e).scrollSnapType').startswith('x'), 'the strip scrolls sideways with snap')
        ok(g.locator('[data-ag-dir="-1"]').is_disabled() and not g.locator('[data-ag-dir="1"]').is_disabled(), 'more than 3: chevrons, the left one disabled at the start')
        ok(pg.locator('#quick-preview:not([hidden])').count() == 0, 'the 📎 hover takes priority over the Quick preview popover')
        shot(pg, 'attachment-gallery.png')
        g.locator('[data-ag-dir="1"]').click(); pg.wait_for_timeout(600)
        ok(tr.evaluate('e => e.scrollLeft') > 0, 'the right chevron scrolls to more')
        g.locator('.ag-item').last.click(); pg.wait_for_selector('#viewer[open]')
        ok(pg.locator('#att-gallery:not([hidden])').count() == 0, 'clicking a thumbnail opens that attachment')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.click('[data-action=toggle-quick-preview] >> nth=0')


        # ---- t59u: description popover + block above Clinical significance; no empty CS panel
        go(pg, '#/c/cond-knee'); pg.wait_for_selector('.condition-head')
        ok(pg.locator('#cs').count() == 0 and pg.locator('.condition-head [data-action=add-highlight]').count() == 1, 'a condition with no highlights shows no "Clinical significance 0" panel, only a "+ Highlight" action')
        pg.click('.condition-head [data-action=edit-condition]'); pg.wait_for_selector('#c-desc')
        pg.fill('#c-desc', 'Osteoarthritis, left knee\nmoderate (synthetic)'); pg.click('dialog[open] [type=submit]'); pg.wait_for_timeout(500)
        name = pg.locator('.condition-head h1 .cond-name')
        ok(name.get_attribute('title') is None, 'no plain browser tooltip on the condition name')
        name.hover(); pg.wait_for_selector('#desc-pop:not([hidden])')
        ok('Osteoarthritis, left knee' in pg.locator('#desc-pop').inner_text() and pg.locator('#desc-pop .desc-arrow').count() == 1, 'hovering the name shows a styled description popover with an arrow')
        shot(pg, 'description-popover.png', clip={'x': 0, 'y': 0, 'width': 1100, 'height': 420})
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        ok(pg.locator('#desc-pop:not([hidden])').count() == 0, 'Esc closes the description popover')
        ok('Osteoarthritis, left knee' in pg.locator('.cond-desc-block').inner_text(), 'the description also shows on the condition page')
        go(pg, '#/c/cond-skin'); pg.wait_for_selector('#cs')
        pg.click('.condition-head [data-action=edit-condition]'); pg.wait_for_selector('#c-desc'); pg.fill('#c-desc', 'Pressure wound (synthetic)'); pg.click('dialog[open] [type=submit]'); pg.wait_for_timeout(500)
        ok(pg.locator('.cond-desc-block').bounding_box()['y'] < pg.locator('#cs').bounding_box()['y'], 'the description block sits above Clinical significance')
        shot(pg, 'condition-description-cs.png', full_page=False)

        # ---- t61u: Memo (notes to self) per condition
        go(pg, '#/c/cond-knee'); pg.wait_for_selector('[data-action=open-memo]')
        pg.click('[data-action=open-memo]'); pg.wait_for_selector('#memo-text')
        ok('Memo is where you keep notes to yourself, such as documents you’ll incorporate here and to-dos.' in pg.locator('.memo-explain').inner_text(), 'the Memo modal explains what it is for')
        memo = 'To add: MRI report\n\n  - ask PT about stairs\nTo do: call insurer'
        pg.fill('#memo-text', memo); shot(pg, 'memo-modal.png')
        pg.click('#memo-form [type=submit]'); pg.wait_for_timeout(500)
        pg.reload(); pg.wait_for_selector('[data-action=open-memo] .memo-dot')
        pg.click('[data-action=open-memo]'); pg.wait_for_selector('#memo-text')
        ok(pg.input_value('#memo-text') == memo and pg.locator('#memo-text').evaluate('e => getComputedStyle(e).whiteSpace') == 'pre-wrap', 'the memo is saved per condition and keeps its spacing after a reload')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        go(pg, '#/c/cond-skin'); pg.wait_for_selector('[data-action=open-memo]')
        ok(pg.locator('[data-action=open-memo] .memo-dot').count() == 0, 'another condition has its own (empty) memo')

        # ---- t65u: EVERY modal/drawer closes on an outside click; ones with edits ask first
        def outside_point(box):
            vw, vh = pg.viewport_size['width'], pg.viewport_size['height']
            if box['x'] > 30: return 12, vh / 2
            if box['x'] + box['width'] < vw - 30: return vw - 12, vh / 2
            return vw / 2, max(5, box['y'] - 12)
        def click_outside():
            d = pg.locator('dialog[open]').last; x, y = outside_point(d.bounding_box()); pg.mouse.click(x, y); pg.wait_for_timeout(200)
        def open_count(): return pg.locator('dialog[open]').count()
        modals = [
            ('entry form', '#/c/cond-knee', '[data-action=add-entry]', True),
            ('entry detail', '#/c/cond-knee', '.entry-row', False),
            ('condition edit', '#/c/cond-knee', '.condition-head [data-action=edit-condition]', True),
            ('Memo', '#/c/cond-knee', '[data-action=open-memo]', True),
            ('highlight form', '#/c/cond-knee', '.condition-head [data-action=add-highlight]', True),
            ('Clinical significance drawer', '#/c/cond-skin', '#cs [data-action=open-highlight]', False),
            ('add condition', '#/', '[data-action=add-condition]', True),
            ('entry type editor', '#/types', '[data-action=edit-type]', True),
            ('document viewer', '#/documents', '.doc-card .preview', False),
            ('quick upload', '#/documents', '[data-action=quick-upload]', False),
            ('Offline mode info', '#/', '[data-offline=info]', False),
        ]
        seen = []
        for name, route, opener, editable in modals:
            go(pg, route); pg.wait_for_selector(opener, state='attached'); pg.mouse.move(2, 2)
            pg.locator(opener).first.click(); pg.wait_for_selector('dialog[open]')
            click_outside()
            ok(open_count() == 0, f'{name}: an outside click closes it')
            if editable:
                pg.locator(opener).first.click(); pg.wait_for_selector('dialog[open]')
                field = pg.locator('dialog[open] form textarea:visible, dialog[open] form input[type=text]:visible, dialog[open] form input:not([type]):visible').first
                field.click(); field.press('End'); field.type(' x')
                mode['confirm'] = False; click_outside()
                ok(open_count() == 1, f'{name}: with unsaved edits an outside click asks first and stays open when declined')
                mode['confirm'] = True; click_outside()
                ok(open_count() == 0, f'{name}: accepting discards and closes')
            seen.append(name)
        # the expanded note editor sits on top of the entry form: an outside click closes only it
        go(pg, '#/c/cond-knee'); pg.locator('[data-action=add-entry]').first.click(); pg.wait_for_selector('dialog[open] [data-expand]')
        pg.locator('dialog[open] [data-expand]').first.click(); pg.wait_for_selector('dialog.editor-expanded[open]')
        click_outside()
        ok(pg.locator('dialog.editor-expanded[open]').count() == 0 and open_count() == 1, 'expanded note editor: an outside click returns to the form (draft kept)')
        mode['confirm'] = True; click_outside(); ok(open_count() == 0, 'then the form closes on an outside click too')
        # description popover
        go(pg, '#/c/cond-knee'); pg.locator('.condition-head h1 .cond-name').hover(); pg.wait_for_selector('#desc-pop:not([hidden])')
        pg.mouse.click(12, 600); pg.wait_for_timeout(150)
        ok(pg.locator('#desc-pop:not([hidden])').count() == 0, 'description popover: an outside click closes it')
        ok(len(seen) == len(modals), f'all {len(modals)} modals checked: {", ".join(seen)}')
        # ---- touch / iPad: tap shows preview, tap again or "Open entry" opens it, tap elsewhere dismisses
        ip = page_for(820, 1180, has_touch=True, is_mobile=True); login(ip)
        ip.evaluate("localStorage.setItem('appts.quickPreview', '1')"); ip.reload(); ip.wait_for_selector('.condition-card')
        go(ip, '#/c/cond-knee'); ip.wait_for_selector('.entry-row')
        t2 = ip.locator('.entry-row:has-text("Gallery test event")').first
        t2.tap(position={'x': 30, 'y': 10}); ip.wait_for_timeout(300)
        ok(ip.locator('#quick-preview:not([hidden])').count() == 1 and ip.locator('dialog[open]').count() == 0, 'iPad: a tap on the tile shows the preview instead of opening it')
        ip.tap('h1'); ip.wait_for_timeout(200)
        ok(ip.locator('#quick-preview:not([hidden])').count() == 0, 'iPad: a tap elsewhere dismisses it')
        t2.tap(position={'x': 30, 'y': 10}); ip.wait_for_timeout(300); ip.tap('#quick-preview [data-qp-open]'); ip.wait_for_timeout(400)
        ok(ip.locator('dialog[open]').count() == 1, 'iPad: "Open entry" in the preview opens the entry normally')
        ip.keyboard.press('Escape'); ip.wait_for_timeout(200)
        t2.locator('.att-icon').tap(); ip.wait_for_timeout(300)
        ok(ip.locator('#att-gallery:not([hidden])').count() == 1 and ip.locator('dialog[open]').count() == 0, 'iPad: a tap on 📎 shows the gallery')
        ip.context.close()
        ok(errors == [], f'no page errors: {errors}')
        browser.close()
finally:
    server.stop(); shutil.rmtree(tmp, ignore_errors=True); shutil.rmtree(work, ignore_errors=True)
print(f'PASS: {checks} UI checks (dialogs, highlights, icons, Quick preview, gallery, filter panel).')
