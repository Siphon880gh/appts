<?php
declare(strict_types=1);
require __DIR__ . '/includes/version.php';
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');
$v = app_version();
echo json_encode([
    'name' => 'Appts: appointments, insurance, and progress by condition',
    'short_name' => 'Appts',
    'description' => 'Appointments, insurance, and progress for each condition in one place.',
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
