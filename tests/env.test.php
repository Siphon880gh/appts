<?php
declare(strict_types=1);
// .env loader (t35u): parsing, APP_BASE_URL normalizing, and the no-.env fallback. Never reads the real .env.
$checks = 0;
function ok(bool $cond, string $what): void { global $checks; $checks++; if (!$cond) { fwrite(STDERR, "FAIL: $what\n"); exit(1); } }
$f = tempnam(sys_get_temp_dir(), 'env');
putenv('APPTS_ENV_FILE=' . $f); putenv('APP_BASE_URL'); putenv('APP_ENV');
require __DIR__ . '/../includes/env.php';
$p = env_parse("# comment\n\nAPP_ENV=production\nexport A=1\nB = \"two words\" \nC='x # y'\nD=plain # note\nbad key=1\nNOEQ\n");
ok($p === ['APP_ENV' => 'production', 'A' => '1', 'B' => 'two words', 'C' => 'x # y', 'D' => 'plain'], 'parses comments, export, quotes, inline comments; skips bad lines');
file_put_contents($f, "APP_ENV=local\nAPP_BASE_URL=http://localhost:8888/weng/app/healthcare/appts\n");
ok(app_base_url() === 'http://localhost:8888/weng/app/healthcare/appts/' && app_env() === 'local', 'APP_BASE_URL gets a trailing slash; APP_ENV read');
putenv('APP_BASE_URL=https://wengindustries.com/app/healthcare/appts/');
ok(app_base_url() === 'https://wengindustries.com/app/healthcare/appts/', 'a real environment variable wins over the file');
putenv('APP_BASE_URL=javascript:alert(1)');
ok(app_base_url() === '', 'a non-http(s) base URL is ignored');
putenv('APP_BASE_URL'); putenv('APP_ENV=staging');
ok(app_env() === 'local', 'unknown APP_ENV falls back to local');
$ex = env_parse((string) file_get_contents(__DIR__ . '/../.example.env'));
$raw = (string) file_get_contents(__DIR__ . '/../.example.env');
ok(($ex['APP_BASE_URL'] ?? '') === 'http://localhost:8888/weng/app/healthcare/appts/' && strpos($raw, '# APP_BASE_URL=https://wengindustries.com/app/healthcare/appts/') !== false, '.example.env has the local URL and the production URL commented');
unlink($f);
$ign = shell_exec('cd ' . escapeshellarg(dirname(__DIR__)) . ' && git check-ignore .env 2>/dev/null');
ok(trim((string) $ign) === '.env', '.env is git-ignored');
echo "PASS: $checks .env checks.\n";
