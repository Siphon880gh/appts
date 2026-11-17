<?php
declare(strict_types=1);
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/domain.php';
require __DIR__ . '/includes/demo-seed.php';
require __DIR__ . '/includes/uploads.php';

if (!ini_get('date.timezone')) date_default_timezone_set('America/Los_Angeles');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

function reply(array $body, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function json_body(): array {
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > DOC_MAX_BYTES) reply(['error' => 'Request too large.'], 413);
    $body = json_decode($raw, true);
    return is_array($body) ? $body : [];
}

/** Load the account document, creating it on first use (demo gets synthetic seed data). */
function load_doc(array $account): array {
    $doc = read_doc($account['username']);
    if ($doc !== null) return $doc;
    return with_lock($account['username'], function () use ($account) {
        $doc = read_doc($account['username']);
        if ($doc === null) {
            $doc = $account['isDemo'] ? demo_doc() : new_doc();
            write_doc($account['username'], $doc);
        }
        return $doc;
    });
}

try {
    $action = (string) ($_GET['action'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    // Writes must be POST with the custom header (blocks cross-site form posts); cookie is SameSite=Strict too.
    if ($method === 'POST' && ($_SERVER['HTTP_X_APPTS'] ?? '') !== '1') reply(['error' => 'Missing request header.'], 403);

    if ($action === 'session' && $method === 'GET') {
        $account = current_account();
        session_write_close();
        reply(['account' => $account]);
    }
    if ($action === 'login' && $method === 'POST') {
        $body = json_body();
        $account = login((string) ($body['username'] ?? ''), (string) ($body['password'] ?? ''));
        if (!$account) reply(['error' => 'Username or password is incorrect.'], 401);
        reply(['account' => $account]);
    }
    if ($action === 'logout' && $method === 'POST') { logout(); reply(['ok' => true]); }

    $account = current_account();
    session_write_close();
    if (!$account) reply(['error' => 'Please sign in again.'], 401);
    $user = $account['username'];

    if ($action === 'data' && $method === 'GET') reply(['doc' => load_doc($account), 'account' => $account]);

    if ($action === 'ops' && $method === 'POST') {
        $body = json_body();
        load_doc($account);
        $doc = with_lock($user, function () use ($user, $body) {
            $doc = read_doc($user) ?? new_doc();
            $doc = apply_ops($doc, $body['ops'] ?? null);
            write_doc($user, $doc);
            return $doc;
        });
        reply(['doc' => $doc]);
    }

    if ($action === 'reset-demo' && $method === 'POST') {
        if (!$account['isDemo']) reply(['error' => 'Only the demo account can be reset.'], 403);
        $doc = with_lock($user, function () use ($user) { $doc = demo_doc(); write_doc($user, $doc); return $doc; });
        reply(['doc' => $doc]);
    }

    if ($action === 'upload' && $method === 'POST') {
        $file = $_FILES['image'] ?? null;
        if (!$file || !is_scalar($file['error'] ?? null) || $file['error'] !== UPLOAD_ERR_OK) reply(['error' => 'Upload failed. Choose an image under 8 MB.'], 400);
        if (!is_uploaded_file($file['tmp_name'])) reply(['error' => 'Invalid uploaded file.'], 400);
        reply(['image' => store_image($user, $file['tmp_name'])], 201);
    }
    if ($action === 'images' && $method === 'GET') reply(['images' => list_images($user)]);
    if ($action === 'image' && $method === 'GET') {
        $bytes = read_image($user, (string) ($_GET['id'] ?? ''));
        if ($bytes === null) reply(['error' => 'Image not found.'], 404);
        $info = getimagesizefromstring($bytes);
        header('Content-Type: ' . $info['mime']);
        header('Content-Length: ' . strlen($bytes));
        header('Cache-Control: private, max-age=86400');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        echo $bytes;
        exit;
    }
    reply(['error' => 'Unknown action or unsupported method.'], 405);
} catch (InvalidArgumentException $e) {
    reply(['error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    error_log('appts: ' . $e->getMessage());
    reply(['error' => 'Storage is unavailable. Check that storage/ is writable by PHP.'], 500);
}
