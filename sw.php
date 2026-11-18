<?php
declare(strict_types=1);
// Serves the service worker from the app folder so its scope is the whole app (MAMP subpath or php -S).
require __DIR__ . '/includes/version.php';
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Content-Type-Options: nosniff');
echo str_replace('__APPTS_VERSION__', app_version(), (string) file_get_contents(__DIR__ . '/includes/sw.js'));
