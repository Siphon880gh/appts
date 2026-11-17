<?php
declare(strict_types=1);
// Storage, sanitizer, and server-side domain rules. Run: php tests/storage.test.php
$dir = sys_get_temp_dir() . '/appts-storage-' . bin2hex(random_bytes(4));
putenv("APPTS_STORAGE_DIR=$dir");
require __DIR__ . '/../includes/domain.php';
require __DIR__ . '/../includes/demo-seed.php';
require __DIR__ . '/../includes/uploads.php';
$checks = 0;
function ok(bool $cond, string $what): void { global $checks; $checks++; if (!$cond) { fwrite(STDERR, "FAIL: $what\n"); exit(1); } }
function throws(callable $fn, string $what): void { try { $fn(); } catch (InvalidArgumentException) { ok(true, $what); return; } ok(false, $what); }

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
$img = store_image('wf', $tmp);
ok($img['id'] === hash('sha256', $png) . '.png', 'image is content addressed');
ok(str_starts_with((string) file_get_contents(image_file('wf', $img['id'])), STORAGE_GUARD), 'image file guarded');
ok(read_image('wf', $img['id']) === $png, 'image round trip');
ok(read_image('demo', $img['id']) === null, 'image isolated per account');
file_put_contents($tmp, '<?php echo 1; ?>');
throws(fn() => store_image('wf', $tmp), 'non-image rejected');
throws(fn() => image_file('wf', '../api.php'), 'image traversal rejected');

// Sanitizer
$clean = sanitize_html('<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.org">ok</a><img src="https://evil" onerror="x"><img data-image-id="' . $img['id'] . '" src="x"></p><iframe src="x"></iframe>');
ok(!str_contains($clean, 'script') && !str_contains($clean, 'onclick') && !str_contains($clean, 'javascript') && !str_contains($clean, 'iframe') && !str_contains($clean, 'onerror'), 'sanitizer strips dangerous markup');
ok(str_contains($clean, 'href="https://example.org"') && str_contains($clean, 'data-image-id="' . $img['id'] . '"') && !str_contains($clean, 'evil'), 'sanitizer keeps safe links and stored images only');
ok(image_ids_in($clean) === [$img['id']], 'image ids extracted');

// Domain rules
$doc = new_doc();
ok(count($doc['types']) === 10, 'ten built-in types seeded');
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
ok(count(array_unique(array_column($demo['entries'], 'typeId'))) === 10, 'demo covers all 10 types');
$ids = array_column($demo['entries'], 'id');
$linkCount = 0;
foreach ($demo['types'] as $t) foreach ($t['fields'] as $f) if ($f['kind'] === 'link') {
    $used = false;
    foreach ($demo['entries'] as $e) if ($e['typeId'] === $t['id'] && ($e['values'][$f['id']] ?? '') !== '') { $used = true; ok(in_array($e['values'][$f['id']], $ids, true), "demo link {$t['id']}.{$f['id']} resolves"); }
    ok($used, "demo exercises link field {$t['id']}.{$f['id']}"); $linkCount++;
}
foreach ($demo['conditions'] as $c) ok(str_contains($c['name'], '(sample)'), 'demo condition labelled sample');
foreach ($demo['entries'] as $e) if ($e['typeId'] === 'doctor') ok(str_contains($e['title'], '(sample)'), 'demo doctor labelled sample');

exec('rm -rf ' . escapeshellarg($dir));
echo "PASS: $checks storage, sanitizer, and domain checks ($linkCount link fields exercised by demo seed).\n";
