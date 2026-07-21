#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Jalebi — Full Stack Startup
# Starts all services for local development
# ─────────────────────────────────────────────────────────────

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         🎬 JALEBI — Starting         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"

# ── Check prerequisites ──────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗ $1 not found. Install it first.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ $1 found${NC}"
}

echo -e "\n${YELLOW}Checking prerequisites...${NC}"
check_cmd docker
check_cmd node
check_cmd python3

# ── Check Docker is running ─────────────────────────────────

if ! docker info &>/dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running. Start Docker Desktop first.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# ── Check Cloudflare login ───────────────────────────────────

if ! npx wrangler whoami &>/dev/null 2>&1; then
  echo -e "${RED}✗ Not logged into Cloudflare. Run: npx wrangler login${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Cloudflare authenticated${NC}"

# ── Install dependencies ─────────────────────────────────────

echo -e "\n${YELLOW}Installing dependencies...${NC}"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# ── Start Python workers (Docker) ────────────────────────────

echo -e "\n${YELLOW}Starting Python workers + Redis...${NC}"
docker compose -f infra/docker-compose.yml up -d 2>/dev/null || \
  docker-compose -f infra/docker-compose.yml up -d 2>/dev/null || \
  echo -e "${RED}⚠ Docker compose failed — Python workers may not be available${NC}"

# Wait for services to be healthy
echo -n "Waiting for Python AI worker"
for i in {1..30}; do
  if curl -s http://localhost:8102/health &>/dev/null; then
    echo -e " ${GREEN}✓${NC}"
    break
  fi
  echo -n "."
  sleep 1
done

echo -n "Waiting for Python Audio worker"
for i in {1..30}; do
  if curl -s http://localhost:8101/health &>/dev/null; then
    echo -e " ${GREEN}✓${NC}"
    break
  fi
  echo -n "."
  sleep 1
done

# ── Check Redis ──────────────────────────────────────────────

echo -n "Waiting for Redis"
for i in {1..15}; do
  if docker exec monet-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo -e " ${GREEN}✓${NC}"
    break
  fi
  echo -n "."
  sleep 1
done

# ── Start all services ───────────────────────────────────────

echo -e "\n${YELLOW}Starting Jalebi services...${NC}"
echo -e "  ${BLUE}→ Vite dev server    :8787${NC}"
echo -e "  ${BLUE}→ Fastify API       :3000${NC}"
echo -e "  ${BLUE}→ BullMQ worker     (background)${NC}"
echo -e "  ${BLUE}→ Cloudflare Worker (wrangler dev)${NC}"
echo -e "  ${BLUE}→ Python AI         :8102${NC}"
echo -e "  ${BLUE}→ Python Audio      :8101${NC}"
echo -e "  ${BLUE}→ Redis             :6379${NC}"
echo ""

# bun run dev runs everything in parallel
exec bun run dev
