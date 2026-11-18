<?php
declare(strict_types=1);
require_once __DIR__ . '/includes/env.php';
require __DIR__ . '/includes/version.php';
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');
$v = app_version();
$base = app_base_url(); // absolute id when APP_BASE_URL is set (.env); relative paths otherwise
echo json_encode([
    'name' => 'Appts: appointments, insurance, and progress by condition',
    'short_name' => 'Appts',
    'description' => 'Appointments, insurance, and progress for each condition in one place.',
    'id' => $base !== '' ? $base . 'index.php' : './index.php',
    'start_url' => './index.php',
    'scope' => './',
    'display' => 'standalone',
    'background_color' => '#f4f3ed',
    'theme_color' => '#172943',
    'version' => $v,
    'icons' => [
        ['src' => 'assets/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png'],
        ['src' => 'assets/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png'],
        ['src' => 'assets/icon.svg', 'sizes' => 'any', 'type' => 'image/svg+xml'],
    ],
], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
