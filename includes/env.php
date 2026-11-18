<?php
declare(strict_types=1);
/**
 * Tiny .env loader (no Composer; PHP 7.4 safe). Reads KEY=VALUE lines from the app's .env:
 * blank lines and # comments are skipped, values may be quoted, and real environment
 * variables win over the file. Keys used: APP_ENV (local | production) and APP_BASE_URL
 * (the absolute URL of this folder, e.g. http://localhost:8888/weng/app/healthcare/appts/).
 * With no .env, app_base_url() is '' and everything keeps using relative paths.
 * .env is git-ignored and blocked from the web (.htaccess, tools/router.php); see .example.env.
 */
function env_parse(string $text): array {
    $out = [];
    foreach (preg_split('/\r\n|\r|\n/', $text) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, 'export ') === 0) $line = trim(substr($line, 7));
        $eq = strpos($line, '=');
        if ($eq === false) continue;
        $key = trim(substr($line, 0, $eq));
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $key)) continue;
        $val = trim(substr($line, $eq + 1));
        if (strlen($val) >= 2 && ($val[0] === '"' || $val[0] === "'") && substr($val, -1) === $val[0]) $val = substr($val, 1, -1);
        else $val = trim((string) preg_replace('/\s+#.*$/', '', $val));
        $out[$key] = $val;
    }
    return $out;
}
function env_file(): string { return (string) (getenv('APPTS_ENV_FILE') ?: dirname(__DIR__) . '/.env'); }
function env_values(): array {
    static $cache = null;
    if ($cache === null) { $f = env_file(); $cache = is_file($f) && is_readable($f) ? env_parse((string) file_get_contents($f)) : []; }
    return $cache;
}
function env(string $key, string $default = ''): string {
    $real = getenv($key);
    if ($real !== false && $real !== '') return $real;
    return env_values()[$key] ?? $default;
}
function app_env(): string { $e = strtolower(env('APP_ENV', 'local')); return in_array($e, ['local', 'production'], true) ? $e : 'local'; }
/** The configured absolute base URL with a trailing slash, or '' when unset or not http(s). */
function app_base_url(): string {
    $u = trim(env('APP_BASE_URL'));
    if ($u === '' || !preg_match('~^https?://[^\s/]+(/[^\s?#]*)?$~iD', $u)) return '';
    return rtrim($u, '/') . '/';
}
