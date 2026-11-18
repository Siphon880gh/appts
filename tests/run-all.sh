#!/bin/sh
# Runs every automated gate: PHP lint (current PHP and PHP 7.4), storage, intake CLI, domain/schema, API (real php -S), browser (Playwright).
# Usage: sh tests/run-all.sh [--screens|--no-screens]
#   APPTS_PHP=/path/to/php      run the whole suite (php -r, php -S) with that binary
#   APPTS_PHP74=/path/to/php7.4 PHP 7.4 binary for the compatibility gate (default: MAMP's)
set -e
cd "$(dirname "$0")/.."
PHP="${APPTS_PHP:-php}"
PHP74="${APPTS_PHP74:-/Applications/MAMP/bin/php/php7.4.33/bin/php}"
echo "== php -l ($("$PHP" -r 'echo PHP_VERSION;'))"
find . -name '*.php' -not -path './storage/*' -print0 | xargs -0 -n1 "$PHP" -l >/dev/null
echo "ok - all PHP files lint clean"
echo "== PHP 7.4 compatibility (G27)"
if [ -x "$PHP74" ]; then
  find . -name '*.php' -not -path './storage/*' -print0 | xargs -0 -n1 "$PHP74" -l >/dev/null
  echo "ok - all PHP files lint clean on $("$PHP74" -r 'echo PHP_VERSION;')"
  "$PHP74" tests/storage.test.php | tail -1
  APPTS_PHP="$PHP74" "$PHP74" tests/intake.test.php | tail -1
else
  echo "FAIL: PHP 7.4 binary not found at $PHP74 (set APPTS_PHP74)"; exit 1
fi
echo "== storage";  "$PHP" tests/storage.test.php | tail -1
echo "== intake CLI"; APPTS_PHP="$PHP" "$PHP" tests/intake.test.php | tail -1
echo "== schema";   node tests/schema.test.mjs | tail -3
echo "== api";      python3 tests/api.test.py | tail -1
# Screenshot runs use installed Google Chrome (temporary profile) so the PDF viewer renders; headless-shell has none.
if [ "$1" = "--screens" ] && [ -z "$APPTS_BROWSER_CHANNEL" ] && [ -d "/Applications/Google Chrome.app" ]; then export APPTS_BROWSER_CHANNEL=chrome; fi
echo "== browser";  python3 tests/browser.test.py "${1:---no-screens}" | tail -1
echo "ALL GATES PASS"
