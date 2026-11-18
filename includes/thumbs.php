<?php
declare(strict_types=1);

// Page-1 thumbnails for PDF uploads (t64u). Stored next to the PDF as <sha>.thumb.jpg, guarded
// like every upload (<sha>.thumb.jpg.php). Generators are detected at runtime, in order: the
// Imagick extension, the Ghostscript CLI (gs), then poppler's pdftoppm. Nothing here is fatal:
// with no generator (e.g. shared hosting) there is simply no server thumbnail and the browser
// falls back to rendering page 1 itself, or the plain PDF tile.
// APPTS_THUMB_TOOL=imagick|gs|pdftoppm|none forces one (tests, troubleshooting).

const THUMB_WIDTH = 480;

function thumb_file(string $account, string $pdfId): string {
    if (!preg_match('/^[a-f0-9]{64}\.pdf$/D', $pdfId)) throw new InvalidArgumentException('Invalid file identifier.');
    return storage_dir('uploads', $account) . '/' . substr($pdfId, 0, 64) . '.thumb.jpg.php';
}

function thumb_can_exec(): bool {
    if (!function_exists('exec')) return false;
    $off = array_map('trim', explode(',', (string) ini_get('disable_functions')));
    return !in_array('exec', $off, true);
}

/** Absolute path of a CLI tool, looking in PATH plus the usual Homebrew/MacPorts/Linux spots (MAMP's Apache has a bare PATH). */
function thumb_find_bin(string $name): ?string {
    $dirs = array_merge(explode(PATH_SEPARATOR, (string) getenv('PATH')), ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin', '/bin']);
    foreach (array_unique(array_filter($dirs)) as $d) {
        $p = rtrim($d, '/') . '/' . $name;
        if (@is_file($p) && @is_executable($p)) return $p;
    }
    return null;
}

/** Generators usable here, best first. */
function thumb_generators(): array {
    $force = (string) getenv('APPTS_THUMB_TOOL');
    $all = [];
    if (extension_loaded('imagick') && class_exists('Imagick')) $all[] = 'imagick';
    if (thumb_can_exec() && thumb_find_bin('gs')) $all[] = 'gs';
    if (thumb_can_exec() && thumb_find_bin('pdftoppm')) $all[] = 'pdftoppm';
    if ($force === 'none') return [];
    return $force !== '' ? array_values(array_intersect($all, [$force])) : $all;
}

function thumb_is_jpeg(?string $b): bool {
    return is_string($b) && strlen($b) > 100 && strncmp($b, "\xFF\xD8", 2) === 0 && @getimagesizefromstring($b) !== false;
}

/** Render page 1 of a PDF file to JPEG bytes with one generator; null on any failure. */
function thumb_render(string $tool, string $pdfPath): ?string {
    try {
        if ($tool === 'imagick') {
            // Imagick reads PDFs through Ghostscript; give its delegate a PATH that can find gs.
            $gs = thumb_find_bin('gs');
            if ($gs) putenv('PATH=' . dirname($gs) . PATH_SEPARATOR . (string) getenv('PATH'));
            $im = new Imagick();
            $im->setResolution(72, 72);
            $im->readImage($pdfPath . '[0]');
            $im->setImageBackgroundColor('white');
            $im->setImageAlphaChannel(defined('Imagick::ALPHACHANNEL_REMOVE') ? Imagick::ALPHACHANNEL_REMOVE : 11);
            $im = $im->mergeImageLayers(Imagick::LAYERMETHOD_FLATTEN);
            $im->thumbnailImage(THUMB_WIDTH, 0);
            $im->setImageFormat('jpeg');
            $im->setImageCompressionQuality(82);
            $out = $im->getImageBlob();
            $im->clear();
            return thumb_is_jpeg($out) ? $out : null;
        }
        $tmp = tempnam(sys_get_temp_dir(), 'appts-th');
        if ($tmp === false) return null;
        $out = null;
        if ($tool === 'gs' && ($bin = thumb_find_bin('gs'))) {
            $cmd = escapeshellarg($bin) . ' -q -dSAFER -dBATCH -dNOPAUSE -dFirstPage=1 -dLastPage=1 -sDEVICE=jpeg -dJPEGQ=82 -r58 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile=' . escapeshellarg($tmp . '.jpg') . ' ' . escapeshellarg($pdfPath) . ' 2>&1';
            @exec($cmd, $lines, $code);
            if ($code === 0 && is_file($tmp . '.jpg')) $out = (string) file_get_contents($tmp . '.jpg');
        } elseif ($tool === 'pdftoppm' && ($bin = thumb_find_bin('pdftoppm'))) {
            $cmd = escapeshellarg($bin) . ' -f 1 -l 1 -singlefile -jpeg -scale-to ' . THUMB_WIDTH . ' ' . escapeshellarg($pdfPath) . ' ' . escapeshellarg($tmp) . ' 2>&1';
            @exec($cmd, $lines, $code);
            if ($code === 0 && is_file($tmp . '.jpg')) $out = (string) file_get_contents($tmp . '.jpg');
        }
        @unlink($tmp); @unlink($tmp . '.jpg');
        return thumb_is_jpeg($out) ? $out : null;
    } catch (Throwable $e) {
        return null;
    }
}

/** Make (or reuse) the thumbnail for a stored PDF. Returns the tool used, 'cached', or null. */
function make_pdf_thumb(string $account, string $pdfId, ?string $pdfBytes = null): ?string {
    try {
        $path = thumb_file($account, $pdfId);
        if (is_file($path)) return 'cached';
        $pdfBytes = $pdfBytes ?? read_guarded(storage_dir('uploads', $account) . '/' . $pdfId . '.php');
        if ($pdfBytes === null || strncmp($pdfBytes, '%PDF-', 5) !== 0) return null;
        $tools = thumb_generators();
        if (!$tools) return null;
        $tmp = tempnam(sys_get_temp_dir(), 'appts-pdf');
        if ($tmp === false || file_put_contents($tmp, $pdfBytes) === false) return null;
        try {
            foreach ($tools as $tool) {
                $jpg = thumb_render($tool, $tmp);
                if ($jpg !== null) { atomic_write($path, guarded_encode($jpg)); return $tool; }
            }
        } finally { @unlink($tmp); }
    } catch (Throwable $e) {}
    return null;
}

/** Thumbnail bytes for a PDF, generating lazily when a tool exists; null when there is none. */
function read_pdf_thumb(string $account, string $pdfId): ?string {
    $path = thumb_file($account, $pdfId);
    if (!is_file($path)) make_pdf_thumb($account, $pdfId);
    $b = is_file($path) ? read_guarded($path) : null;
    return thumb_is_jpeg($b) ? $b : null;
}
