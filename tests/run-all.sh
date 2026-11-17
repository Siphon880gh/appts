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
echo "== browser";  python3 tests/browser.test.py "${1:---no-screens}" | tail -1
echo "ALL GATES PASS"
