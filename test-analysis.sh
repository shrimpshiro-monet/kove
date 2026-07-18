#!/bin/bash
# Test video/music analysis endpoint

PORT=8080
BASE_URL="http://localhost:${PORT}"

echo "=== Test 1: Analyze footage only (mock clip IDs) ==="
curl -s -X POST "${BASE_URL}/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project-1",
    "footageIds": ["clip-anime-1", "clip-anime-2"]
  }' | jq '.'

echo -e "\n\n=== Test 2: Analyze music only (mock music ID) ==="
curl -s -X POST "${BASE_URL}/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project-1",
    "musicId": "music-edm-1"
  }' | jq '.'

echo -e "\n\n=== Test 3: Analyze footage + music (full analysis) ==="
curl -s -X POST "${BASE_URL}/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project-2",
    "footageIds": ["clip-sports-1"],
    "musicId": "music-rock-1"
  }' | jq '.'

echo -e "\n\nDone! Check server logs for Gemini API calls and timing."
