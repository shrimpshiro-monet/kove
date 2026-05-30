#!/bin/bash
# Test hardened intent extraction with retry + cache

PORT=8080
BASE_URL="http://localhost:${PORT}"

echo "=== Test 1: Original prompt (will call Gemini) ==="
curl -s -X POST "${BASE_URL}/api/decode-intent" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "make a 30s anime AMV with epic fight scenes cut to the beat",
    "projectId": "test-project-1"
  }' | jq '.'

echo -e "\n\n=== Test 2: Exact same prompt (should hit cache) ==="
curl -s -X POST "${BASE_URL}/api/decode-intent" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "make a 30s anime AMV with epic fight scenes cut to the beat",
    "projectId": "test-project-1"
  }' | jq '.'

echo -e "\n\n=== Test 3: Similar prompt (should hit cache via similarity) ==="
curl -s -X POST "${BASE_URL}/api/decode-intent" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "create a 30s anime AMV with fight scenes synced to beats",
    "projectId": "test-project-1"
  }' | jq '.'

echo -e "\n\n=== Test 4: Different prompt (will call Gemini) ==="
curl -s -X POST "${BASE_URL}/api/decode-intent" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "make a slow cinematic wedding video with emotional music",
    "projectId": "test-project-2"
  }' | jq '.'

echo -e "\n\nDone! Check server logs to see cache hits/misses and retry attempts."
