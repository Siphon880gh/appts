<?php
declare(strict_types=1);
// Storage, sanitizer, and server-side domain rules. Run: php tests/storage.test.php
$dir = sys_get_temp_dir() . '/appts-storage-' . bin2hex(random_bytes(4));
putenv("APPTS_STORAGE_DIR=$dir");
require_once __DIR__ . '/../includes/domain.php';
require_once __DIR__ . '/../includes/demo-seed.php';
require_once __DIR__ . '/../includes/uploads.php';
$checks = 0;
function ok(bool $cond, string $what): void { global $checks; $checks++; if (!$cond) { fwrite(STDERR, "FAIL: $what\n"); exit(1); } }
function throws(callable $fn, string $what): void { try { $fn(); } catch (InvalidArgumentException $e) { ok(true, $what); return; } ok(false, $what); }

// Guarded round trip and atomic writes
ok(guarded_decode(guarded_encode("abc\0")) === "abc\0", 'guard round trip');
$doc = new_doc();
write_doc('wf', $doc);
ok(str_starts_with((string) file_get_contents(doc_path('wf')), STORAGE_GUARD), 'doc file starts with guard');
ok(read_doc('wf')['types'] === $doc['types'], 'doc round trip');
for ($i = 0; $i < 25; $i++) { $doc['revision'] = $i; write_doc('wf', $doc); }
ok(count(list_backups('wf')) === BACKUP_KEEP, 'backups capped at ' . BACKUP_KEEP);
ok(!glob(storage_dir('data') . '/*.tmp.php'), 'no temp files left behind');
ok(is_file(storage_dir('data') . '/index.php') && is_file(storage_dir('data') . '/.htaccess'), 'every storage dir gets guards');
ok(with_lock('wf', fn() => 42) === 42, 'lock returns callback value');
throws(fn() => storage_dir('../x'), 'storage path traversal rejected');

// Images are guarded files too
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=');
$tmp = tempnam(sys_get_temp_dir(), 'png'); file_put_contents($tmp, $png);
$img = store_upload('wf', $tmp);
ok($img['id'] === hash('sha256', $png) . '.png', 'image is content addressed');
ok(str_starts_with((string) file_get_contents(upload_file('wf', $img['id'])), STORAGE_GUARD), 'image file guarded');
ok(read_upload('wf', $img['id']) === $png, 'image round trip');
ok(read_upload('demo', $img['id']) === null, 'image isolated per account');
$pdf = synthetic_pdf('Test', ['line']);
$pdfInfo = store_bytes('wf', $pdf);
ok($pdfInfo['kind'] === 'pdf' && str_ends_with($pdfInfo['id'], '.pdf') && read_upload('wf', $pdfInfo['id']) === $pdf, 'PDF stored and read back');
ok((new finfo(FILEINFO_MIME_TYPE))->buffer($pdf) === 'application/pdf', 'synthetic PDF is a real PDF');
throws(fn() => store_bytes('wf', '%PDF-' . str_repeat('x', 10)), 'fake PDF rejected');
ok(count(list_uploads('wf')) === 2 && count(list_uploads('wf', true)) === 1, 'uploads listed; images-only filter');
file_put_contents($tmp, '<?php echo 1; ?>');
throws(fn() => store_upload('wf', $tmp), 'non-image rejected');
throws(fn() => upload_file('wf', '../api.php'), 'file traversal rejected');

// Sanitizer
$clean = sanitize_html('<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.org">ok</a><img src="https://evil" onerror="x"><img data-image-id="' . $img['id'] . '" src="x"></p><iframe src="x"></iframe>');
ok(!str_contains($clean, 'script') && !str_contains($clean, 'onclick') && !str_contains($clean, 'javascript') && !str_contains($clean, 'iframe') && !str_contains($clean, 'onerror'), 'sanitizer strips dangerous markup');
ok(str_contains($clean, 'href="https://example.org"') && str_contains($clean, 'data-image-id="' . $img['id'] . '"') && !str_contains($clean, 'evil'), 'sanitizer keeps safe links and stored images only');
ok(image_ids_in($clean) === [$img['id']], 'image ids extracted');

// Domain rules
$doc = new_doc();
ok(count($doc['types']) === 13, 'thirteen built-in types seeded');
ok(array_column($doc['docLabels'], 'label') === ['Lab', 'Consultation Note', 'PCP Note', 'Progress Note', 'Imaging', 'Discharge Summary', 'Insurance Letter', 'Other'], 'document labels seeded');
ok(in_array('Lab work', $doc['types'][1]['fields'][3]['options'], true), 'visit kind includes Lab work');
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'condition', 'value' => ['id' => 'c1', 'name' => 'Test condition']]]);
$type = ['id' => 'custom-1', 'name' => 'Lab results', 'icon' => '', 'color' => '#123456', 'fields' => [
    ['id' => 'f-date', 'label' => 'Drawn', 'kind' => 'date'], ['id' => 'f-val', 'label' => 'Value', 'kind' => 'number'], ['id' => 'f-note', 'label' => 'Note', 'kind' => 'text']]];
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'type', 'value' => $type]]);
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'entry', 'value' => ['id' => 'e1', 'conditionId' => 'c1', 'typeId' => 'custom-1', 'title' => 'A1C', 'values' => ['f-date' => '2026-11-01', 'f-val' => '6.8', 'f-note' => 'fasting']]]]);
ok($doc['entries'][0]['values']['f-val'] === 6.8, 'numbers stored as numbers');
$type['fields'] = [$type['fields'][1], $type['fields'][0]];   // reorder + drop f-note
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'type', 'value' => $type]]);
$t = $doc['types'][find_index($doc['types'], 'custom-1')];
ok(array_column($t['fields'], 'id') === ['f-val', 'f-date'], 'fields reordered');
ok(array_column($t['retiredFields'], 'id') === ['f-note'], 'removed field kept in retiredFields');
ok($doc['entries'][0]['values']['f-note'] === 'fasting', 'value of removed field kept');
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'entry', 'value' => ['id' => 'e1', 'conditionId' => 'c1', 'typeId' => 'custom-1', 'title' => 'A1C', 'values' => ['f-val' => 7]]]]);
ok($doc['entries'][0]['values']['f-note'] === 'fasting', 'editing an entry keeps retired values');
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'type', 'value' => ['archived' => true] + $type]]);
ok(count($doc['entries']) === 1, 'archiving a type keeps entries');
throws(fn() => apply_ops($doc, [['op' => 'delete', 'kind' => 'type', 'id' => 'custom-1']]), 'types cannot be deleted');
throws(fn() => apply_ops($doc, [['op' => 'delete', 'kind' => 'condition', 'id' => 'c1']]), 'non-empty condition cannot be deleted');
throws(fn() => apply_ops($doc, [['op' => 'put', 'kind' => 'entry', 'value' => ['id' => 'e2', 'conditionId' => 'c1', 'typeId' => 'visit', 'title' => 'No date']]]), 'required field enforced');
throws(fn() => apply_ops($doc, [['op' => 'put', 'kind' => 'entry', 'value' => ['id' => 'e2', 'conditionId' => 'nope', 'typeId' => 'visit', 'title' => 'x', 'values' => ['date' => '2026-01-01']]]]), 'unknown condition rejected');
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'tag', 'value' => ['id' => 't1', 'label' => 'Paperwork']], ['op' => 'put', 'kind' => 'entry', 'value' => ['id' => 'e1', 'conditionId' => 'c1', 'typeId' => 'custom-1', 'title' => 'A1C', 'tagIds' => ['t1', 'ghost']]]]);
ok($doc['entries'][0]['tagIds'] === ['t1'], 'tag created in same batch; unknown tag ids dropped');
$doc = apply_ops($doc, [['op' => 'delete', 'kind' => 'tag', 'id' => 't1']]);
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'docLabel', 'value' => ['id' => 'lbl-path', 'label' => 'Pathology report']], ['op' => 'put', 'kind' => 'entry', 'value' => ['id' => 'e1', 'conditionId' => 'c1', 'typeId' => 'custom-1', 'title' => 'A1C', 'attachments' => [['id' => $pdfInfo['id'], 'name' => 'path.pdf', 'label' => 'lbl-path'], ['id' => $img['id'], 'label' => 'ghost'], ['id' => '../x.pdf']]]]]);
$att = $doc['entries'][0]['attachments'];
ok(count($att) === 2 && $att[0]['label'] === 'lbl-path' && $att[0]['kind'] === 'pdf' && $att[1]['label'] === 'other' && $att[1]['mime'] === 'image/png', 'attachments cleaned; custom label kept; unknown label -> Other');
throws(fn() => apply_ops($doc, [['op' => 'delete', 'kind' => 'docLabel', 'id' => 'lbl-path']]), 'doc labels cannot be deleted');
ok($doc['entries'][0]['tagIds'] === [] && count($doc['entries']) === 1, 'deleting a tag keeps the entry');
$typeIcon = $doc['types'][find_index($doc['types'], 'doctor')];
$doc = apply_ops($doc, [['op' => 'put', 'kind' => 'type', 'value' => ['icon' => '<svg>', 'color' => 'red'] + $typeIcon]]);
$typeIcon = $doc['types'][find_index($doc['types'], 'doctor')];
ok($typeIcon['icon'] === '' && $typeIcon['color'] === '#5c6674' && $typeIcon['builtin'] === true, 'bad icon/color normalized, builtin preserved');

// Demo seed passes the same validation as user edits
$demo = demo_doc('2026-11-17');
$rebuilt = new_doc();
$ops = [];
foreach ($demo['tags'] as $v) $ops[] = ['op' => 'put', 'kind' => 'tag', 'value' => $v];
foreach ($demo['conditions'] as $v) $ops[] = ['op' => 'put', 'kind' => 'condition', 'value' => $v];
foreach ($demo['entries'] as $v) $ops[] = ['op' => 'put', 'kind' => 'entry', 'value' => $v];
$rebuilt = apply_ops($rebuilt, $ops);
ok(count($rebuilt['entries']) === count($demo['entries']), 'every demo entry validates');
ok(count(array_unique(array_column($demo['entries'], 'typeId'))) === 13, 'demo covers all 13 types');
$demoAtt = array_merge(...array_map(fn($r) => $r['attachments'] ?? [], array_merge($demo['entries'], $demo['conditions'])));
ok(count(array_filter($demoAtt, fn($a) => $a['kind'] === 'pdf')) === 3 && count(array_filter($demoAtt, fn($a) => $a['kind'] === 'image')) === 2, 'demo has synthetic PDFs and images');
ok(count($rebuilt['entries'][find_index($rebuilt['entries'], 'visit-lab')]['attachments']) === 1, 'demo attachments validate');
$ids = array_column($demo['entries'], 'id');
$linkCount = 0;
foreach ($demo['types'] as $t) foreach ($t['fields'] as $f) if ($f['kind'] === 'link') {
    $used = false;
    foreach ($demo['entries'] as $e) if ($e['typeId'] === $t['id'] && ($e['values'][$f['id']] ?? '') !== '') { $used = true; ok(in_array($e['values'][$f['id']], $ids, true), "demo link {$t['id']}.{$f['id']} resolves"); }
    ok($used, "demo exercises link field {$t['id']}.{$f['id']}"); $linkCount++;
}
foreach ($demo['conditions'] as $c) ok(str_contains($c['name'], '(sample)'), 'demo condition labelled sample');
foreach ($demo['entries'] as $e) if ($e['typeId'] === 'doctor') ok(str_contains($e['title'], '(sample)'), 'demo doctor labelled sample');

// ---- v2: free-text selects, "Other care disruptions", and the v1 -> v2 migration (G29-G31)
$seedTypes = seed_types();
$byId = [];
foreach ($seedTypes as $t) $byId[$t['id']] = $t;
ok($byId['disruption']['name'] === 'Other care disruptions' && $byId['disruption']['singular'] === 'Other care disruption', 'seed renames the disruption type');
$statusTypes = [];
foreach ($seedTypes as $t) foreach ($t['fields'] as $f) if ($f['label'] === 'Status') { ok($f['kind'] === 'select' && $f['allowCustom'] === true, "{$t['id']} status allows free text"); $statusTypes[] = $t['id']; }
ok($statusTypes === ['visit', 'letter', 'appeal', 'supply', 'treatment', 'hh_auth'], 'all 6 built-in status fields found');
ok($byId['doctor']['fields'][array_search('role', array_column($byId['doctor']['fields'], 'id'), true)]['allowCustom'] === false, 'non-status selects stay preset-only');
ok(new_doc()['version'] === DOC_VERSION && DOC_VERSION === 3, 'new documents are version 3');

/** Build what a version-1 document looked like: old name, no allowCustom flags. */
function without_home_health(array $doc): array {
    $doc['types'] = array_values(array_filter($doc['types'], function ($t) { return !in_array($t['id'], HOME_HEALTH_TYPE_IDS, true); }));
    $doc['entries'] = array_values(array_filter($doc['entries'], function ($e) { return !in_array($e['typeId'], HOME_HEALTH_TYPE_IDS, true); }));
    return $doc;
}
function as_v1(array $doc): array {
    $doc = without_home_health($doc);
    $doc['version'] = 1;
    foreach ($doc['types'] as &$t) {
        if ($t['id'] === 'disruption') { $t['name'] = 'Care disruptions'; $t['singular'] = 'Care disruption'; }
        foreach ($t['fields'] as &$f) unset($f['allowCustom']);
        unset($f);
    }
    unset($t);
    return $doc;
}
$v1 = as_v1(demo_doc('2026-11-17'));
$v1['types'][] = ['id' => 'custom-sel', 'name' => 'Custom', 'singular' => 'Custom', 'icon' => '', 'color' => '#336699', 'titleLabel' => 'Title', 'primaryDateField' => '', 'fields' => [['id' => 'status', 'label' => 'Status', 'kind' => 'select', 'options' => ['A'], 'required' => false, 'target' => '']], 'retiredFields' => [], 'builtin' => false, 'archived' => false, 'sortOrder' => 20];
$v1['entries'][0]['values']['status'] = 'Some typed status';
$m = migrate_doc($v1);
$mt = [];
foreach ($m['types'] as $t) $mt[$t['id']] = $t;
ok($m['version'] === DOC_VERSION, 'migration sets the current version');
ok($mt['disruption']['name'] === 'Other care disruptions' && $mt['disruption']['singular'] === 'Other care disruption', 'migration renames a default-named disruption type');
foreach ($statusTypes as $id) { $f = $mt[$id]['fields'][array_search('status', array_column($mt[$id]['fields'], 'id'), true)]; ok(($f['allowCustom'] ?? null) === true, "migration enables free text on $id status"); }
ok(!array_key_exists('allowCustom', $mt['doctor']['fields'][array_search('role', array_column($mt['doctor']['fields'], 'id'), true)]), 'migration leaves non-status selects alone');
ok(json_encode($mt['custom-sel']) === json_encode(end($v1['types'])), 'migration leaves custom types alone');
$enc = function ($x): string { return json_encode($x, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT); };
foreach (array_keys($v1) as $k) if ($k !== 'types' && $k !== 'version') ok($enc($m[$k]) === $enc($v1[$k]), "migration leaves '$k' byte-identical");
ok(array_column($m['types'], 'id') === array_merge(array_column($v1['types'], 'id'), HOME_HEALTH_TYPE_IDS), 'migration keeps every type in order and appends the home health types');
ok($enc(migrate_doc($m)) === $enc($m) && $enc(normalize_doc($m)) === $enc(normalize_doc(migrate_doc($m))), 'migration is idempotent');
// A user's own rename and an explicit allowCustom=false are kept.
$renamed = $v1;
foreach ($renamed['types'] as &$t) {
    if ($t['id'] === 'disruption') { $t['name'] = 'Equipment problems'; $t['singular'] = 'Equipment problem'; }
    if ($t['id'] === 'visit') foreach ($t['fields'] as &$f) if ($f['id'] === 'status') $f['allowCustom'] = false;
    unset($f);
}
unset($t);
$rm = migrate_doc($renamed);
$rt = [];
foreach ($rm['types'] as $t) $rt[$t['id']] = $t;
ok($rt['disruption']['name'] === 'Equipment problems' && $rt['disruption']['singular'] === 'Equipment problem', 'migration keeps a user-renamed disruption type');
ok($rt['visit']['fields'][array_search('status', array_column($rt['visit']['fields'], 'id'), true)]['allowCustom'] === false, 'migration keeps an explicit allowCustom=false');
// Stored document: migrated once, under the lock, after a backup of the v1 file.
write_doc('mig', $v1);
$before = (string) file_get_contents(doc_path('mig'));
$backups = count(list_backups('mig'));
$stored = migrate_stored_doc('mig');
ok($stored['version'] === DOC_VERSION && read_doc('mig')['version'] === DOC_VERSION, 'stored v1 document migrated on load');
ok(count(list_backups('mig')) === $backups + 1, 'migration backs up first');
$latest = list_backups('mig'); sort($latest);
ok(file_get_contents(end($latest)) === $before, 'backup holds the exact v1 bytes');
$after = read_doc('mig');
foreach (['conditions', 'entries', 'tags', 'docLabels'] as $k) ok($enc($after[$k]) === $enc($v1[$k]), "stored '$k' unchanged by migration");
migrate_stored_doc('mig');
ok(count(list_backups('mig')) === $backups + 1, 'already-migrated document is not rewritten');
ok(migrate_stored_doc('nobody') === null, 'missing account document stays missing');
// ---- v3: home health built-ins (t14u). A v2 account gets the three types appended; nothing else moves.
$v2 = without_home_health(demo_doc('2026-11-17'));
$v2['version'] = 2;
foreach ($v2['types'] as &$t) {
    if ($t['id'] === 'disruption') { $t['name'] = 'Care disruptions'; $t['singular'] = 'Care disruption'; } // a user's own (re)naming after v2
    if ($t['id'] === 'visit') foreach ($t['fields'] as &$f) if ($f['id'] === 'status') $f['allowCustom'] = false;
    unset($f);
}
unset($t);
$v2['types'][] = ['id' => 'custom-hh', 'name' => 'Nurse notes', 'singular' => 'Nurse note', 'icon' => '', 'color' => '#336699', 'titleLabel' => 'Title', 'primaryDateField' => '', 'fields' => [], 'builtin' => false, 'archived' => false, 'sortOrder' => 40, 'retiredFields' => []];
$m3 = migrate_doc($v2);
$m3t = [];
foreach ($m3['types'] as $t) $m3t[$t['id']] = $t;
ok($m3['version'] === 3, 'v2 document migrates to v3');
ok(array_column($m3['types'], 'id') === array_merge(array_column($v2['types'], 'id'), HOME_HEALTH_TYPE_IDS), 'v3 appends hh_auth, hh_visit, hh_event after the existing types');
ok($enc(array_slice($m3['types'], 0, count($v2['types']))) === $enc($v2['types']), 'v3 leaves every existing type byte-identical (no re-run of the v2 rename)');
ok($m3t['hh_auth']['sortOrder'] === 41 && $m3t['hh_visit']['sortOrder'] === 42 && $m3t['hh_event']['sortOrder'] === 43, 'new types sort after the account\'s own types');
ok($m3t['hh_auth']['builtin'] === true && $m3t['hh_visit']['fields'][4]['allowCustom'] === true, 'new types arrive as built-ins with free-text outcome');
foreach (array_keys($v2) as $k) if ($k !== 'types' && $k !== 'version') ok($enc($m3[$k]) === $enc($v2[$k]), "v3 leaves '$k' byte-identical");
ok($enc(migrate_doc($m3)) === $enc($m3), 'v3 migration is idempotent');
$clash = $v2;
$clash['types'][] = ['id' => 'hh_visit', 'name' => 'My own visits', 'singular' => 'Mine', 'icon' => '', 'color' => '#123456', 'titleLabel' => 'T', 'primaryDateField' => '', 'fields' => [], 'builtin' => false, 'archived' => true, 'sortOrder' => 7, 'retiredFields' => []];
$mc = migrate_doc($clash);
ok(count(array_keys(array_column($mc['types'], 'id'), 'hh_visit')) === 1 && $enc(array_values(array_filter($mc['types'], function ($t) { return $t['id'] === 'hh_visit'; }))[0]) === $enc(end($clash['types'])), 'an existing type with a home health id is kept as is, not duplicated');
write_doc('mig3', $v2);
$b3 = count(list_backups('mig3'));
$s3 = migrate_stored_doc('mig3');
ok($s3['version'] === 3 && count(list_backups('mig3')) === $b3 + 1, 'stored v2 document backed up, then migrated to v3');
ok($enc(read_doc('mig3')['entries']) === $enc($v2['entries']), 'stored v2 entries unchanged by the v3 migration');
// Free-text values are stored as-is; the flag survives type edits.
$fx = apply_ops(new_doc(), [['op' => 'put', 'kind' => 'condition', 'value' => ['id' => 'c1', 'name' => 'Heel']], ['op' => 'put', 'kind' => 'entry', 'value' => ['id' => 'e1', 'conditionId' => 'c1', 'typeId' => 'visit', 'title' => 'Wound check', 'values' => ['date' => '2026-11-20', 'status' => 'Waiting on fax']]]]);
ok($fx['entries'][0]['values']['status'] === 'Waiting on fax', 'free-text status saved verbatim');
$ct = clean_type(['id' => 'ct', 'name' => 'Labs', 'fields' => [['id' => 'res', 'label' => 'Result', 'kind' => 'select', 'options' => ['Low', 'High'], 'allowCustom' => true], ['id' => 'n', 'label' => 'Note', 'kind' => 'text', 'allowCustom' => true]]], null);
ok($ct['fields'][0]['allowCustom'] === true && !array_key_exists('allowCustom', $ct['fields'][1]), 'allowCustom kept on selects only');

// t18u: @mention chips keep only kind, id, and label; anything else is plain text.
$fid = str_repeat('a', 64) . '.pdf';
$m = sanitize_html('<p>See <span data-mention="file" data-ref="' . $fid . '" onclick="x()" style="color:red" class="evil">@MRI report</span> and <span data-mention="entry" data-ref="e-1">@Appeal</span></p>');
ok($m === '<p>See <span class="mention" data-mention="file" data-ref="' . $fid . '" contenteditable="false">@MRI report</span> and <span class="mention" data-mention="entry" data-ref="e-1" contenteditable="false">@Appeal</span></p>', 'mention chips kept as id references, handlers and styles stripped');
ok(sanitize_html('<p><span data-mention="file" data-ref="../../etc/passwd">@x</span><span data-mention="script" data-ref="a">@y</span><span style="x">z</span></p>') === '<p>@x@yz</p>', 'invalid mention kinds or ids become plain text');
ok(strpos(sanitize_html('<p><span data-mention="entry" data-ref="e1"><b onclick="x">@<img src=x onerror=y>Hi</b></span></p>'), 'onerror') === false, 'markup inside a chip is reduced to its text');
// t18u: the built-in Disruptions filter record.
$fd = apply_ops($fx, [['op' => 'put', 'kind' => 'filter', 'value' => ['id' => 'disruptions', 'include' => ['e1', 'e1', 'bad id!'], 'exclude' => ['e1', 'e2']]]]);
ok($fd['filters'][0]['include'] === ['e1'] && $fd['filters'][0]['exclude'] === ['e2'], 'Disruptions filter: unique valid ids, an id is never both in and out');
throws(function () use ($fx) { apply_ops($fx, [['op' => 'put', 'kind' => 'filter', 'value' => ['id' => 'favorites', 'include' => []]]]); }, 'only the built-in Disruptions filter can be saved');
ok(new_doc()['filters'] === [] && normalize_doc(['version' => 3])['filters'] === [], 'documents start with no filter edits');

// t27u: Saved views are filter records with view-… ids; deletable; tag deletes strip them.
$fv = apply_ops($fx, [['op' => 'put', 'kind' => 'tag', 'value' => ['id' => 'tv', 'label' => 'Blocked']], ['op' => 'put', 'kind' => 'filter', 'value' => ['id' => 'view-blocked', 'name' => ' <b>Blocked</b> ', 'tagIds' => ['tv', 'bad id!'], 'typeIds' => ['visit'], 'disruptions' => 1, 'range' => 'later', 'conditionId' => '../x', 'include' => ['e1']]]]);
$vw = $fv['filters'][find_index($fv['filters'], 'view-blocked')];
ok($vw['kind'] === 'view' && $vw['name'] === '<b>Blocked</b>' && $vw['tagIds'] === ['tv'] && $vw['typeIds'] === ['visit'] && $vw['disruptions'] === true && $vw['range'] === 'all' && $vw['conditionId'] === '' && !isset($vw['include']), 'saved view: name, ids, and options cleaned');
throws(function () use ($fv) { apply_ops($fv, [['op' => 'put', 'kind' => 'filter', 'value' => ['id' => 'view-x', 'name' => '']]]); }, 'saved view needs a name');
$fv2 = apply_ops($fv, [['op' => 'delete', 'kind' => 'tag', 'id' => 'tv']]);
ok($fv2['filters'][find_index($fv2['filters'], 'view-blocked')]['tagIds'] === [], 'deleting a tag strips it from saved views');
$fv3 = apply_ops($fv2, [['op' => 'delete', 'kind' => 'filter', 'id' => 'view-blocked']]);
ok(find_index($fv3['filters'], 'view-blocked') === null, 'a saved view can be deleted');
throws(function () use ($fd) { apply_ops($fd, [['op' => 'delete', 'kind' => 'filter', 'id' => 'disruptions']]); }, 'the built-in Disruptions filter cannot be deleted');
// t30u: optional condition description; older records without one stay valid.
$cd = apply_ops($fx, [['op' => 'put', 'kind' => 'condition', 'value' => ['id' => 'c-desc', 'name' => 'Left Lateral Heel (ALM)', 'description' => "  Acral lentiginous melanoma\u{0000}, rare  "]]]);
$cc = $cd['conditions'][find_index($cd['conditions'], 'c-desc')];
ok($cc['name'] === 'Left Lateral Heel (ALM)' && strpos($cc['description'], 'Acral lentiginous melanoma') === 0 && strpos($cc['description'], "\0") === false, 'condition description saved and cleaned');
throws(function () use ($fx) { apply_ops($fx, [['op' => 'put', 'kind' => 'condition', 'value' => ['id' => 'c-long', 'name' => 'X', 'description' => str_repeat('a', 1001)]]]); }, 'condition description is capped at 1000 characters');
$co = apply_ops($fx, [['op' => 'put', 'kind' => 'condition', 'value' => ['id' => 'c-old', 'name' => 'Old']]]);
ok($co['conditions'][find_index($co['conditions'], 'c-old')]['description'] === '', 'a condition saved without a description gets an empty one');

exec('rm -rf ' . escapeshellarg($dir));
echo "PASS: $checks storage, sanitizer, and domain checks ($linkCount link fields exercised by demo seed).\n";
