<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/sanitize.php';

// Uploads: images (inline in notes, or documents) and PDFs (documents). Content-addressed
// by SHA-256, validated by magic bytes + MIME, stored as guarded .php files per account.
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PDF_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_MAX_PIXELS = 40000000;
const IMAGE_TYPES = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'];

function upload_dir(string $account): string { return storage_dir('uploads', $account); }

function inspect_file_bytes(string $bytes): array {
    $size = strlen($bytes);
    if (!$size) throw new InvalidArgumentException('The file is empty.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
    if (str_starts_with($bytes, '%PDF-')) {
        if ($mime !== 'application/pdf' || !str_contains(substr($bytes, -2048), '%%EOF')) throw new InvalidArgumentException('That PDF looks damaged or incomplete.');
        if ($size > PDF_MAX_BYTES) throw new InvalidArgumentException('Choose a PDF smaller than 20 MB.');
        return ['id' => hash('sha256', $bytes) . '.pdf', 'mime' => 'application/pdf', 'kind' => 'pdf', 'bytes' => $size];
    }
    if ($size > IMAGE_MAX_BYTES) throw new InvalidArgumentException('Choose an image smaller than 8 MB.');
    $info = @getimagesizefromstring($bytes);
    if (!$info || !isset(IMAGE_TYPES[$mime]) || ($info['mime'] ?? '') !== $mime) throw new InvalidArgumentException('Use a PDF, or a PNG, JPEG, GIF, or WebP image.');
    if ($info[0] * $info[1] > IMAGE_MAX_PIXELS) throw new InvalidArgumentException('Image dimensions exceed 40 megapixels.');
    return ['id' => hash('sha256', $bytes) . '.' . IMAGE_TYPES[$mime], 'mime' => $mime, 'kind' => 'image', 'bytes' => $size, 'width' => $info[0], 'height' => $info[1]];
}

function upload_file(string $account, string $id): string {
    if (!preg_match(FILE_ID_PATTERN, $id)) throw new InvalidArgumentException('Invalid file identifier.');
    return upload_dir($account) . '/' . $id . '.php';
}

function store_bytes(string $account, string $bytes): array {
    $file = inspect_file_bytes($bytes);
    $path = upload_file($account, $file['id']);
    if (!is_file($path)) atomic_write($path, guarded_encode($bytes));
    $file['createdAt'] = gmdate('c', (int) filemtime($path));
    return $file;
}

function store_upload(string $account, string $tmpFile): array {
    $bytes = file_get_contents($tmpFile);
    if ($bytes === false) throw new RuntimeException('Could not read the upload.');
    return store_bytes($account, $bytes);
}

function read_upload(string $account, string $id): ?string { return read_guarded(upload_file($account, $id)); }

function list_uploads(string $account, bool $imagesOnly = false): array {
    $files = [];
    foreach (glob(upload_dir($account) . '/*.php') ?: [] as $path) {
        $id = substr(basename($path), 0, -4);
        if (!preg_match(FILE_ID_PATTERN, $id) || ($imagesOnly && !preg_match(IMAGE_ID_PATTERN, $id))) continue;
        $bytes = read_guarded($path);
        if ($bytes === null) continue;
        try { $info = inspect_file_bytes($bytes); } catch (InvalidArgumentException $e) { continue; }
        $files[] = $info + ['createdAt' => gmdate('c', (int) filemtime($path))];
    }
    usort($files, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
    return $files;
}
