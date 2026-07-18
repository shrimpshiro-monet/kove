#!/bin/bash
# Monet AI - Unified Studio Launcher Script
# Starts Redis, Python audio/AI workers, Fastify API, worker-node, and Vite frontend.

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.logs"

mkdir -p "$LOG_DIR"

PIDS=()

cleanup() {
  # Disable traps immediately to prevent recursion
  trap - EXIT INT TERM

  echo ""
  echo -e "🛑 ${YELLOW}Stopping Monet dev services...${NC}"

  for PID in "${PIDS[@]:-}"; do
    if [ -n "$PID" ] && kill -0 "$PID" >/dev/null 2>&1; then
      kill "$PID" >/dev/null 2>&1 || true
    fi
  done

  sleep 1

  for PID in "${PIDS[@]:-}"; do
    if [ -n "$PID" ] && kill -0 "$PID" >/dev/null 2>&1; then
      kill -9 "$PID" >/dev/null 2>&1 || true
    fi
  done

  echo -e "✅ ${GREEN}Stopped.${NC}"
}

trap cleanup EXIT INT TERM

print_log_hint() {
  echo -e "   ${BLUE}log:${NC} $1"
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  local max_attempts="${4:-30}"

  echo -e "⏳ ${YELLOW}Waiting for $name...${NC}"

  for ATTEMPT in $(seq 1 "$max_attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo -e "✅ ${GREEN}$name is healthy.${NC}"
      return 0
    fi

    if [ "$ATTEMPT" -eq "$max_attempts" ]; then
      echo -e "❌ ${RED}$name did not become healthy: $url${NC}"
      print_log_hint "$log_file"
      echo ""
      echo -e "${YELLOW}Last 80 log lines:${NC}"
      tail -n 80 "$log_file" || true
      exit 1
    fi

    sleep 1
  done
}

kill_port() {
  local port="$1"
  local pids

  pids="$(lsof -ti tcp:"$port" || true)"

  if [ -n "$pids" ]; then
    echo -e "   ${YELLOW}Killing existing process on port $port: $pids${NC}"
    kill -9 $pids >/dev/null 2>&1 || true
  fi
}

echo -e "🎬 ${BOLD}Starting Monet AI Video Editor Studio...${NC}"
echo "--------------------------------------------------------"

cd "$ROOT_DIR"

echo -e "🧹 ${YELLOW}Clearing port conflicts...${NC}"
for PORT in 3000 5173 8787 8788 8101 8102 5005; do
  kill_port "$PORT"
done

echo -e "🗄️  ${YELLOW}Verifying Redis...${NC}"
if redis-cli ping | grep -q "PONG"; then
  echo -e "✅ ${GREEN}Redis is running and healthy on port 6379.${NC}"
else
  echo -e "⚠️  ${RED}Redis is offline. Starting local Redis Server...${NC}"
  redis-server --daemonize yes || true
  sleep 1

  if redis-cli ping | grep -q "PONG"; then
    echo -e "✅ ${GREEN}Redis started successfully.${NC}"
  else
    echo -e "❌ ${RED}Redis failed to start. Install it with: brew install redis${NC}"
    exit 1
  fi
fi

echo -e "🔊 ${YELLOW}Starting Python Audio Worker on port 8101...${NC}"
(
  cd "$ROOT_DIR/workers/python-audio"

  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi

  source .venv/bin/activate
  python -m pip install --upgrade pip >/dev/null
  python -m pip install -r requirements.txt

  exec python -m uvicorn app:app --host 127.0.0.1 --port 8101
) > "$LOG_DIR/python-audio.log" 2>&1 &
PIDS+=("$!")
print_log_hint "$LOG_DIR/python-audio.log"

echo -e "🧠 ${YELLOW}Starting Python AI Worker on port 8102...${NC}"
(
  cd "$ROOT_DIR/workers/python-ai"

  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi

  source .venv/bin/activate
  python -m pip install --upgrade pip >/dev/null
  python -m pip install -r requirements.txt

  exec python -m uvicorn app:app --host 127.0.0.1 --port 8102
) > "$LOG_DIR/python-ai.log" 2>&1 &
PIDS+=("$!")
print_log_hint "$LOG_DIR/python-ai.log"

echo -e "🎵 ${YELLOW}Starting Media Sidecar (librosa/ffmpeg) on port 5005...${NC}"
(
  cd "$ROOT_DIR/sidecar"

  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi

  source .venv/bin/activate
  python -m pip install --upgrade pip >/dev/null
  python -m pip install -r requirements.txt

  exec python -m uvicorn media-sidecar:app --host 127.0.0.1 --port 5005
) > "$LOG_DIR/media-sidecar.log" 2>&1 &
PIDS+=("$!")
print_log_hint "$LOG_DIR/media-sidecar.log"

echo -e "⚡ ${YELLOW}Starting Fastify REST API on port 3000...${NC}"
(
  cd "$ROOT_DIR"
  exec pnpm dev:api
) > "$LOG_DIR/api.log" 2>&1 &
PIDS+=("$!")
print_log_hint "$LOG_DIR/api.log"

echo -e "🧵 ${YELLOW}Starting Node Queue Worker...${NC}"
(
  cd "$ROOT_DIR"
  exec pnpm dev:worker
) > "$LOG_DIR/worker-node.log" 2>&1 &
PIDS+=("$!")
print_log_hint "$LOG_DIR/worker-node.log"

echo -e "🌐 ${YELLOW}Starting Wrangler API on port 8788...${NC}"
(
  cd "$ROOT_DIR"
  exec npx wrangler dev --port 8788 --host 127.0.0.1
) > "$LOG_DIR/wrangler.log" 2>&1 &
PIDS+=("$!")
print_log_hint "$LOG_DIR/wrangler.log"

echo -e "🎨 ${YELLOW}Starting Vite Frontend on port 8787...${NC}"
(
  cd "$ROOT_DIR"
  exec npx vite --port 8787 --host 127.0.0.1
) > "$LOG_DIR/vite.log" 2>&1 &
PIDS+=("$!")
print_log_hint "$LOG_DIR/vite.log"

echo "--------------------------------------------------------"

wait_for_http "Python Audio Service" "http://127.0.0.1:8101/health" "$LOG_DIR/python-audio.log" 60
wait_for_http "Python AI Service" "http://127.0.0.1:8102/health" "$LOG_DIR/python-ai.log" 60
wait_for_http "Media Sidecar" "http://127.0.0.1:5005/health" "$LOG_DIR/media-sidecar.log" 60
wait_for_http "Fastify REST API" "http://127.0.0.1:3000/health" "$LOG_DIR/api.log" 30
wait_for_http "Vite Frontend" "http://127.0.0.1:8787" "$LOG_DIR/vite.log" 30
wait_for_http "Wrangler API" "http://127.0.0.1:8788" "$LOG_DIR/wrangler.log" 30

echo "--------------------------------------------------------"
echo -e "✨ ${GREEN}${BOLD}Monet AI Studio is ONLINE.${NC}"
echo ""
echo -e "🔗 ${BOLD}Frontend UI:${NC}          ${BLUE}http://127.0.0.1:8787${NC}"
echo -e "🔗 ${BOLD}Wrangler API:${NC}         ${BLUE}http://127.0.0.1:8788${NC}"
echo -e "🔗 ${BOLD}Fastify REST API:${NC}     ${BLUE}http://127.0.0.1:3000${NC}"
echo -e "🔗 ${BOLD}Python Audio Service:${NC} ${BLUE}http://127.0.0.1:8101${NC}"
echo -e "🔗 ${BOLD}Python AI Service:${NC}    ${BLUE}http://127.0.0.1:8102${NC}"
echo -e "🔗 ${BOLD}Media Sidecar:${NC}        ${BLUE}http://127.0.0.1:5005${NC}"
echo ""
echo -e "📁 ${BOLD}Logs:${NC} $LOG_DIR"
echo ""
echo -e "Useful debug commands:"
echo -e "  ${BLUE}tail -f .logs/api.log${NC}"
echo -e "  ${BLUE}tail -f .logs/vite.log${NC}"
echo -e "  ${BLUE}curl -i http://127.0.0.1:3000/health${NC}"
echo -e "  ${BLUE}curl -i http://127.0.0.1:8787/api/analyze${NC}"
echo "--------------------------------------------------------"
echo "Press Ctrl+C to terminate all services."

wait
