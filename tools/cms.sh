#!/usr/bin/env bash
# bela-portfolio CMS server.
#   TAILNET  https://macbook.tailfddf66.ts.net/bela-cms/admin/   (any device; use "Sign In Using Access Token")
#   LOCAL    http://localhost:8125/admin/                        (Mac only; "Work with Local Repository" — no auth, writes files directly)
# Stop with Ctrl+C (tailscale path stays armed; it 502s when the server is down).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=8125
tailscale serve --bg --set-path /bela-cms http://127.0.0.1:$PORT >/dev/null 2>&1 || true
echo "→ TAILNET: https://macbook.tailfddf66.ts.net/bela-cms/admin/"
echo "→ LOCAL:   http://localhost:$PORT/admin/  (Work with Local Repository → pick the repo folder)"
( sleep 1.5; open "http://localhost:$PORT/admin/" ) &
exec python3 -m http.server $PORT --bind 127.0.0.1
