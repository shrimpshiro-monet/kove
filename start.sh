#!/usr/bin/env bash
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

log()  { echo -e "${CYAN}[monet]${RESET} $*"; }
ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
err()  { echo -e "${RED}  ✗${RESET} $*"; }

# ── Config ──────────────────────────────────────────────────────────
PORTS=(3000 5173 8101 8102)
TURBO_CACHE=".turbo"
NODE_CACHE="node_modules/.cache"

# ── Phase 1: Kill existing processes ────────────────────────────────
log "Killing stale processes..."

killed=0
for port in "${PORTS[@]}"; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    ok "Killed process on port $port"
    ((killed++))
  fi
done

# Kill any lingering node/vite/tsx processes from this project
for pattern in "tsx watch.*server.ts" "tsx watch.*index.ts" "vite dev"; do
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    ok "Killed $pattern"
    ((killed++))
  fi
done

if [[ $killed -eq 0 ]]; then
  ok "No stale processes found"
fi

# Small delay for ports to release
sleep 1

# ── Phase 2: Clean caches ──────────────────────────────────────────
log "Cleaning caches..."

rm -rf "$TURBO_CACHE" 2>/dev/null && ok "Removed $TURBO_CACHE" || true
rm -rf "$NODE_CACHE" 2>/dev/null && ok "Removed $NODE_CACHE" || true
rm -rf apps/api/.turbo apps/web/.turbo apps/worker-node/.turbo 2>/dev/null && ok "Removed app-level turbo caches" || true

# ── Phase 3: Install dependencies ──────────────────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -3
ok "Dependencies installed"

# ── Phase 4: Create storage dir ────────────────────────────────────
mkdir -p apps/api/storage/uploads
ok "Storage directory ready"

# ── Phase 5: Start all services ────────────────────────────────────
log "Starting services..."
echo ""

# Trap to kill all child processes on exit
cleanup() {
  log "Shutting down..."
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null || true
  ok "All services stopped"
}
trap cleanup EXIT INT TERM

# Start Vite dev server (TanStack Start)
log "${DIM}Starting Vite dev server (port 5173)...${RESET}"
npx vite dev --port 5173 --host 0.0.0.0 &
VITE_PID=$!
sleep 3

# Start API server
log "${DIM}Starting API server (port 3000)...${RESET}"
pnpm dev:api &
API_PID=$!
sleep 3

# Start worker (optional — needs Redis)
# Uncomment if you have Redis running:
# log "${DIM}Starting render worker...${RESET}"
# pnpm dev:worker &
# WORKER_PID=$!

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  All services running!${RESET}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${CYAN}Web${RESET}      → http://localhost:5173"
echo -e "  ${CYAN}API${RESET}      → http://localhost:3000"
echo -e "  ${CYAN}Health${RESET}   → curl http://localhost:3000/health"
echo ""
echo -e "  ${DIM}Press Ctrl+C to stop all services${RESET}"
echo ""

# Wait for any child to exit
wait
