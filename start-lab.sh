#!/usr/bin/env bash
set -euo pipefail

# ── Monet Style Lab — All services for /style-lab ──
# Starts: Vite frontend, Fastify API, Python audio worker, Python AI worker, Redis
# Usage: bash start-lab.sh

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"

PIDS=()

cleanup() {
  trap - EXIT INT TERM
  echo ""
  echo -e "🛑 ${YELLOW}Stopping Style Lab services...${NC}"
  for PID in "${PIDS[@]:-}"; do
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
    fi
  done
  sleep 1
  for PID in "${PIDS[@]:-}"; do
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
  done
  echo -e "✅ ${GREEN}All stopped.${NC}"
}
trap cleanup EXIT INT TERM

kill_port() {
  local pids
  pids="$(lsof -ti tcp:"$1" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    echo -e "   ${DIM}Killed port $1${NC}"
  fi
}

wait_for() {
  local name="$1" url="$2" log="$3" max="${4:-30}"
  echo -e "⏳ ${YELLOW}Waiting for $name...${NC}"
  for i in $(seq 1 "$max"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo -e "✅ ${GREEN}$name ready${NC}"
      return 0
    fi
    if [ "$i" -eq "$max" ]; then
      echo -e "❌ ${RED}$name failed to start${NC}"
      echo -e "   ${DIM}Last 20 lines of $log:${NC}"
      tail -20 "$log" 2>/dev/null || true
      return 1
    fi
    sleep 1
  done
}

echo -e "🎬 ${BOLD}Starting Monet Style Lab...${NC}"
echo "────────────────────────────────────────"

cd "$ROOT_DIR"

# ── Kill stale ports ──
echo -e "🧹 ${YELLOW}Clearing ports...${NC}"
for PORT in 3000 5173 8101 8102 6379; do
  kill_port "$PORT"
done

# ── Redis ──
echo -e "🗄️  ${YELLOW}Checking Redis...${NC}"
if command -v redis-cli &>/dev/null && redis-cli ping 2>/dev/null | grep -q "PONG"; then
  echo -e "✅ ${GREEN}Redis already running${NC}"
else
  if command -v redis-server &>/dev/null; then
    redis-server --daemonize yes 2>/dev/null || true
    sleep 1
    if redis-cli ping 2>/dev/null | grep -q "PONG"; then
      echo -e "✅ ${GREEN}Redis started${NC}"
    else
      echo -e "⚠️  ${YELLOW}Redis not available — queues won't work (non-blocking)${NC}"
    fi
  else
    echo -e "⚠️  ${YELLOW}Redis not installed — queues won't work (non-blocking)${NC}"
    echo -e "   ${DIM}Install: brew install redis${NC}"
  fi
fi

# ── Python Audio Worker (port 8101) ──
echo -e "🔊 ${YELLOW}Starting Python Audio Worker (8101)...${NC}"
(
  cd "$ROOT_DIR/workers/python-audio"
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv 2>/dev/null || python3.11 -m venv .venv 2>/dev/null || true
  fi
  if [ -d ".venv" ]; then
    source .venv/bin/activate
    pip install -q -r requirements.txt 2>/dev/null || true
    exec python -m uvicorn app:app --host 127.0.0.1 --port 8101
  else
    echo "No Python venv — skipping audio worker"
  fi
) > "$LOG_DIR/python-audio.log" 2>&1 &
PIDS+=("$!")

# ── Python AI Worker (port 8102) ──
echo -e "🧠 ${YELLOW}Starting Python AI Worker (8102)...${NC}"
(
  cd "$ROOT_DIR/workers/python-ai"
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv 2>/dev/null || python3.11 -m venv .venv 2>/dev/null || true
  fi
  if [ -d ".venv" ]; then
    source .venv/bin/activate
    pip install -q -r requirements.txt 2>/dev/null || true
    exec python -m uvicorn app:app --host 127.0.0.1 --port 8102
  else
    echo "No Python venv — skipping AI worker"
  fi
) > "$LOG_DIR/python-ai.log" 2>&1 &
PIDS+=("$!")

# ── Fastify API (port 3000) ──
echo -e "⚡ ${YELLOW}Starting API server (3000)...${NC}"
(
  cd "$ROOT_DIR"
  exec pnpm dev:api
) > "$LOG_DIR/api.log" 2>&1 &
PIDS+=("$!")

# ── Vite Frontend (port 5173) ──
echo -e "🌐 ${YELLOW}Starting Vite frontend (5173)...${NC}"
(
  cd "$ROOT_DIR"
  exec npx vite dev --port 5173 --host 0.0.0.0
) > "$LOG_DIR/vite.log" 2>&1 &
PIDS+=("$!")

# ── Wait for services ──
echo ""
wait_for "Python Audio" "http://127.0.0.1:8101/health" "$LOG_DIR/python-audio.log" 45 || true
wait_for "Python AI" "http://127.0.0.1:8102/health" "$LOG_DIR/python-ai.log" 45 || true
wait_for "API Server" "http://127.0.0.1:3000/health" "$LOG_DIR/api.log" 30 || true
wait_for "Vite Frontend" "http://127.0.0.1:5173" "$LOG_DIR/vite.log" 30 || true

# ── Summary ──
echo ""
echo -e "────────────────────────────────────────"
echo -e "✨ ${GREEN}${BOLD}Style Lab is ONLINE${NC}"
echo ""
echo -e "  ${BOLD}Frontend:${NC}  ${BLUE}http://localhost:5173/style-lab${NC}"
echo -e "  ${BOLD}API:${NC}       ${BLUE}http://localhost:3000${NC}"
echo -e "  ${BOLD}Audio:${NC}     ${BLUE}http://localhost:8101${NC}"
echo -e "  ${BOLD}AI:${NC}        ${BLUE}http://localhost:8102${NC}"
echo ""
echo -e "  ${DIM}Logs: $LOG_DIR${NC}"
echo -e "  ${DIM}tail -f $LOG_DIR/api.log${NC}"
echo -e "────────────────────────────────────────"
echo "Press Ctrl+C to stop all services."
echo ""

wait
