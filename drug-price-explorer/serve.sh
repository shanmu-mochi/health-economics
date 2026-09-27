#!/usr/bin/env bash
# Serve the explorer locally.  Usage: ./serve.sh [port]   (default 8765)
set -euo pipefail
cd "$(dirname "$0")/site"
PORT="${1:-8765}"
echo "Medicare Drug Price Explorer → http://localhost:${PORT}/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
