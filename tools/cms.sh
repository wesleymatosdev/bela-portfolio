#!/usr/bin/env bash
# Local CMS for bela-portfolio: serves the repo root and opens the Sveltia admin.
# In the admin, pick "Work with Local Repository" and select the repo folder —
# edits write straight to the files; commit+push when happy.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-8123}"
echo "→ CMS: http://localhost:${PORT}/admin/  (Ctrl+C to stop)"
echo "→ In Sveltia choose: Work with Local Repository → select this repo folder"
sleep 1
( sleep 2; open "http://localhost:${PORT}/admin/" ) &
python3 -m http.server "$PORT" --bind 127.0.0.1
