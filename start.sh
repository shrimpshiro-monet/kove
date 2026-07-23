#!/bin/bash
set -e

echo "🚀 Starting Kove dev environment..."

# Kill any existing processes on our ports
for port in 8787 3000 5005 8101 8102; do
  lsof -ti :$port | xargs kill -9 2>/dev/null || true
done

sleep 1

echo "⏳ Starting services..."

# Start everything with pnpm dev
pnpm dev 2>&1 &
DEV_PID=$!

# Wait for Vite to be ready
echo "  → Waiting for Vite (:8787)..."
for i in $(seq 1 60); do
  if curl -s http://localhost:8787 > /dev/null 2>&1; then
    echo ""
    echo "✅ All services running!"
    echo ""
    echo "  🌐 Landing:   http://localhost:8787/"
    echo "  💬 Chat UI:   http://localhost:8787/chat"
    echo "  💰 Pricing:   http://localhost:8787/pricing"
    echo ""
    echo "  Press Ctrl+C to stop"
    echo ""
    wait $DEV_PID
    exit 0
  fi
  sleep 1
done

echo "❌ Vite didn't start in 60s. Check logs."
kill $DEV_PID 2>/dev/null || true
exit 1
