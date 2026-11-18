#!/bin/sh
# Serve Appts locally with upload limits large enough for 20 MB PDFs.
# Usage: tools/serve.sh [port]   (default 8631; avoid 8099 8416 8500 8505 8518 8554)
cd "$(dirname "$0")/.." || exit 1
exec php -d upload_max_filesize=20M -d post_max_size=24M -d memory_limit=256M -S "127.0.0.1:${1:-8631}" -t . tools/router.php
