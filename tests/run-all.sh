#!/bin/sh
# Runs every automated gate: PHP lint (current PHP and PHP 7.4), storage, intake CLI, PDF thumbnails, domain/schema, offline merge, API (real php -S), browser, Offline mode, and Disruptions + @mentions (Playwright).
# Usage: sh tests/run-all.sh [--screens|--no-screens]
#   APPTS_PHP=/path/to/php      run the whole suite (php -r, php -S) with that binary
#   APPTS_PHP74=/path/to/php7.4 PHP 7.4 binary for the compatibility gate (default: MAMP's)
set -e
cd "$(dirname "$0")/.."
# step NAME LINES CMD...: run CMD, show its last LINES lines, and stop the suite if it fails
# (a plain `cmd | tail` would hide the exit status).
step() {
  name=$1; lines=$2; shift 2; echo "== $name"
  if out=$("$@" 2>&1); then printf '%s\n' "$out" | tail -n "$lines"; else printf '%s\n' "$out" | tail -n 15; echo "FAIL: $name"; exit 1; fi
}
PHP="${APPTS_PHP:-php}"
PHP74="${APPTS_PHP74:-/Applications/MAMP/bin/php/php7.4.33/bin/php}"
echo "== php -l ($("$PHP" -r 'echo PHP_VERSION;'))"
find . -name '*.php' -not -path './storage/*' -print0 | xargs -0 -n1 "$PHP" -l >/dev/null
echo "ok - all PHP files lint clean"
echo "== PHP 7.4 compatibility (G27)"
if [ -x "$PHP74" ]; then
  find . -name '*.php' -not -path './storage/*' -print0 | xargs -0 -n1 "$PHP74" -l >/dev/null
  echo "ok - all PHP files lint clean on $("$PHP74" -r 'echo PHP_VERSION;')"
  step "storage (7.4)" 1 "$PHP74" tests/storage.test.php
  step ".env (7.4)" 1 "$PHP74" tests/env.test.php
  step "intake CLI (7.4)" 1 env APPTS_PHP="$PHP74" "$PHP74" tests/intake.test.php
  step "PDF thumbnails (7.4)" 1 "$PHP74" tests/thumbs.test.php
else
  echo "FAIL: PHP 7.4 binary not found at $PHP74 (set APPTS_PHP74)"; exit 1
fi
step storage 1 "$PHP" tests/storage.test.php
step "intake CLI" 1 env APPTS_PHP="$PHP" "$PHP" tests/intake.test.php
step ".env" 1 "$PHP" tests/env.test.php
step "PDF thumbnails" 1 "$PHP" tests/thumbs.test.php
step schema 3 node tests/schema.test.mjs
step merge 1 node tests/merge.test.mjs
step "disruptions + mentions (unit)" 1 node tests/disruptions-mentions.test.mjs
step api 1 python3 tests/api.test.py
# Screenshot runs use installed Google Chrome (temporary profile) so the PDF viewer renders; headless-shell has none.
if [ "$1" = "--screens" ] && [ -z "$APPTS_BROWSER_CHANNEL" ] && [ -d "/Applications/Google Chrome.app" ]; then export APPTS_BROWSER_CHANNEL=chrome; fi
step browser 1 python3 tests/browser.test.py "${1:---no-screens}"
step offline 1 python3 tests/offline.test.py "${1:---no-screens}"
step "disruptions + mentions" 1 python3 tests/disruptions-mentions.test.py "${1:---no-screens}"
step "UI extras (dialogs, previews, filters, memo)" 1 python3 tests/ui-extras.test.py "${1:---no-screens}"
step "PDF previews (server + browser fallback)" 1 python3 tests/thumbs.test.py "${1:---no-screens}"
echo "ALL GATES PASS"
