#!/bin/sh
# Runs every automated gate: PHP lint, storage, domain/schema, API (real php -S), browser (Playwright).
# Usage: sh tests/run-all.sh [--no-screens]
set -e
cd "$(dirname "$0")/.."
echo "== php -l"
find . -name '*.php' -not -path './storage/*' -print0 | xargs -0 -n1 php -l >/dev/null
echo "ok - all PHP files lint clean"
echo "== storage";  php tests/storage.test.php | tail -1
echo "== schema";   node tests/schema.test.mjs | tail -3
echo "== api";      python3 tests/api.test.py | tail -1
# Screenshot runs use installed Google Chrome (temporary profile) so the PDF viewer renders; headless-shell has none.
if [ "$1" = "--screens" ] && [ -z "$APPTS_BROWSER_CHANNEL" ] && [ -d "/Applications/Google Chrome.app" ]; then export APPTS_BROWSER_CHANNEL=chrome; fi
echo "== browser";  python3 tests/browser.test.py "${1:---no-screens}" | tail -1
echo "ALL GATES PASS"
