#!/usr/bin/env bash
# Start dev stack when API is down. Called from sessionStart (see hooks.json).
# If only Vite is running, starts API only to avoid EADDRINUSE on :5173.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 0

if curl -sf --connect-timeout 1 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  exit 0
fi

mkdir -p "$ROOT/.cursor"
PIDFILE="$ROOT/.cursor/dev-server.pid"
LOG="$ROOT/.cursor/dev.log"

if [[ -f "$PIDFILE" ]]; then
  PID="$(tr -d ' \n' <"$PIDFILE" 2>/dev/null || true)"
  if [[ -n "${PID:-}" ]] && kill -0 "$PID" 2>/dev/null; then
    exit 0
  fi
  rm -f "$PIDFILE"
fi

if command -v lsof >/dev/null 2>&1 && lsof -iTCP:5173 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  nohup npm run dev:server >>"$LOG" 2>&1 &
else
  nohup npm run dev >>"$LOG" 2>&1 &
fi
echo $! >"$PIDFILE"
exit 0
