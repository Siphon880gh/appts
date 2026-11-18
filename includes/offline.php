<?php
declare(strict_types=1);
require_once __DIR__ . '/version.php';
require_once __DIR__ . '/uploads.php';

/** Size of a stored upload (the guard prefix is not part of the file). */
function upload_bytes(string $account, string $id): int {
    try { $path = upload_file($account, $id); } catch (InvalidArgumentException $e) { return 0; }
    return is_file($path) ? max(0, (int) filesize($path) - strlen(STORAGE_GUARD)) : 0;
}

/**
 * Everything the signed-in account needs to work offline: the shell, one URL per view (hash routes
 * are all served by index.php), the account's data through the API, and that account's uploads with
 * byte sizes, grouped by condition. Built only from this account's document and upload folder.
 */
function offline_plan(string $account, array $doc): array {
    $root = dirname(__DIR__);
    $v = app_version();
    $shell = [];
    $pageBytes = 0;
    foreach (['includes/head.php', 'includes/layout.php', 'includes/footer.php'] as $f) $pageBytes += (int) @filesize("$root/$f");
    $shell[] = ['url' => './', 'bytes' => $pageBytes];
    $shell[] = ['url' => 'index.php', 'bytes' => $pageBytes];
    foreach (shell_files() as $f) {
        if (strpos($f, 'includes/') === 0 || $f === 'index.php' || $f === 'sw.php') continue;
        $shell[] = ['url' => $f === 'manifest.php' ? "manifest.php?v=$v" : $f, 'bytes' => $f === 'manifest.php' ? 600 : (int) filesize("$root/$f")];
    }
    // pdf.js (t68u): the in-browser PDF preview must work from the saved copy too.
    foreach (['vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js'] as $f) if (is_file("$root/$f")) $shell[] = ['url' => $f, 'bytes' => (int) filesize("$root/$f")];
    foreach (['assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png'] as $f) if (is_file("$root/$f")) $shell[] = ['url' => $f, 'bytes' => (int) filesize("$root/$f")];

    $docBytes = strlen((string) json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $data = [
        ['url' => 'api.php?action=session', 'bytes' => 300],
        ['url' => 'api.php?action=data', 'bytes' => $docBytes + 300],
        ['url' => 'api.php?action=images', 'bytes' => 2000],
        ['url' => 'api.php?action=files', 'bytes' => 2000],
        ['url' => 'api.php?action=thumbs', 'bytes' => 2000],
    ];
    $thumbs = thumb_versions($account);
    $views = ['index.php#/', 'index.php#/upcoming', 'index.php#/timeline', 'index.php#/documents', 'index.php#/types'];

    $conditions = [];
    $all = [];
    foreach ($doc['conditions'] ?? [] as $c) {
        $views[] = 'index.php#/c/' . rawurlencode((string) $c['id']);
        $ids = [];
        $collect = function (array $record) use (&$ids) {
            foreach ($record['attachments'] ?? [] as $a) if (is_array($a) && isset($a['id'])) $ids[(string) $a['id']] = (string) ($a['kind'] ?? '');
            foreach ($record['notes']['imageIds'] ?? [] as $id) if (is_string($id)) $ids[$id] = $ids[$id] ?? 'image';
        };
        $collect($c);
        foreach ($doc['entries'] ?? [] as $e) if (($e['conditionId'] ?? '') === $c['id']) $collect($e);
        $uploads = [];
        $bytes = 0;
        foreach ($ids as $id => $kind) {
            if (!preg_match(FILE_ID_PATTERN, $id)) continue;
            $b = upload_bytes($account, $id);
            if ($b <= 0) continue; // referenced but not stored for this account: nothing to save
            $u = ['id' => $id, 'url' => 'api.php?action=file&id=' . rawurlencode($id), 'kind' => substr($id, -4) === '.pdf' ? 'pdf' : 'image', 'bytes' => $b];
            // The PDF's page-1 preview, versioned so a newer one replaces a stale copy (t68u).
            if (isset($thumbs[$id])) $u['thumb'] = ['url' => 'api.php?action=thumb&id=' . rawurlencode($id) . '&v=' . $thumbs[$id], 'bytes' => (int) @filesize(thumb_file($account, $id))];
            $uploads[] = $u;
            $bytes += $b;
            $all[$id] = $b;
        }
        $conditions[] = ['id' => $c['id'], 'name' => $c['name'], 'description' => (string) ($c['description'] ?? ''), 'status' => $c['status'] ?? 'active', 'uploads' => $uploads, 'bytes' => $bytes];
    }
    $shellBytes = array_sum(array_column($shell, 'bytes'));
    $dataBytes = array_sum(array_column($data, 'bytes'));
    return [
        'version' => $v,
        'account' => $account,
        'generatedAt' => gmdate('c'),
        'shell' => $shell,
        'views' => $views,
        'data' => $data,
        'conditions' => $conditions,
        'estimate' => ['shellBytes' => $shellBytes, 'dataBytes' => $dataBytes, 'uploadBytes' => array_sum($all), 'uploads' => count($all), 'totalBytes' => $shellBytes + $dataBytes + array_sum($all)],
    ];
}
