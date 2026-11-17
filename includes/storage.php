<?php
declare(strict_types=1);

/*
 * File storage for Appts.
 *
 * Every file written under storage/ is a .php file that starts with STORAGE_GUARD.
 * Apache denies the folder via .htaccess, and `php -S` (which has no router here)
 * executes the guard instead of serving the bytes, so data and images are never
 * readable straight from the web. Readers strip the guard before decoding.
 */
const STORAGE_GUARD = "<?php http_response_code(404); exit; ?>\n";
const BACKUP_KEEP = 20;
const DOC_MAX_BYTES = 5 * 1024 * 1024;

function storage_root(): string {
    $dir = getenv('APPTS_STORAGE_DIR');
    return rtrim($dir ?: dirname(__DIR__) . '/storage', '/');
}

function ensure_dir(string $dir): string {
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Storage is not writable.');
    }
    if (!is_file($dir . '/index.php')) @file_put_contents($dir . '/index.php', "<?php http_response_code(404);\n");
    if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    return $dir;
}

function storage_dir(string ...$parts): string {
    $dir = storage_root();
    ensure_dir($dir);
    foreach ($parts as $part) {
        if (!preg_match('/^[a-z0-9_-]{1,64}$/D', $part)) throw new InvalidArgumentException('Invalid storage path.');
        $dir .= '/' . $part;
        ensure_dir($dir);
    }
    return $dir;
}

function guarded_encode(string $bytes): string { return STORAGE_GUARD . $bytes; }

function guarded_decode(string $raw): string {
    if (!str_starts_with($raw, STORAGE_GUARD)) throw new RuntimeException('Storage file is missing its guard.');
    return substr($raw, strlen(STORAGE_GUARD));
}

/** Write via a uniquely named temp .php file in the same folder, then rename over the target. */
function atomic_write(string $path, string $bytes): void {
    $tmp = $path . '.' . bin2hex(random_bytes(8)) . '.tmp.php';
    $handle = fopen($tmp, 'xb');
    if ($handle === false) throw new RuntimeException('Could not open a temp file.');
    try {
        $written = fwrite($handle, $bytes);
        if ($written !== strlen($bytes) || !fflush($handle)) throw new RuntimeException('Could not write storage.');
        fclose($handle);
        $handle = null;
        chmod($tmp, 0600);
        if (!rename($tmp, $path)) throw new RuntimeException('Could not replace storage file.');
    } finally {
        if ($handle) fclose($handle);
        if (is_file($tmp)) @unlink($tmp);
    }
}

function read_guarded(string $path): ?string {
    if (!is_file($path)) return null;
    $raw = file_get_contents($path);
    if ($raw === false) throw new RuntimeException('Could not read storage.');
    return guarded_decode($raw);
}

/** Run $fn while holding an exclusive lock for one account. */
function with_lock(string $account, callable $fn): mixed {
    $path = storage_dir('locks') . '/' . $account . '.lock.php';
    $handle = fopen($path, 'c');
    if ($handle === false) throw new RuntimeException('Could not open the account lock.');
    try {
        if (!flock($handle, LOCK_EX)) throw new RuntimeException('Could not lock the account.');
        if (fstat($handle)['size'] === 0) { fwrite($handle, STORAGE_GUARD); fflush($handle); }
        return $fn();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function doc_path(string $account): string { return storage_dir('data') . '/' . $account . '.json.php'; }

function read_doc(string $account): ?array {
    $json = read_guarded(doc_path($account));
    if ($json === null) return null;
    $doc = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
    return is_array($doc) ? $doc : null;
}

function backup_doc(string $account): void {
    $current = doc_path($account);
    if (!is_file($current)) return;
    $dir = storage_dir('backups', $account);
    $stamp = gmdate('Ymd\THis') . sprintf('%06d', (int)((microtime(true) * 1e6) % 1e6));
    if (!copy($current, $dir . '/' . $stamp . '-' . bin2hex(random_bytes(3)) . '.json.php')) throw new RuntimeException('Could not back up storage.');
    $backups = glob($dir . '/*.json.php') ?: [];
    sort($backups);
    while (count($backups) > BACKUP_KEEP) @unlink(array_shift($backups));
}

function write_doc(string $account, array $doc): void {
    $json = json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    if (strlen($json) > DOC_MAX_BYTES) throw new InvalidArgumentException('Your records are over the 5 MB limit.');
    backup_doc($account);
    atomic_write(doc_path($account), guarded_encode($json));
}

function list_backups(string $account): array {
    return glob(storage_dir('backups', $account) . '/*.json.php') ?: [];
}
