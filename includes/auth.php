<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';

function account_table(): array {
    $accounts = require __DIR__ . '/accounts.php';
    // Optional git-ignored password overrides written by tools/set-password.php.
    $override = read_guarded(storage_root() . '/accounts.json.php');
    if ($override !== null) {
        foreach (json_decode($override, true) ?: [] as $user => $hash) {
            if (isset($accounts[$user]) && is_string($hash) && str_starts_with($hash, '$')) $accounts[$user]['hash'] = $hash;
        }
    }
    return $accounts;
}

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
    session_name('APPTSSESS');
    session_set_cookie_params(['lifetime' => 0, 'path' => $path, 'httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
    ini_set('session.use_strict_mode', '1');
    session_start();
}

function current_account(): ?array {
    start_session();
    $user = $_SESSION['account'] ?? null;
    $accounts = account_table();
    if (!is_string($user) || !isset($accounts[$user])) return null;
    return ['username' => $user, 'displayName' => $accounts[$user]['displayName'], 'isDemo' => (bool) $accounts[$user]['demo']];
}

function login(string $username, string $password): ?array {
    $accounts = account_table();
    $username = strtolower(trim($username));
    $hash = $accounts[$username]['hash'] ?? password_hash(random_bytes(12), PASSWORD_DEFAULT);
    $ok = password_verify($password, $hash) && isset($accounts[$username]);
    if (!$ok) { usleep(250000); return null; }
    start_session();
    session_regenerate_id(true);
    $_SESSION['account'] = $username;
    return current_account();
}

function logout(): void {
    start_session();
    $_SESSION = [];
    session_destroy();
}
