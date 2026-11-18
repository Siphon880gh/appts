<?php
declare(strict_types=1);
require_once __DIR__ . '/env.php';
/**
 * App version: derived from the shell files (index.php, its includes, styles.css, every JS module,
 * the service worker, and the manifest). Any edit changes it, which changes the service worker and
 * manifest URLs, so a new release is installed and Offline mode re-saves its copy.
 */
function shell_files(): array {
    $root = dirname(__DIR__);
    $files = ['index.php', 'includes/head.php', 'includes/layout.php', 'includes/footer.php', 'styles.css', 'sw.php', 'manifest.php', 'includes/sw.js', 'includes/env.php'];
    foreach (glob($root . '/js/*.js') ?: [] as $f) $files[] = 'js/' . basename($f);
    sort($files);
    return $files;
}
function app_version(): string {
    static $v = null;
    if ($v !== null) return $v;
    $root = dirname(__DIR__);
    $sig = '';
    foreach (shell_files() as $f) {
        $p = $root . '/' . $f;
        clearstatcache(true, $p);
        $sig .= $f . ':' . (is_file($p) ? filemtime($p) . ':' . filesize($p) : '-') . ';';
    }
    $sig .= 'base:' . app_base_url(); // a new APP_BASE_URL is a new release too
    return $v = substr(sha1($sig), 0, 10);
}
