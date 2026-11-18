"""HTTP integration tests against real php -S: accounts, isolation, persistence across restart,
storage blocking, concurrency, data-preserving type edits. Run: python3 tests/api.test.py"""
import concurrent.futures, json, pathlib, shutil, subprocess, sys, uuid
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, Client, PNG, demo_password, PHP
import subprocess as sp
PDF = sp.run([PHP, '-r', 'require "includes/demo-seed.php"; echo synthetic_pdf("Test lab", ["value 1"]);'], cwd=ROOT, capture_output=True, check=True).stdout

checks = 0
def ok(cond, what):
    global checks; checks += 1
    if not cond: print('FAIL:', what); raise SystemExit(1)

# Storage lives INSIDE the served folder so the web-blocking guard is really exercised.
name = 'test-' + uuid.uuid4().hex[:8]
storage = ROOT / 'storage' / name
server = Server(storage).start()
pw = demo_password()
try:
    anon = Client(server)
    ok(anon.api('session') == (200, {'account': None}), 'anonymous session is empty')
    ok(anon.api('data')[0] == 401, 'data requires sign-in')
    ok(anon.login('demo', pw + 'x')[0] == 401, 'wrong password rejected')
    ok(anon.login('nobody', pw)[0] == 401, 'unknown user rejected')
    ok(anon.api('login', {'username': 'demo', 'password': pw}, header=False)[0] == 403, 'POST without X-Appts header blocked')

    demo, wf = Client(server), Client(server)
    s, r = demo.login('demo', pw); ok(s == 200 and r['account']['isDemo'], 'demo login (G5)')
    s, r = wf.login('wf', pw); ok(s == 200 and r['account']['username'] == 'wf' and not r['account']['isDemo'], 'wf login with same password (G5)')
    s, r = demo.api('data'); ddoc = r['doc']
    ok(len(ddoc['types']) == 13 and len(ddoc['entries']) >= 28 and len({e['typeId'] for e in ddoc['entries']}) == 13, 'demo seeded across all 13 types (G12)')
    s, r = wf.api('data'); wdoc = r['doc']
    ok(wdoc['conditions'] == [] and wdoc['entries'] == [] and wdoc['tags'] == [] and len(wdoc['types']) == 13, 'wf starts empty with type seeds (G12)')

    # wf builds real records: condition, tag on the fly, custom type with every kind, entry
    kinds = ['text', 'longtext', 'date', 'number', 'select', 'checkbox', 'link']
    ctype = {'id': 'ct-lab', 'name': 'Lab results', 'singular': 'Lab result', 'icon': '', 'color': '#336699', 'titleLabel': 'Test',
             'primaryDateField': 'f-date', 'fields': [{'id': f'f-{k}', 'label': k.title(), 'kind': k, 'options': ['Low', 'Normal', 'High'] if k == 'select' else [], 'target': 'visit' if k == 'link' else ''} for k in kinds]}
    s, r = wf.api('ops', {'ops': [
        {'op': 'put', 'kind': 'condition', 'value': {'id': 'c-real', 'name': 'Condition A'}},
        {'op': 'put', 'kind': 'tag', 'value': {'id': 'tag-new', 'label': 'Created on the fly', 'color': '#aa3300'}},
        {'op': 'put', 'kind': 'type', 'value': ctype},
        {'op': 'put', 'kind': 'entry', 'value': {'id': 'v1', 'conditionId': 'c-real', 'typeId': 'visit', 'title': 'Visit', 'values': {'date': '2026-11-20'}}},
        {'op': 'put', 'kind': 'entry', 'value': {'id': 'e-lab', 'conditionId': 'c-real', 'typeId': 'ct-lab', 'title': 'A1C', 'tagIds': ['tag-new'],
            'values': {'f-text': 'fasting', 'f-longtext': 'line1\nline2', 'f-date': '2026-11-10', 'f-number': '6.4', 'f-select': 'Normal', 'f-checkbox': True, 'f-link': 'v1'}}}]})
    ok(s == 200, f'wf ops accepted: {r}')
    s, r = wf.api('data'); e = next(x for x in r['doc']['entries'] if x['id'] == 'e-lab')
    ok(e['values']['f-number'] == 6.4 and e['values']['f-checkbox'] is True and e['values']['f-link'] == 'v1' and e['tagIds'] == ['tag-new'], 'custom type entry with every kind survives reload (G4, G15)')

    # Removing a field and archiving the type keep data
    ctype2 = dict(ctype, fields=[f for f in ctype['fields'] if f['id'] != 'f-text'], archived=True)
    s, r = wf.api('ops', {'ops': [{'op': 'put', 'kind': 'type', 'value': ctype2}]})
    t = next(x for x in r['doc']['types'] if x['id'] == 'ct-lab'); e = next(x for x in r['doc']['entries'] if x['id'] == 'e-lab')
    ok(t['archived'] and [f['id'] for f in t['retiredFields']] == ['f-text'] and e['values']['f-text'] == 'fasting', 'field removal + archive keep data (G4)')
    ok(wf.api('ops', {'ops': [{'op': 'delete', 'kind': 'type', 'id': 'ct-lab'}]})[0] == 400, 'type delete refused')
    # Icon + color change persists
    doctor = next(x for x in r['doc']['types'] if x['id'] == 'doctor')
    wf.api('ops', {'ops': [{'op': 'put', 'kind': 'type', 'value': dict(doctor, icon='heart', color='#112233')}]})
    doctor = next(x for x in wf.api('data')[1]['doc']['types'] if x['id'] == 'doctor')
    ok(doctor['icon'] == 'heart' and doctor['color'] == '#112233', 'icon/color change persists (G17)')

    # Isolation (G6)
    s, r = demo.upload(PNG); ok(s == 201, 'demo upload'); img = r['image']['id']
    ok(wf.raw(f'api.php?action=image&id={img}')[0] == 404, 'wf cannot read demo image')
    st, body, hdr = demo.raw(f'api.php?action=image&id={img}'); ok(st == 200 and body == PNG, 'demo reads own image')
    ok(wf.api('images')[1]['images'] == [], 'wf image list excludes demo images')
    ok(not any(x['id'] == 'e-lab' for x in demo.api('data')[1]['doc']['entries']), 'demo cannot see wf entries')
    ok(anon.raw(f'api.php?action=image&id={img}')[0] == 401, 'anonymous cannot read images')
    ok(demo.upload(b'<?php echo 1;', 'x.png')[0] == 400, 'fake image rejected')
    ok(demo.upload(b'<svg xmlns="http://www.w3.org/2000/svg"/>', 'x.svg', 'image/svg+xml')[0] == 400, 'svg rejected')

    # Documents: PDF + image with a custom label created on the fly (G23, G24, G26)
    s, r = wf.upload(PDF, 'cbc results.pdf', 'application/pdf'); ok(s == 201 and r['file']['kind'] == 'pdf', 'wf PDF upload'); wpdf = r['file']
    s, r = wf.upload(PNG, 'photo.png'); ok(s == 201, 'wf image upload'); wimg = r['file']
    ok(wf.upload(b'%PDF-1.4 not really', 'x.pdf', 'application/pdf')[0] == 400, 'truncated PDF rejected')
    ok(wf.upload(b'MZ\x90\x00binary', 'x.pdf', 'application/pdf')[0] == 400, 'non-PDF with .pdf name rejected')
    s, r = wf.api('ops', {'ops': [
        {'op': 'put', 'kind': 'docLabel', 'value': {'id': 'lbl-cbc', 'label': 'Blood panel'}},
        {'op': 'put', 'kind': 'entry', 'value': {'id': 'v1', 'conditionId': 'c-real', 'typeId': 'visit', 'title': 'Lab draw', 'values': {'date': '2026-11-20', 'visit_kind': 'Lab work'},
            'attachments': [dict(wpdf, label='lbl-cbc'), dict(wimg, label='other')]}}]})
    ok(s == 200, f'attach documents: {r}')
    s, r = wf.api('ops', {'ops': [{'op': 'put', 'kind': 'condition', 'value': {'id': 'c-real', 'name': 'Condition A', 'attachments': [dict(wpdf, label='lbl-cbc')]}}]})
    labels = {l['id']: l['label'] for l in r['doc']['docLabels']}
    c = next(x for x in r['doc']['conditions'] if x['id'] == 'c-real')
    ok(labels.get('lbl-cbc') == 'Blood panel' and c['attachments'][0]['label'] == 'lbl-cbc', 'custom label saved and reused on a second record (G24)')
    ok(wf.api('ops', {'ops': [{'op': 'delete', 'kind': 'docLabel', 'id': 'lbl-cbc'}]})[0] == 400, 'labels cannot be deleted')
    st, body, hdr = wf.raw(f"api.php?action=file&id={wpdf['id']}")
    ok(st == 200 and body == PDF and hdr.get('Content-Type') == 'application/pdf', 'wf reads own PDF inline')
    ok(demo.raw(f"api.php?action=file&id={wpdf['id']}")[0] == 404 and anon.raw(f"api.php?action=file&id={wpdf['id']}")[0] == 401, 'other account / anonymous cannot read the PDF (G26)')
    demo_atts = [a for rec in ddoc['entries'] + ddoc['conditions'] for a in rec.get('attachments', [])]
    ok(len(demo_atts) == 5 and all(demo.raw(f"api.php?action=file&id={a['id']}")[0] == 200 for a in demo_atts), 'demo synthetic documents are readable')
    ok(all(wf.raw(f"api.php?action=file&id={a['id']}")[0] == 404 for a in demo_atts), 'wf cannot read demo documents (G26)')
    ok(any(e['values'].get('visit_kind') == 'Lab work' and not e['values'].get('doctor') for e in ddoc['entries'] if e['typeId'] == 'visit'), 'lab-work visit without a doctor')

    # Storage is never served (G8)
    files = [p for p in storage.rglob('*') if p.is_file()]
    ok(any(p.name == 'wf.json.php' for p in files) and any(p.name == img + '.php' for p in files), 'data and image files exist on disk')
    for p in files:
        st, body, _ = anon.raw(str(p.relative_to(ROOT)))
        if p.name == '.htaccess':  # php -S ignores .htaccess; it only holds the Apache rule
            ok(body.strip() == b'Require all denied', '.htaccess holds no data'); continue
        ok(st == 404 and b'conditions' not in body and PNG not in body and b'$2y$' not in body, f'{p.relative_to(ROOT)} not served (got {st})')
    for p in ['storage/', f'storage/{name}/', f'storage/{name}/data/']:
        st, body, _ = anon.raw(p); ok(st == 404 and b'conditions' not in body, f'{p} is 404')
    ok((ROOT / 'storage/.htaccess').read_text().strip() == 'Require all denied', '.htaccess denies storage for Apache')

    # Concurrency: 20 parallel writes all land (flock + atomic rename)
    def add_tag(i):
        c = Client(server); c.login('wf', pw)
        return c.api('ops', {'ops': [{'op': 'put', 'kind': 'tag', 'value': {'id': f'par-{i}', 'label': f'Parallel {i}'}}]})[0]
    with concurrent.futures.ThreadPoolExecutor(8) as pool: statuses = list(pool.map(add_tag, range(20)))
    tags = {t['id'] for t in wf.api('data')[1]['doc']['tags']}
    ok(statuses == [200] * 20 and all(f'par-{i}' in tags for i in range(20)), 'parallel writes all persisted')
    backups = list((storage / 'backups' / 'wf').glob('*.json.php'))
    ok(0 < len(backups) <= 20, f'backups rotated ({len(backups)})')
    ok(not list(storage.rglob('*.tmp.php')), 'no temp files left')

    # Persistence across a restart (G7)
    server.stop(); server = Server(storage, server.port).start()
    fresh = Client(server); ok(fresh.login('wf', pw)[0] == 200, 'login after restart')
    d = fresh.api('data')[1]['doc']
    ok(any(x['id'] == 'e-lab' for x in d['entries']) and any(x['id'] == 'ct-lab' for x in d['types']) and 'tag-new' in {t['id'] for t in d['tags']}, 'records persist across php -S restart (G7)')

    v1 = next(x for x in d['entries'] if x['id'] == 'v1')
    ok([a['label'] for a in v1['attachments']] == ['lbl-cbc', 'other'] and fresh.raw(f"api.php?action=file&id={wpdf['id']}")[1] == PDF and fresh.raw(f"api.php?action=file&id={wimg['id']}")[1] == PNG, 'PDF + image uploads persist across restart (G23)')
    # Demo reset only for demo
    ok(fresh.api('reset-demo', {})[0] == 403, 'wf cannot reset')
    # ---- free-text status over HTTP (G28) and the v1 -> v2 migration on load (G31)
    mc = Client(server); ok(mc.login('wf', pw)[0] == 200, 'wf signs in for migration checks')
    doc = mc.api('data')[1]['doc']
    cid = doc['conditions'][0]['id'] if doc['conditions'] else 'cond-ft'
    ops = ([] if doc['conditions'] else [{'op': 'put', 'kind': 'condition', 'value': {'id': cid, 'name': 'Heel'}}]) + [{'op': 'put', 'kind': 'entry', 'value': {'id': 'entry-ft', 'conditionId': cid, 'typeId': 'visit', 'title': 'Wound check', 'values': {'date': '2026-11-20', 'status': 'Waiting on fax'}}}]
    ok(mc.api('ops', {'ops': ops})[0] == 200, 'free-text status accepted')
    doc = mc.api('data')[1]['doc']
    ok(next(e for e in doc['entries'] if e['id'] == 'entry-ft')['values']['status'] == 'Waiting on fax', 'free-text status reloads verbatim (G28)')
    ok(doc['version'] == 3 and next(t for t in doc['types'] if t['id'] == 'disruption')['name'] == 'Other care disruptions', 'current documents are v3 with the new name')
    # Turn the stored file back into a v1 document with a user-renamed disruption type, then load it.
    hh_ids = ['hh_auth', 'hh_visit', 'hh_event']
    v1 = json.loads(json.dumps(doc)); v1['version'] = 1
    v1['types'] = [t for t in v1['types'] if t['id'] not in hh_ids]
    for t in v1['types']:
        if t['id'] == 'disruption': t['name'], t['singular'] = 'Broken equipment', 'Broken equipment'
        if t['id'] == 'letter': t['name'] = 'Care disruptions'  # a non-disruption type that happens to use the old name stays as is
        for f in t['fields']: f.pop('allowCustom', None)
    guard = b"<?php http_response_code(404); exit; ?>\n"
    path = storage / 'data' / 'wf.json.php'
    v1_bytes = guard + json.dumps(v1, indent=4, ensure_ascii=False).encode(); path.write_bytes(v1_bytes)
    bdir = storage / 'backups' / 'wf'; before_backups = {b.name for b in bdir.glob('*.json.php')}
    m = mc.api('data')[1]['doc']; mt = {t['id']: t for t in m['types']}
    ok(m['version'] == 3 and json.loads(path.read_bytes()[len(guard):])['version'] == 3, 'v1 document migrated and saved on load (G31)')
    new_backups = [b for b in bdir.glob('*.json.php') if b.name not in before_backups]
    ok(len(new_backups) == 1 and new_backups[0].read_bytes() == v1_bytes, 'migration backed up the exact v1 bytes first (G31)')
    after_backups = {b.name for b in bdir.glob('*.json.php')}
    ok(mt['disruption']['name'] == 'Broken equipment' and mt['letter']['name'] == 'Care disruptions', "user's own type names kept (G31)")
    ok(all(next(f for f in mt[i]['fields'] if f['id'] == 'status').get('allowCustom') is True for i in ['visit', 'letter', 'appeal', 'supply', 'treatment']), 'built-in status fields allow free text after migration (G29)')
    ok(all(json.dumps(m[k], sort_keys=True) == json.dumps(v1[k], sort_keys=True) for k in ['conditions', 'entries', 'tags', 'docLabels']), 'migration left conditions, entries, tags, labels unchanged (G31)')
    ok([t['id'] for t in m['types']] == [t['id'] for t in v1['types']] + hh_ids, 'home health types appended after the existing ones (G35)')
    mc.api('data')
    ok({b.name for b in bdir.glob('*.json.php')} == after_backups, 'second load does not migrate again (G31)')
    # v2 -> v3 over HTTP: a v2 file (no home health types) gains them on load, records untouched (G35).
    v2 = json.loads(json.dumps(m)); v2['version'] = 2; v2['types'] = [t for t in v2['types'] if t['id'] not in hh_ids]
    v2_bytes = guard + json.dumps(v2, indent=4, ensure_ascii=False).encode(); path.write_bytes(v2_bytes)
    before_backups = {b.name for b in bdir.glob('*.json.php')}
    m3 = mc.api('data')[1]['doc']
    new_backups = [b for b in bdir.glob('*.json.php') if b.name not in before_backups]
    ok(m3['version'] == 3 and [t['id'] for t in m3['types']] == [t['id'] for t in v2['types']] + hh_ids, 'v2 document gains the home health types on load (G35)')
    ok(len(new_backups) == 1 and new_backups[0].read_bytes() == v2_bytes, 'v3 migration backed up the exact v2 bytes first (G35)')
    ok(json.dumps(m3['types'][:len(v2['types'])], sort_keys=True) == json.dumps(v2['types'], sort_keys=True), 'existing type definitions unchanged by v3 (G35)')
    ok(all(json.dumps(m3[k], sort_keys=True) == json.dumps(v2[k], sort_keys=True) for k in ['conditions', 'entries', 'tags', 'docLabels']), 'v3 left conditions, entries, tags, labels unchanged (G35)')
    # Home health records save and reload through the API (G33).
    hh_ops = [{'op': 'put', 'kind': 'entry', 'value': {'id': 'hh-a', 'conditionId': cid, 'typeId': 'hh_auth', 'title': 'Nursing', 'values': {'visits_authorized': 3, 'status': 'Approved'}}},
              {'op': 'put', 'kind': 'entry', 'value': {'id': 'hh-v', 'conditionId': cid, 'typeId': 'hh_visit', 'title': 'Visit', 'values': {'date': '2026-11-18', 'authorization': 'hh-a', 'outcome': 'Missed: nurse unavailable'}}},
              {'op': 'put', 'kind': 'entry', 'value': {'id': 'hh-e', 'conditionId': cid, 'typeId': 'hh_event', 'title': 'Call', 'values': {'date': '2026-11-18', 'event_kind': 'Called the agency twice', 'authorization': 'hh-a'}}}]
    ok(mc.api('ops', {'ops': hh_ops})[0] == 200, 'home health authorization, visit, and event saved')
    got = {e['id']: e for e in mc.api('data')[1]['doc']['entries']}
    ok(got['hh-v']['values']['outcome'] == 'Missed: nurse unavailable' and got['hh-e']['values']['event_kind'] == 'Called the agency twice' and got['hh-v']['values']['authorization'] == 'hh-a', 'home health records reload with links and typed event (G33)')
    # Only hashes on disk / in git
    # Account records hold only bcrypt hashes; the demo password literal exists only in the public demo UI module.
    accounts = (ROOT / 'includes/accounts.php').read_text()
    leaks = [] if accounts.count("'hash' => '$2y$") == 2 and f"'{pw}'" not in accounts and f'"{pw}"' not in accounts else ['includes/accounts.php']
    ok(leaks == [], f'no plaintext password literal in tracked files (G5): {leaks}')
    literals = [f'"{pw}"'.encode(), f"'{pw}'".encode(), f':"{pw}"'.encode()]
    ok(all(not any(l in p.read_bytes() for l in literals) for p in storage.rglob('*') if p.is_file()), 'no plaintext password in storage')
finally:
    server.stop()
    shutil.rmtree(storage, ignore_errors=True)
print(f'PASS: {checks} HTTP checks: logins, isolation, storage blocking, concurrency, restart persistence, data-safe type edits.')
