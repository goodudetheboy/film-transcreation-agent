#!/usr/bin/env bash
set -euo pipefail

# One-click local dev: installs dependencies, creates .env files from their
# .env.example templates (never overwrites an existing .env), and starts both
# the backend and frontend dev servers together. Ctrl+C stops both.

cd "$(dirname "${BASH_SOURCE[0]}")/.."  # repo root, regardless of where this is run from

BACKEND_PORT="${PORT:-8787}"
FRONTEND_PORT=5173  # Vite's default — change via `vite --port` if you need something else

echo "==> Installing dependencies (npm install)…"
npm install

for pkg in backend frontend; do
  if [ ! -f "$pkg/.env" ] && [ -f "$pkg/.env.example" ]; then
    cp "$pkg/.env.example" "$pkg/.env"
    echo "==> Created $pkg/.env from $pkg/.env.example (edit SHARED_PASSCODE etc. as needed)"
  fi
done

BACKEND_PID=""
FRONTEND_PID=""

# `npm run dev:X &` spawns a process TREE (npm -> npm -w X -> tsx/vite). Killing
# just the top PID often leaves the tsx/vite child alive on Windows, since
# process trees aren't torn down together the way Unix process groups are.
# taskkill /T kills the whole tree rooted at a PID — that's the real fix;
# the port-based sweep below is just a last-resort safety net on top of it.
kill_tree() {
  local pid="$1"
  [ -z "$pid" ] && return 0
  if command -v taskkill.exe >/dev/null 2>&1; then
    taskkill.exe //F //T //PID "$pid" >/dev/null 2>&1 || true
  else
    kill "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  echo ""
  echo "==> Stopping dev servers…"
  kill_tree "$BACKEND_PID"
  kill_tree "$FRONTEND_PID"
  sleep 1
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command \
      "Get-NetTCPConnection -LocalPort $BACKEND_PORT,$FRONTEND_PORT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }" \
      >/dev/null 2>&1 || true
  fi
  echo "==> Stopped."
}
trap cleanup EXIT INT TERM

echo "==> Starting backend on :$BACKEND_PORT"
npm run dev:backend &
BACKEND_PID=$!

echo "==> Starting frontend on :$FRONTEND_PORT"
npm run dev:frontend &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:$BACKEND_PORT/health"
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Press Ctrl+C to stop both."
echo ""

wait
