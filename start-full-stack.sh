#!/bin/bash
# Monet AI Video Editor — Full Stack Startup
# Starts all services: Python analysis, CutClaw, Thinking, Vite dev server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE="$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           MONET AI VIDEO EDITOR — FULL STACK           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down all services...${NC}"
    kill $(cat /tmp/monet-analysis.pid 2>/dev/null) 2>/dev/null
    kill $(cat /tmp/monet-cutclaw.pid 2>/dev/null) 2>/dev/null
    kill $(cat /tmp/monet-thinking.pid 2>/dev/null) 2>/dev/null
    kill $(cat /tmp/monet-beatsync.pid 2>/dev/null) 2>/dev/null
    kill $(cat /tmp/monet-vite.pid 2>/dev/null) 2>/dev/null
    rm -f /tmp/monet-*.pid /tmp/monet-*.log
    echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT INT TERM

# Kill any existing processes on our ports
for port in 8103 8104 8105 8106 8787; do
    lsof -ti:$port | xargs kill 2>/dev/null || true
done
sleep 1

echo -e "${BLUE}[1/5] Starting Analysis Service (port 8105)...${NC}"
cd "$WORKTREE/workers/monet-analysis-service"
pip install -q -r requirements.txt 2>/dev/null || true
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8105 > /tmp/monet-analysis.log 2>&1 &
echo $! > /tmp/monet-analysis.pid
sleep 2
if curl -s http://localhost:8105/docs > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Analysis service running${NC}"
else
    echo -e "  ${RED}✗ Analysis service failed — check /tmp/monet-analysis.log${NC}"
fi

echo -e "${BLUE}[2/5] Starting BeatSync Service (port 8103)...${NC}"
cd "$WORKTREE/workers/beatsync-service"
pip install -q -r requirements.txt 2>/dev/null || true
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8103 > /tmp/monet-beatsync.log 2>&1 &
echo $! > /tmp/monet-beatsync.pid
sleep 2
if curl -s http://localhost:8103/docs > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ BeatSync service running${NC}"
else
    echo -e "  ${RED}✗ BeatSync service failed — check /tmp/monet-beatsync.log${NC}"
fi

echo -e "${BLUE}[3/5] Starting CutClaw Service (port 8104)...${NC}"
cd "$WORKTREE/workers/cutclaw-service"
pip install -q -r requirements.txt 2>/dev/null || true
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8104 > /tmp/monet-cutclaw.log 2>&1 &
echo $! > /tmp/monet-cutclaw.pid
sleep 3
if curl -s http://localhost:8104/docs > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ CutClaw service running${NC}"
else
    echo -e "  ${YELLOW}⚠ CutClaw service failed (optional) — check /tmp/monet-cutclaw.log${NC}"
fi

echo -e "${BLUE}[4/5] Starting Thinking Service (port 8106)...${NC}"
cd "$WORKTREE/workers/thinking-service"
pip install -q -r requirements.txt 2>/dev/null || true
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8106 > /tmp/monet-thinking.log 2>&1 &
echo $! > /tmp/monet-thinking.pid
sleep 2
if curl -s http://localhost:8106/docs > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Thinking service running${NC}"
else
    echo -e "  ${YELLOW}⚠ Thinking service failed (optional) — check /tmp/monet-thinking.log${NC}"
fi

echo -e "${BLUE}[5/5] Starting Vite Dev Server (port 8787)...${NC}"
cd "$WORKTREE"
nohup npx vite dev > /tmp/monet-vite.log 2>&1 &
echo $! > /tmp/monet-vite.pid
sleep 5
if curl -s http://localhost:8787 > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Vite dev server running${NC}"
else
    echo -e "  ${YELLOW}⚠ Vite still starting — check /tmp/monet-vite.log${NC}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                    ALL SERVICES UP                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Analysis:  http://localhost:8105  (audio/scenes/faces) ║"
echo "║  BeatSync:  http://localhost:8103  (audio analysis)     ║"
echo "║  CutClaw:   http://localhost:8104  (long-form planning) ║"
echo "║  Thinking:  http://localhost:8106  (AI director)        ║"
echo "║  Frontend:  http://localhost:8787  (web app)             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep running
wait
