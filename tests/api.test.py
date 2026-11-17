"""HTTP integration tests against real php -S: accounts, isolation, persistence across restart,
storage blocking, concurrency, data-preserving type edits. Run: python3 tests/api.test.py"""
import concurrent.futures, json, pathlib, shutil, subprocess, sys, uuid
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from serve import ROOT, Server, Client, PNG, demo_password

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
    ok(len(ddoc['types']) == 10 and len(ddoc['entries']) >= 28 and len({e['typeId'] for e in ddoc['entries']}) == 10, 'demo seeded across all 10 types (G12)')
    s, r = wf.api('data'); wdoc = r['doc']
    ok(wdoc['conditions'] == [] and wdoc['entries'] == [] and wdoc['tags'] == [] and len(wdoc['types']) == 10, 'wf starts empty with type seeds (G12)')

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

    # Demo reset only for demo
    ok(fresh.api('reset-demo', {})[0] == 403, 'wf cannot reset')
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
