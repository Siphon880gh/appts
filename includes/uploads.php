<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/sanitize.php';

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_PIXELS = 40000000;
const IMAGE_TYPES = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'];

function upload_dir(string $account): string { return storage_dir('uploads', $account); }

function inspect_image_bytes(string $bytes): array {
    $size = strlen($bytes);
    if (!$size || $size > IMAGE_MAX_BYTES) throw new InvalidArgumentException('Choose an image smaller than 8 MB.');
    $info = @getimagesizefromstring($bytes);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
    if (!$info || !isset(IMAGE_TYPES[$mime]) || ($info['mime'] ?? '') !== $mime) throw new InvalidArgumentException('Use a PNG, JPEG, GIF, or WebP image.');
    if ($info[0] * $info[1] > IMAGE_MAX_PIXELS) throw new InvalidArgumentException('Image dimensions exceed 40 megapixels.');
    return ['id' => hash('sha256', $bytes) . '.' . IMAGE_TYPES[$mime], 'mime' => $mime, 'bytes' => $size, 'width' => $info[0], 'height' => $info[1]];
}

function image_file(string $account, string $id): string {
    if (!preg_match(IMAGE_ID_PATTERN, $id)) throw new InvalidArgumentException('Invalid image identifier.');
    return upload_dir($account) . '/' . $id . '.php';
}

function store_image(string $account, string $tmpFile): array {
    $bytes = file_get_contents($tmpFile);
    if ($bytes === false) throw new RuntimeException('Could not read the upload.');
    $image = inspect_image_bytes($bytes);
    $path = image_file($account, $image['id']);
    if (!is_file($path)) atomic_write($path, guarded_encode($bytes));
    $image['createdAt'] = gmdate('c', (int) filemtime($path));
    return $image;
}

function read_image(string $account, string $id): ?string { return read_guarded(image_file($account, $id)); }

function list_images(string $account): array {
    $images = [];
    foreach (glob(upload_dir($account) . '/*.php') ?: [] as $path) {
        $id = substr(basename($path), 0, -4);
        if (!preg_match(IMAGE_ID_PATTERN, $id)) continue;
        $bytes = read_guarded($path);
        $info = $bytes === null ? false : @getimagesizefromstring($bytes);
        if (!$info) continue;
        $images[] = ['id' => $id, 'mime' => $info['mime'], 'bytes' => strlen($bytes), 'width' => $info[0], 'height' => $info[1], 'createdAt' => gmdate('c', (int) filemtime($path))];
    }
    usort($images, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
    return $images;
}
