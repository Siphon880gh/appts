<?php
declare(strict_types=1);
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/domain.php';
require_once __DIR__ . '/includes/demo-seed.php';
require_once __DIR__ . '/includes/uploads.php';
require_once __DIR__ . '/includes/offline.php';

if (!ini_get('date.timezone')) date_default_timezone_set('America/Los_Angeles');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

/** Sends JSON and exits (never returns). */
function reply(array $body, int $status = 200): void {
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
    $doc = migrate_stored_doc($account['username']);
    if ($doc !== null) return normalize_doc($doc);
    return with_lock($account['username'], function () use ($account) {
        $doc = read_doc($account['username']);
        if ($doc === null) {
            if ($account['isDemo']) write_demo_files($account['username']);
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

    // The one request Offline mode lets through to the network: is there a newer version of the app?
    if ($action === 'version' && $method === 'GET') reply(['version' => app_version()]);
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
    // What Offline mode saves for this account only: shell, views, data, and this account's uploads.
    if ($action === 'offline-plan' && $method === 'GET') reply(offline_plan($user, load_doc($account)));

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
        $doc = with_lock($user, function () use ($user) { write_demo_files($user); $doc = demo_doc(); write_doc($user, $doc); return $doc; });
        reply(['doc' => $doc]);
    }

    if ($action === 'upload' && $method === 'POST') {
        $file = $_FILES['file'] ?? $_FILES['image'] ?? null;
        if (!$file && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) reply(['error' => 'That file is larger than this server accepts. Start PHP with tools/serve.sh (20 MB limit).'], 413);
        $error = is_array($file) ? ($file['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) reply(['error' => 'That file is larger than this server accepts. Start PHP with tools/serve.sh (20 MB limit).'], 413);
        if ($error !== UPLOAD_ERR_OK) reply(['error' => 'Upload failed. Choose a PDF (20 MB) or image (8 MB).'], 400);
        if (!is_uploaded_file($file['tmp_name'])) reply(['error' => 'Invalid uploaded file.'], 400);
        $stored = store_upload($user, $file['tmp_name']);
        $stored['name'] = mb_substr(basename((string) ($file['name'] ?? '')) ?: ($stored['kind'] === 'pdf' ? 'Document.pdf' : 'Image'), 0, 200);
        reply(['file' => $stored, 'image' => $stored], 201);
    }
    if ($action === 'images' && $method === 'GET') reply(['images' => list_uploads($user, true)]);
    if ($action === 'files' && $method === 'GET') reply(['files' => list_uploads($user)]);
    if (($action === 'image' || $action === 'file') && $method === 'GET') {
        $id = (string) ($_GET['id'] ?? '');
        $bytes = read_upload($user, $id);
        if ($bytes === null) reply(['error' => 'File not found.'], 404);
        $info = inspect_file_bytes($bytes);
        header('Content-Type: ' . $info['mime']);
        header('Content-Length: ' . strlen($bytes));
        header('Cache-Control: private, max-age=86400');
        $name = preg_replace('/[^A-Za-z0-9._ -]/', '', (string) ($_GET['name'] ?? '')) ?: $id;
        header('Content-Disposition: ' . (isset($_GET['download']) ? 'attachment' : 'inline') . '; filename="' . $name . '"');
        // Images are sandboxed; PDFs keep the browser's built-in viewer working (it breaks under a sandbox CSP).
        if ($info['kind'] === 'image') header("Content-Security-Policy: default-src 'none'; sandbox");
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
