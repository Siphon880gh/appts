<?php
declare(strict_types=1);

// Plain PHP entry point (no router). Records live in per-account JSON files under storage/,
// read and written only through api.php.
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");

require __DIR__ . '/includes/head.php';
require __DIR__ . '/includes/layout.php';
require __DIR__ . '/includes/footer.php';
