<?php
declare(strict_types=1);
// Tests for tools/intake.php (the CLI the log-health-update skill calls). Runs the real CLI as a
// subprocess against a temporary storage root with the demo account and a temporary account.
// Never uses wf, and checks that the real storage/ is not touched. Run: php tests/intake.test.php
require __DIR__ . '/../includes/demo-seed.php';

$checks = 0;
function ok(bool $cond, string $what): void { global $checks; $checks++; if (!$cond) { echo "FAIL: $what\n"; exit(1); } }
$root = dirname(__DIR__);
$php = getenv('APPTS_PHP') ?: PHP_BINARY;
$dir = sys_get_temp_dir() . '/appts-intake-' . bin2hex(random_bytes(4));
mkdir($dir, 0700, true);
$realWf = $root . '/storage/data/wf.json.php';
$realWfHash = is_file($realWf) ? hash_file('sha256', $realWf) : null;
$realDemo = $root . '/storage/data/demo.json.php';
$realDemoHash = is_file($realDemo) ? hash_file('sha256', $realDemo) : null;

/** Run the CLI with the temp storage root; returns [exit code, stdout, stderr]. */
function cli(array $args, string $stdin = ''): array {
    global $php, $root, $dir;
    $cmd = array_merge([$php, $root . '/tools/intake.php'], $args);
    $env = ['APPTS_STORAGE_DIR' => $dir, 'PATH' => getenv('PATH') ?: '/usr/bin:/bin'];
    $p = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $root, $env);
    fwrite($pipes[0], $stdin); fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    return [proc_close($p), (string) $out, (string) $err];
}
function plan(array $plan): string { global $dir; $f = $dir . '/plan-' . bin2hex(random_bytes(3)) . '.json'; file_put_contents($f, json_encode($plan)); return $f; }
putenv("APPTS_STORAGE_DIR=$dir");
function doc(string $a): array { return read_doc($a); }
function by_title(array $doc, string $title): ?array { foreach ($doc['entries'] as $e) if ($e['title'] === $title) return $e; return null; }
$enc = function ($x): string { return json_encode($x, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); };

$pdf = synthetic_pdf('Intake test lab', ['A1C 7.1 (synthetic)']);
$png = synthetic_png('Intake test wound photo', [120, 80, 70]);
file_put_contents("$dir/lab.pdf", $pdf);
file_put_contents("$dir/photo.png", $png);
file_put_contents("$dir/notes.txt", 'not a document');

// ---- listing: accounts, conditions, types, entries (G36)
[$code, $out] = cli(['accounts']);
$accounts = json_decode($out, true);
ok($code === 0 && array_column($accounts, 'username') === ['demo', 'wf'], 'accounts lists demo and wf from includes/accounts.php');
ok(strpos($out, '$2y$') === false && strpos($out, 'hash') === false, 'accounts output has no password hashes');
[$code, , $err] = cli(['conditions', 'nobody']);
ok($code === 1 && strpos($err, 'Unknown account') !== false, 'unknown account refused');
[$code, $out] = cli(['conditions', 'demo']);
$conds = json_decode($out, true);
ok($code === 0 && array_column($conds, 'id') === ['cond-knee', 'cond-skin', 'cond-diabetes'], 'demo conditions listed (demo created on first use with its sample data)');
[$code, $out] = cli(['types', 'demo']);
$types = json_decode($out, true);
ok(count($types['types']) === 13 && in_array('Lab', $types['documentLabels'], true) && in_array('Paperwork', $types['tags'], true), 'types lists every entry type with fields, plus tags and document labels');
$hh = array_values(array_filter($types['types'], function ($t) { return $t['id'] === 'hh_visit'; }))[0];
ok($hh['fields'][4]['allowCustom'] === true && in_array('Missed: patient at clinic', $hh['fields'][4]['options'], true), 'types shows select options and allowCustom');
[$code, $out] = cli(['entries', 'demo', '--condition=cond-skin', '--type=hh_auth']);
ok(array_column(json_decode($out, true), 'id') === ['hh-auth-1', 'hh-auth-2'], 'entries filters by condition and type');
[$code, $out] = cli(['entries', 'demo', '--query=case manager']);
ok(in_array('hh-ev-case-mgr', array_column(json_decode($out, true), 'id'), true), 'entries searches titles, values, and notes');

// ---- dry run writes nothing (G37)
$before = doc('demo');
$beforeRaw = file_get_contents(doc_path('demo'));
$backups0 = count(list_backups('demo'));
$uploads0 = count(glob("$dir/uploads/demo/*") ?: []);
$p1 = plan([
    'condition' => 'cond-skin',
    'create' => [
        ['ref' => 'auth3', 'type' => 'Home health authorization', 'title' => 'Wound care nursing: 6 more visits', 'values' => ['agency' => 'Sample Home Health Agency', 'Authorized visits' => '6', 'start' => '2026-12-07', 'status' => 'pending approval', 'previous' => 'hh-auth-2'], 'tags' => ['paperwork', 'Intake test'], 'notes' => "Case manager said the plan has it.\nAnswer by Friday.\n\n<script>alert(1)</script>", 'attachments' => [['path' => "$dir/lab.pdf", 'label' => 'Authorization fax']]],
        ['type' => 'hh_event', 'title' => 'Asked agency to request more visits', 'values' => ['date' => '2026-11-17', 'event_kind' => 'Re-authorization requested', 'authorization' => '@auth3', 'contact' => 'Sam Demo']],
        ['type' => 'hh_visit', 'title' => 'Dressing change (intake)', 'values' => ['date' => '2026-11-18', 'authorization' => 'hh-auth-2', 'outcome' => 'Nurse had a flat tire'], 'attachments' => [['path' => "$dir/photo.png", 'label' => 'progress note']]],
    ],
    'update' => [['id' => 'hh-v13', 'notes' => 'Nurse confirmed by phone.', 'tags' => ['Intake test']], ['id' => 'visit-knee-follow', 'values' => ['location' => 'Example Bone & Joint Clinic', 'follow_up' => '2026-12-20']]],
    'conditionUpdate' => ['notes' => 'Home health paperwork faxed again.', 'attachments' => [['path' => "$dir/lab.pdf", 'label' => 'Lab']]],
]);
[$code, $out] = cli(['apply', 'demo', $p1, '--dry-run']);
ok($code === 0 && strpos($out, 'DRY RUN') === 0, 'dry run succeeds');
ok(strpos($out, 'update[2] Visit "Ortho follow-up" is in another condition') !== false, 'updating an entry outside the chosen condition is flagged');
ok(strpos($out, '+ new Home health authorization: "Wound care nursing: 6 more visits"') !== false && strpos($out, 'Authorization: Wound care nursing: 6 more visits') !== false && strpos($out, '~ update Home health visit') !== false, 'preview lists new entries, cross-links by title, and updates');
ok(strpos($out, '+ new tag "Intake test"') !== false && strpos($out, '+ new document label "Authorization fax"') !== false && strpos($out, '[Progress Note]') !== false, 'preview shows new tags/labels and reuses existing ones (any case)');
ok(file_get_contents(doc_path('demo')) === $beforeRaw && count(list_backups('demo')) === $backups0 && count(glob("$dir/uploads/demo/*") ?: []) === $uploads0, 'dry run writes no document, backup, or upload');

// ---- apply (G37, G38)
[$code, $out, $err] = cli(['apply', 'demo', $p1]);
ok($code === 0 && strpos($out, 'Saved: 3 new, 2 updated') !== false, "apply saves 3 new and 2 updated entries ($err)");
$after = doc('demo');
ok(count(list_backups('demo')) === $backups0 + 1, 'one write, backed up first');
$bfiles = glob(storage_root() . '/backups/demo/*.json.php') ?: [];
sort($bfiles);
ok(file_get_contents((string) end($bfiles)) === $beforeRaw, 'the backup holds the exact previous file');
ok(count(glob("$dir/uploads/demo/*") ?: []) === $uploads0 + 2, 'two new files copied into uploads');
$auth3 = by_title($after, 'Wound care nursing: 6 more visits');
$ev = by_title($after, 'Asked agency to request more visits');
$visit = by_title($after, 'Dressing change (intake)');
ok($auth3 && $auth3['values']['visits_authorized'] === 6 && $auth3['values']['status'] === 'Pending approval' && $auth3['values']['previous'] === 'hh-auth-2', 'values are typed and select presets matched case-insensitively');
ok($ev['values']['authorization'] === $auth3['id'], '@ref cross-link resolves to the new entry');
ok($visit['values']['outcome'] === 'Nurse had a flat tire', 'free text kept on an allowCustom select');
$tagIds = array_column($after['tags'], 'id', 'label');
ok(isset($tagIds['Intake test']) && $auth3['tagIds'] === ['tag-paperwork', $tagIds['Intake test']], 'existing tag reused, new tag created on the fly');
ok(strpos($auth3['notes']['html'], '<p>Case manager said the plan has it.<br>Answer by Friday.</p>') === 0 && strpos($auth3['notes']['html'], '<script') === false, 'notes become safe paragraphs');
$a = $auth3['attachments'][0];
$labels = array_column($after['docLabels'], 'id', 'label');
ok($a['id'] === hash('sha256', $pdf) . '.pdf' && $a['kind'] === 'pdf' && $a['name'] === 'lab.pdf' && $a['label'] === $labels['Authorization fax'], 'PDF attached with a new, reusable document label');
ok(read_upload('demo', $a['id']) === $pdf && strpos((string) file_get_contents(upload_file('demo', $a['id'])), STORAGE_GUARD) === 0, 'PDF copied into storage/uploads, guarded, byte-identical');
ok($visit['attachments'][0]['label'] === 'progress' && read_upload('demo', $visit['attachments'][0]['id']) === $png, 'image attached with an existing label');
$v13 = null; foreach ($after['entries'] as $e) if ($e['id'] === 'hh-v13') $v13 = $e;
$old13 = null; foreach ($before['entries'] as $e) if ($e['id'] === 'hh-v13') $old13 = $e;
ok($v13['values'] === $old13['values'] && $v13['notes']['html'] === $old13['notes']['html'] . '<p>Nurse confirmed by phone.</p>' && in_array($tagIds['Intake test'], $v13['tagIds'], true) && array_slice($v13['tagIds'], 0, count($old13['tagIds'])) === $old13['tagIds'], 'update appends notes and adds a tag, values untouched');
$kf = null; foreach ($after['entries'] as $e) if ($e['id'] === 'visit-knee-follow') $kf = $e;
ok($kf['values']['follow_up'] === '2026-12-20' && $kf['values']['location'] === 'Example Bone & Joint Clinic', 'update fills an empty field; an equal value is a no-op');
$skin = null; foreach ($after['conditions'] as $c) if ($c['id'] === 'cond-skin') $skin = $c;
ok(strpos($skin['notes']['html'], 'Home health paperwork faxed again.') !== false && end($skin['attachments'])['label'] === 'lab', 'condition notes appended and a document added');
$untouched = 0;
$changedIds = ['hh-v13', 'visit-knee-follow'];
foreach ($before['entries'] as $e) if (!in_array($e['id'], $changedIds, true)) { $n = null; foreach ($after['entries'] as $x) if ($x['id'] === $e['id']) $n = $x; if ($enc($n) === $enc($e)) $untouched++; }
ok($untouched === count($before['entries']) - 2, 'every other existing entry is byte-identical');
ok(count($after['entries']) === count($before['entries']) + 3 && $enc($after['types']) === $enc($before['types']), 'nothing deleted; types unchanged');
ok(array_slice(array_column($after['entries'], 'id'), 0, count($before['entries'])) === array_column($before['entries'], 'id'), 'existing entries keep their order; new ones are appended');

// ---- never overwrite, never delete; clear errors (G38)
$raw = file_get_contents(doc_path('demo'));
$bk = count(list_backups('demo'));
$refuse = function (array $plan, string $needle, string $what) use ($raw, $bk) {
    [$code, , $err] = cli(['apply', 'demo', plan($plan)]);
    ok($code === 1 && strpos($err, $needle) !== false && file_get_contents(doc_path('demo')) === $raw && count(list_backups('demo')) === $bk, "$what (\"$needle\"), nothing written");
};
$refuse(['condition' => 'cond-skin', 'update' => [['id' => 'hh-auth-2', 'values' => ['status' => 'Used up']]]], 'never overwrites', 'changing a filled-in value is refused');
$refuse(['condition' => 'cond-skin', 'update' => [['id' => 'hh-auth-2', 'title' => 'Renamed']]], 'titles are not changed', 'renaming is refused');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'hh_auth', 'title' => 'No count']]], 'Authorized visits is required', 'missing required field');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'doctor', 'title' => 'Dr. X', 'values' => ['role' => 'Wizard']]]], 'must be one of', 'preset-only select rejects other text');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'hh_visit', 'title' => 'V', 'values' => ['date' => '2026-11-31x']]]], 'YYYY-MM-DD', 'bad date');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'hh_visit', 'title' => 'V', 'values' => ['date' => '2026-11-20', 'authorization' => 'doc-derm']]]], 'must link to a hh_auth', 'link to the wrong type');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'hh_visit', 'title' => 'V', 'values' => ['date' => '2026-11-20', 'authorization' => '@nope']]]], 'unknown ref', 'unknown @ref');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'Spaceship', 'title' => 'V']]], 'no entry type', 'unknown type');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'visit', 'title' => 'V', 'values' => ['date' => '2026-11-20', 'mood' => 'ok']]]], 'has no field "mood"', 'unknown field');
$refuse(['condition' => 'cond-nope', 'create' => [['type' => 'visit', 'title' => 'V', 'values' => ['date' => '2026-11-20']]]], 'no condition', 'unknown condition');
$refuse(['condition' => ['new' => ['name' => 'type 2 diabetes (SAMPLE)']]], 'already exists', 'duplicate condition name');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'visit', 'title' => 'V', 'values' => ['date' => '2026-11-20'], 'attachments' => [['path' => "$dir/notes.txt"]]]]], 'Use a PDF', 'non-document attachment');
$refuse(['condition' => 'cond-skin', 'create' => [['type' => 'visit', 'title' => 'V', 'values' => ['date' => '2026-11-20'], 'attachments' => [['path' => "$dir/missing.pdf"]]]]], 'file not found', 'missing attachment');
$refuse(['condition' => 'cond-skin'], 'nothing to create', 'empty plan');
[$code, , $err] = cli(['apply', 'demo', '-'], '{not json');
ok($code === 1 && strpos($err, 'not valid JSON') !== false, 'invalid JSON refused');
// Plans never delete: unknown keys like "delete" are ignored, so the only effect is nothing at all.
$refuse(['condition' => 'cond-skin', 'delete' => ['hh-auth-1']], 'nothing to create', 'a "delete" key does nothing');

// ---- warnings: duplicates, already-attached files (G37)
[$code, $out] = cli(['apply', 'demo', plan(['condition' => 'cond-skin', 'create' => [['type' => 'hh_visit', 'title' => 'Dressing change (intake)', 'values' => ['date' => '2026-11-18']]], 'update' => [['id' => $auth3['id'], 'attachments' => [['path' => "$dir/lab.pdf", 'label' => 'Lab']]]]]), '--dry-run']);
ok($code === 0 && strpos($out, 'looks like existing entry ' . $visit['id']) !== false && strpos($out, 'already attached; skipped') !== false, 'dry run warns about a likely duplicate and an already-attached file');

// ---- temporary account: new condition from scratch (G37)
write_doc('intaketmp', new_doc());
[$code, $out] = cli(['conditions', 'intaketmp']);
ok($code === 0 && json_decode($out, true) === [], 'a temporary account with a stored document is usable');
[$code, $out, $err] = cli(['apply', 'intaketmp', plan(['condition' => ['new' => ['name' => 'Left heel wound', 'summary' => 'Pressure injury', 'diagnosedOn' => '2026-10-01', 'attachments' => [['path' => "$dir/photo.png", 'label' => 'Wound photo']]]],
    'create' => [['ref' => 'pod', 'type' => 'doctor', 'title' => 'Dr. Sample Podiatry', 'values' => ['specialty' => 'Podiatry', 'in_network' => 'yes']],
                 ['type' => 'visit', 'title' => 'Wound clinic', 'values' => ['date' => '2026-11-20', 'doctor' => '@pod', 'status' => 'Waiting on fax from PCP', 'visit_kind' => 'in person']]]])]);
$t = doc('intaketmp');
ok($code === 0 && count($t['conditions']) === 1 && $t['conditions'][0]['name'] === 'Left heel wound' && $t['conditions'][0]['attachments'][0]['kind'] === 'image', "new condition created with a document ($err)");
$wc = by_title($t, 'Wound clinic');
ok($wc['values']['doctor'] === by_title($t, 'Dr. Sample Podiatry')['id'] && $wc['values']['status'] === 'Waiting on fax from PCP' && $wc['values']['visit_kind'] === 'In person' && by_title($t, 'Dr. Sample Podiatry')['values']['in_network'] === true, 'cross-link, free-text status, preset match, and checkbox on the new condition');
ok(in_array('Wound photo', array_column($t['docLabels'], 'label'), true), 'custom document label saved for reuse');
ok($t['revision'] === 1 && $t['conditions'][0]['id'] === $wc['conditionId'], 'one write for the whole plan');
// Custom types work like built-ins.
$t2 = apply_ops($t, [['op' => 'put', 'kind' => 'type', 'value' => ['id' => 'type-labs', 'name' => 'Lab results', 'singular' => 'Lab result', 'titleLabel' => 'Test', 'primaryDateField' => 'drawn', 'fields' => [['id' => 'drawn', 'label' => 'Drawn on', 'kind' => 'date'], ['id' => 'flag', 'label' => 'Flag', 'kind' => 'select', 'options' => ['Normal', 'High']]]]]]);
write_doc('intaketmp', $t2);
[$code, $out, $err] = cli(['apply', 'intaketmp', plan(['condition' => 'Left heel wound', 'create' => [['type' => 'Lab result', 'title' => 'CBC', 'values' => ['Drawn on' => '2026-11-15', 'flag' => 'high']]]])]);
ok($code === 0 && by_title(doc('intaketmp'), 'CBC')['values'] === ['drawn' => '2026-11-15', 'flag' => 'High'], "custom entry type used by name, fields by label; condition found by name ($err)");

// ---- the app reads what the CLI wrote (same document, same rules)
$appDoc = normalize_doc(doc('demo'));
ok($enc(apply_ops($appDoc, [['op' => 'put', 'kind' => 'entry', 'value' => $auth3]])['entries']) !== '', 'CLI-written entries pass the app\'s own validation again');

// ---- the plan example in SKILL.md stays valid (dry run on demo, sample files substituted)
$skill = (string) file_get_contents($root . '/.agents/skills/log-health-update/SKILL.md');
ok(preg_match('/^---\nname: log-health-update\ndescription: .+\n---\n/', $skill) === 1, 'SKILL.md has name and description frontmatter');
preg_match('/## Plan format\n\n```json\n(.*?)```/s', $skill, $m);
file_put_contents("$dir/approval.pdf", synthetic_pdf('Approval', ['x']));
file_put_contents("$dir/summary.pdf", synthetic_pdf('Summary', ['y']));
$example = str_replace(['/Users/me/Downloads/approval.pdf', '/tmp/note.png', '/tmp/summary.pdf'], ["$dir/approval.pdf", "$dir/photo.png", "$dir/summary.pdf"], $m[1] ?? '');
[$code, $out, $err] = cli(['apply', 'demo', '-', '--dry-run'], $example);
ok($code === 0 && strpos($out, '+ new Home health visit: "Dressing change"') !== false && strpos($out, 'another condition') === false, "the SKILL.md plan example dry-runs cleanly ($err)");

// ---- saved views and condition rename/description (t27u, t30u)
$p9 = plan(['condition' => 'cond-skin', 'views' => [['name' => 'Blocked / hiccups', 'tags' => ['Intake test']], ['name' => 'Home health only', 'types' => ['hh_event'], 'condition' => 'this']],
    'conditionUpdate' => ['rename' => 'Skin (wound)', 'description' => 'Pressure wound, <b>stage</b> 2']]);
[$code, $out, $err] = cli(['apply', 'demo', $p9]);
$d9 = doc('demo');
$views = array_values(array_filter($d9['filters'], function ($f) { return strpos($f['id'], 'view-') === 0; }));
ok($code === 0 && count($views) === 2 && $views[0]['name'] === 'Blocked / hiccups' && $views[0]['tagIds'] === [$tagIds['Intake test']] && $views[1]['typeIds'] === ['hh_event'] && $views[1]['conditionId'] === 'cond-skin', "views are created with tag, type, and condition filters ($err)");
$c9 = $d9['conditions'][find_index($d9['conditions'], 'cond-skin')];
ok($c9['name'] === 'Skin (wound)' && $c9['description'] === 'Pressure wound, <b>stage</b> 2', 'conditionUpdate renames and fills an empty description (stored as plain text)');
$id0 = $views[0]['id'];
[$code, $out] = cli(['apply', 'demo', plan(['condition' => 'cond-skin', 'views' => [['name' => 'blocked / HICCUPS', 'tags' => ['paperwork']]], 'conditionUpdate' => ['description' => 'Something else']])]);
$d10 = doc('demo');
$v10 = array_values(array_filter($d10['filters'], function ($f) { return strpos($f['id'], 'view-') === 0; }));
ok($code === 0 && count($v10) === 2 && $v10[0]['id'] === $id0 && $v10[0]['tagIds'] === ['tag-paperwork'], 'a view with the same name (any case) is updated, not duplicated');
ok($d10['conditions'][find_index($d10['conditions'], 'cond-skin')]['description'] === 'Pressure wound, <b>stage</b> 2' && strpos($out, 'already has a description') !== false, 'an existing description is never overwritten by intake');

// ---- Clinical Significance highlights (.agents/skills/clinical-significance)
$e11 = null; foreach (doc('demo')['entries'] as $e) if ($e['conditionId'] === 'cond-skin' && !empty($e['attachments'])) { $e11 = $e; break; }
$hplan = ['condition' => 'cond-skin', 'highlights' => [
    ['title' => 'Biopsy result', 'summary' => 'Exact words "1.6 mm" kept', 'detail' => "Para 1\n\nPara 2", 'quote' => 'BRESLOW DEPTH OF INVASION 1.6 MM, AT LEAST', 'date' => '2026-08-06', 'entry' => $e11['title'], 'file' => $e11['attachments'][0]['name'], 'certainty' => 'documented'],
    ['title' => 'Family note', 'summary' => 'About 41% chance', 'certainty' => 'reported', 'caveat' => 'Not found in a record'],
]];
[$code, $out, $err] = cli(['apply', 'demo', plan($hplan), '--dry-run']);
$mine = function () { return array_values(array_filter(doc('demo')['highlights'] ?? [], function ($h) { return strpos($h['id'], 'hl-demo-') !== 0; })); };
ok($code === 0 && strpos($out, '+ new highlight "Biopsy result"') !== false && count($mine()) === 0, "highlights dry run previews and writes nothing ($err)");
[$code, $out, $err] = cli(['apply', 'demo', plan($hplan)]);
$hl = $mine();
ok($code === 0 && count($hl) === 2 && $hl[0]['summary'] === 'Exact words "1.6 mm" kept' && $hl[0]['sourceEntryId'] === $e11['id'] && $hl[0]['sourceFileId'] === $e11['attachments'][0]['id'] && $hl[0]['origin'] === 'ai' && $hl[1]['certainty'] === 'reported', "highlights are saved with their sources, AI origin, and certainty ($err)");
[$code, $out, $err] = cli(['apply', 'demo', plan(['condition' => 'cond-skin', 'highlights' => [['title' => 'BIOPSY RESULT', 'summary' => 'Changed']]])]);
ok(strpos($out . $err, 'already exists; left as is') !== false && $mine()[0]['summary'] === 'Exact words "1.6 mm" kept', 'an existing highlight is not changed without "update": true');
[$code, $out] = cli(['apply', 'demo', plan(['condition' => 'cond-skin', 'highlights' => [['title' => 'biopsy result', 'summary' => 'Changed', 'update' => true]]])]);
$hl2 = $mine();
ok($code === 0 && count($hl2) === 2 && $hl2[0]['summary'] === 'Changed' && $hl2[0]['sourceEntryId'] === $e11['id'] && $hl2[0]['quote'] !== '', 'with "update": true the highlight is changed in place and keeps fields not given');
[$code, , $err] = cli(['apply', 'demo', plan(['condition' => 'cond-skin', 'highlights' => [['title' => 'X', 'summary' => 'Y', 'file' => 'no-such.pdf']]])]);
ok($code !== 0 && strpos($err, 'no document') !== false, 'a highlight citing a missing document is refused');
[$code, $out] = cli(['highlights', 'demo', '--condition=cond-skin']);
ok($code === 0 && count(json_decode($out, true)) === 5, 'the highlights command lists a condition\'s highlights');

// ---- real storage untouched; wf never used
ok(!is_file("$dir/data/wf.json.php"), 'wf was never loaded or created by the tests');
ok((is_file($realWf) ? hash_file('sha256', $realWf) : null) === $realWfHash && (is_file($realDemo) ? hash_file('sha256', $realDemo) : null) === $realDemoHash, "real storage/ files untouched");

exec('rm -rf ' . escapeshellarg($dir));
echo "PASS: $checks intake CLI checks.\n";
