<?php
declare(strict_types=1);
// Usage: php tools/set-password.php <username>
// Reads the new password from stdin without echoing it and stores only its password_hash()
// in storage/accounts.json.php (git-ignored, web-guarded).
require __DIR__ . '/../includes/auth.php';
if (PHP_SAPI !== 'cli') exit(1);
$user = $argv[1] ?? '';
$accounts = require __DIR__ . '/../includes/accounts.php';
if (!isset($accounts[$user])) { fwrite(STDERR, "Unknown account.\n"); exit(1); }
if (stream_isatty(STDIN)) { fwrite(STDERR, 'New password: '); shell_exec('stty -echo'); }
$password = rtrim((string) fgets(STDIN), "\r\n");
if (stream_isatty(STDIN)) { shell_exec('stty echo'); fwrite(STDERR, "\n"); }
if (strlen($password) < 8) { fwrite(STDERR, "Use at least 8 characters.\n"); exit(1); }
$path = storage_root() . '/accounts.json.php';
ensure_dir(storage_root());
$current = json_decode(read_guarded($path) ?? '{}', true) ?: [];
$current[$user] = password_hash($password, PASSWORD_DEFAULT);
atomic_write($path, guarded_encode(json_encode($current)));
fwrite(STDERR, "Password updated for $user.\n");
