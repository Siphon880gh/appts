<?php
declare(strict_types=1);
// PDF page-1 thumbnails (t64u): generator detection, each available generator, store-time and
// lazy generation, the "no generator" path (never fatal), and that thumbs stay out of file lists.
$dir = sys_get_temp_dir() . '/appts-thumbs-' . bin2hex(random_bytes(4));
putenv("APPTS_STORAGE_DIR=$dir");
require __DIR__ . '/../includes/demo-seed.php';
require_once __DIR__ . '/../includes/uploads.php';
$checks = 0;
function ok($c, string $what): void { global $checks; $checks++; if (!$c) { fwrite(STDERR, "FAIL: $what\n"); exit(1); } }
function throws(callable $f, string $what): void { try { $f(); } catch (Throwable $e) { ok(true, $what); return; } ok(false, $what); }

$pdf = synthetic_pdf('THUMB TEST (synthetic)', ['Line one', 'Line two']);
$tools = thumb_generators();
echo 'generators: ' . ($tools ? implode(', ', $tools) : 'none') . "\n";

// No generator: storing a PDF still works and simply has no thumbnail.
putenv('APPTS_THUMB_TOOL=none');
ok(thumb_generators() === [], 'APPTS_THUMB_TOOL=none turns every generator off');
$f = store_bytes('acct', $pdf);
ok($f['kind'] === 'pdf' && !is_file(thumb_file('acct', $f['id'])), 'with no generator the PDF is stored without a thumbnail (no error)');
ok(read_pdf_thumb('acct', $f['id']) === null, 'with no generator there is no thumbnail to serve');
putenv('APPTS_THUMB_TOOL');

throws(function () { thumb_file('acct', '../x.pdf'); }, 'thumbnail paths only accept a PDF content id');
throws(function () { thumb_file('acct', str_repeat('a', 64) . '.png'); }, 'images have no PDF thumbnail');
ok(make_pdf_thumb('acct', str_repeat('b', 64) . '.pdf') === null, 'a missing PDF gives no thumbnail and no error');

if (!$tools) { echo "PASS: $checks thumbnail checks (no generator on this PHP; browser fallback only).\n"; exit(0); }

foreach ($tools as $tool) {
    putenv("APPTS_THUMB_TOOL=$tool");
    @unlink(thumb_file('acct', $f['id']));
    ok(make_pdf_thumb('acct', $f['id']) === $tool, "$tool renders page 1");
    $jpg = read_pdf_thumb('acct', $f['id']);
    $info = getimagesizefromstring((string) $jpg);
    ok($info && $info['mime'] === 'image/jpeg' && $info[0] >= 300 && $info[0] <= 600 && $info[1] > $info[0], "$tool makes a portrait JPEG about 480px wide ({$info[0]}x{$info[1]})");
    ok(strncmp((string) file_get_contents(thumb_file('acct', $f['id'])), STORAGE_GUARD, strlen(STORAGE_GUARD)) === 0, "$tool thumbnail is stored behind the PHP guard");
}
putenv('APPTS_THUMB_TOOL');

// Store-time and lazy generation.
$g = store_bytes('acct2', synthetic_pdf('SECOND (synthetic)', ['x']));
ok(is_file(thumb_file('acct2', $g['id'])), 'uploading a PDF makes its thumbnail right away');
unlink(thumb_file('acct2', $g['id']));
ok(read_pdf_thumb('acct2', $g['id']) !== null && is_file(thumb_file('acct2', $g['id'])), 'a missing thumbnail is made lazily on first request');
ok(make_pdf_thumb('acct2', $g['id']) === 'cached', 'an existing thumbnail is reused');
ok(count(list_uploads('acct2')) === 1, 'thumbnails do not show up as uploaded files');

// The backfill tool.
$php = PHP_BINARY;
unlink(thumb_file('acct2', $g['id']));
mkdir("$dir/data", 0777, true); write_doc('acct2', new_doc());
exec('APPTS_STORAGE_DIR=' . escapeshellarg($dir) . ' ' . escapeshellarg($php) . ' ' . escapeshellarg(__DIR__ . '/../tools/thumbs.php') . ' acct2 2>&1', $out, $code);
ok($code === 0 && is_file(thumb_file('acct2', $g['id'])) && strpos(implode("\n", $out), 'acct2: 1 made') !== false, 'tools/thumbs.php backfills missing thumbnails: ' . implode(' | ', $out));
ok(count(glob("$dir/backups/acct2/*.json.php") ?: []) >= 1, 'tools/thumbs.php takes a backup first');

exec('rm -rf ' . escapeshellarg($dir));
echo "PASS: $checks thumbnail checks (generators: " . implode(', ', $tools) . ").\n";
