<?php
declare(strict_types=1);
// Usage: php tools/migrate-dry-run.php <account>
// Runs the document migration on a temporary COPY of the account's stored file and reports what
// would change. The real file, its backups, and its lock are never written. Record contents are
// not printed: only type/field ids, names, and pass/fail lines.
require __DIR__ . '/../includes/domain.php';
if (PHP_SAPI !== 'cli') exit(1);
$account = $argv[1] ?? '';
if (!preg_match('/^[a-z0-9_-]{1,64}$/D', $account)) { fwrite(STDERR, "Usage: php tools/migrate-dry-run.php <account>\n"); exit(1); }
$realPath = storage_root() . '/data/' . $account . '.json.php';
if (!is_file($realPath)) { echo "No stored document for '$account' (it will be created fresh at version " . DOC_VERSION . ").\n"; exit(0); }
$realBackups = glob(storage_root() . '/backups/' . $account . '/*.json.php') ?: [];
$realHash = hash_file('sha256', $realPath);
$rawBefore = (string) file_get_contents($realPath);

$tmp = sys_get_temp_dir() . '/appts-dry-run-' . bin2hex(random_bytes(4));
putenv("APPTS_STORAGE_DIR=$tmp");
ensure_dir($tmp . '/data');
copy($realPath, $tmp . '/data/' . $account . '.json.php');
$before = read_doc($account);
$after = migrate_stored_doc($account);
$enc = function ($x): string { return json_encode($x, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT); };

$fail = 0;
$line = function (bool $ok, string $what) use (&$fail): void { if (!$ok) $fail++; echo ($ok ? '  ok - ' : '  FAIL - ') . $what . "\n"; };
$write = function ($x): string { return STORAGE_GUARD . json_encode($x, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR); };
$line($write($before) === $rawBefore, 're-encoding the stored document reproduces its exact bytes (so equal sections mean equal bytes)');
echo "Account '$account': version " . ($before['version'] ?? 1) . ' -> ' . ($after['version'] ?? '?') . "\n";
echo "Type changes:\n";
$oldTypes = [];
foreach ($before['types'] ?? [] as $t) $oldTypes[$t['id']] = $t;
$changes = 0;
foreach ($after['types'] ?? [] as $t) {
    $o = $oldTypes[$t['id']] ?? null;
    if ($o === null) { echo "    + new type {$t['id']}\n"; $changes++; continue; }
    foreach (['name', 'singular'] as $k) if (($o[$k] ?? null) !== ($t[$k] ?? null)) { echo "    {$t['id']}.$k: \"{$o[$k]}\" -> \"{$t[$k]}\"\n"; $changes++; }
    foreach ($t['fields'] ?? [] as $i => $f) {
        $of = $o['fields'][$i] ?? [];
        foreach (array_unique(array_merge(array_keys($of), array_keys($f))) as $k) {
            if (($of[$k] ?? null) !== ($f[$k] ?? null)) { echo "    {$t['id']}.fields.{$f['id']}.$k: " . json_encode($of[$k] ?? null) . ' -> ' . json_encode($f[$k] ?? null) . "\n"; $changes++; }
        }
    }
    $restO = $o; $restT = $t; unset($restO['name'], $restO['singular'], $restO['fields'], $restT['name'], $restT['singular'], $restT['fields']);
    $line($enc($restO) === $enc($restT), "{$t['id']}: other type settings unchanged");
}
if (!$changes) echo "    (none)\n";
foreach (array_keys($before) as $k) {
    if ($k === 'types' || $k === 'version') continue;
    $n = is_array($before[$k]) ? count($before[$k]) : 1;
    $line($enc($before[$k]) === $enc($after[$k] ?? null), "'$k' byte-identical ($n)");
}
$oldIds = array_column($before['types'] ?? [], 'id');
$line(array_slice(array_column($after['types'] ?? [], 'id'), 0, count($oldIds)) === $oldIds, 'every existing type kept, in its order (' . count($oldIds) . ' -> ' . count($after['types'] ?? []) . ' types; only new built-ins appended)');
$line(count(glob($tmp . '/backups/' . $account . '/*.json.php') ?: []) === ($after === $before ? 0 : 1), 'copy was backed up before the migration write');
$line(hash_file('sha256', $realPath) === $realHash && file_get_contents($realPath) === $rawBefore, 'real stored file untouched');
$line(count(glob(dirname($realPath, 2) . '/backups/' . $account . '/*.json.php') ?: []) === count($realBackups), 'no backup added to the real account');
exec('rm -rf ' . escapeshellarg($tmp));
echo $fail ? "DRY RUN FOUND $fail PROBLEM(S)\n" : "DRY RUN OK: only type definitions (and version) would change; no record is touched.\n";
exit($fail ? 1 : 0);
