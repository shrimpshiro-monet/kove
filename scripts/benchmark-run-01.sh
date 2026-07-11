#!/bin/bash
# Benchmark Run 01 — Sports / same-domain / hype
# Footage: High Quality Steph Curry Clips for Edits! (2024-25).mp4
# Music: audio/Outfit (with 21 Savage).mp3

set -e

FASTIFY_API="http://localhost:3000"
TANSTACK_API="http://localhost:8787"
FOOTAGE_DIR="/Users/hamza/Desktop/reserves/monet-ai-story/unedited files"
OUTPUT_DIR="/Users/hamza/Desktop/reserves/monet-ai-story/benchmark-outputs"
mkdir -p "$OUTPUT_DIR"

FOOTAGE_FILE="$FOOTAGE_DIR/High Quality Steph Curry Clips for Edits! (2024-25).mp4"
MUSIC_FILE="$FOOTAGE_DIR/audio/Outfit (with 21 Savage).mp3"
PROMPT="Create a medium-fast Steph Curry sports highlight edit. Match the reference-style rhythm: clean basketball pacing, tension-building cuts, crossfades where appropriate, natural color, minimal overdone effects."

echo "=== Benchmark Run 01 — Sports / same-domain / hype ==="
echo "Footage: $FOOTAGE_FILE"
echo "Music: $MUSIC_FILE"
echo ""

# Step 1: Upload footage via Fastify API
echo "[1/8] Uploading footage..."
FOOTAGE_RESPONSE=$(curl -s -X POST "$FASTIFY_API/api/upload/direct" \
  -F "file=@$FOOTAGE_FILE" \
  -F "type=footage")
echo "Footage response: $FOOTAGE_RESPONSE"

FOOTAGE_ID=$(echo "$FOOTAGE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['fileId'])" 2>/dev/null)
FOOTAGE_URL=$(echo "$FOOTAGE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])" 2>/dev/null)
echo "Footage ID: $FOOTAGE_ID"
echo "Footage URL: $FOOTAGE_URL"

# Step 2: Upload music via Fastify API
echo ""
echo "[2/8] Uploading music..."
MUSIC_RESPONSE=$(curl -s -X POST "$FASTIFY_API/api/upload/direct" \
  -F "file=@$MUSIC_FILE" \
  -F "type=music")
echo "Music response: $MUSIC_RESPONSE"

MUSIC_ID=$(echo "$MUSIC_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['fileId'])" 2>/dev/null)
MUSIC_URL=$(echo "$MUSIC_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])" 2>/dev/null)
echo "Music ID: $MUSIC_ID"
echo "Music URL: $MUSIC_URL"

# Step 3: Analyze audio via Fastify API
echo ""
echo "[3/8] Analyzing audio..."
AUDIO_ANALYSIS=$(curl -s -X POST "$FASTIFY_API/analyze/audio" \
  -H "Content-Type: application/json" \
  -d "{\"filePath\": \".${MUSIC_URL}\"}")
echo "Audio analysis keys: $(echo "$AUDIO_ANALYSIS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(list(d.keys()))" 2>/dev/null)"

# Step 4: Analyze footage via TanStack API
echo ""
echo "[4/8] Analyzing footage..."
ANALYZE_RESPONSE=$(curl -s -X POST "$TANSTACK_API/api/analyze" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"benchmark-run-01\",
    \"footageIds\": [\"$FOOTAGE_ID\"],
    \"musicId\": \"$MUSIC_ID\"
  }")
echo "Analyze response: $(echo "$ANALYZE_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps({k:v for k,v in d.items() if k != 'result'}, indent=2))" 2>/dev/null)"

ANALYSIS_ID=$(echo "$ANALYZE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('analysisId', ''))" 2>/dev/null)
echo "Analysis ID: $ANALYSIS_ID"

# Step 5: Generate EDL via TanStack API
echo ""
echo "[5/8] Generating EDL..."
EDL_RESPONSE=$(curl -s -X POST "$TANSTACK_API/api/generate-edl" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"benchmark-run-01\",
    \"analysisId\": \"$ANALYSIS_ID\",
    \"prompt\": \"$PROMPT\"
  }")
echo "EDL response keys: $(echo "$EDL_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(list(d.keys()))" 2>/dev/null)"

# Save EDL
EDL_FILE="$OUTPUT_DIR/run-01-edl.json"
echo "$EDL_RESPONSE" > "$EDL_FILE"
echo "EDL saved to: $EDL_FILE"

# Extract EDL data for export
EDL_DATA=$(echo "$EDL_RESPONSE" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin).get('edl', {})))" 2>/dev/null)

# Step 6: Export MP4 via TanStack API
echo ""
echo "[6/8] Exporting MP4..."
EXPORT_RESPONSE=$(curl -s -X POST "$TANSTACK_API/api/export-mp4" \
  -H "Content-Type: application/json" \
  -d "{
    \"edl\": $EDL_DATA,
    \"mediaUrls\": {
      \"$FOOTAGE_ID\": \"http://localhost:3000$FOOTAGE_URL\",
      \"${MUSIC_ID}\": \"http://localhost:3000$MUSIC_URL\"
    }
  }" \
  -o "$OUTPUT_DIR/run-01-output.mp4" \
  -w "%{http_code}")

echo "Export HTTP status: $EXPORT_RESPONSE"
if [ -f "$OUTPUT_DIR/run-01-output.mp4" ]; then
  FILE_SIZE=$(stat -f%z "$OUTPUT_DIR/run-01-output.mp4" 2>/dev/null || stat -c%s "$OUTPUT_DIR/run-01-output.mp4" 2>/dev/null)
  echo "Output file size: $FILE_SIZE bytes"
  
  # Check if it's a valid MP4
  file "$OUTPUT_DIR/run-01-output.mp4" | head -1
fi

echo ""
echo "=== Run 01 Complete ==="
echo "EDL: $EDL_FILE"
echo "Output: $OUTPUT_DIR/run-01-output.mp4"
