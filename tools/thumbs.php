<?php
declare(strict_types=1);
// Backfill page-1 thumbnails for PDFs already uploaded (t64u).
//   php tools/thumbs.php <account> [<account> ...]   e.g. php tools/thumbs.php wf demo
//   php tools/thumbs.php --check                     which generator this PHP can use
// Takes a backup of each account's document first (thumbnails never change it, but the habit
// stays the same as every other data tool). Existing thumbnails are kept.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../includes/uploads.php';

$args = array_slice($argv, 1);
$tools = thumb_generators();
echo 'Generators available: ' . ($tools ? implode(', ', $tools) : 'none (browser fallback only)') . "\n";
if (!$args || $args === ['--check']) exit($args ? 0 : 1);
$status = 0;
foreach ($args as $account) {
    if (!preg_match('/^[a-z0-9_-]{1,32}$/D', $account)) { fwrite(STDERR, "Skipping invalid account name: $account\n"); $status = 1; continue; }
    if (!is_file(doc_path($account))) { fwrite(STDERR, "No such account: $account\n"); $status = 1; continue; }
    backup_doc($account);
    $made = $cached = $failed = 0; $by = [];
    foreach (glob(storage_dir('uploads', $account) . '/*.pdf.php') ?: [] as $p) {
        $id = substr(basename($p), 0, -4);
        if (!preg_match('/^[a-f0-9]{64}\.pdf$/D', $id)) continue;
        $r = make_pdf_thumb($account, $id);
        if ($r === 'cached') $cached++;
        elseif ($r === null) { $failed++; fwrite(STDERR, "  no thumbnail: $id\n"); }
        else { $made++; $by[$r] = ($by[$r] ?? 0) + 1; }
    }
    $how = $by ? ' (' . implode(', ', array_map(function ($k, $v) { return "$k: $v"; }, array_keys($by), $by)) . ')' : '';
    echo "$account: $made made$how, $cached already there, $failed without a thumbnail (backup taken first)\n";
    if ($failed) $status = 1;
}
exit($status);
