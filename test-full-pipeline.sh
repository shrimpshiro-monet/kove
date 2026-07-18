#!/bin/bash
# Test the complete Monet AI Director pipeline
# Intent → Analysis → EDL Generation

PORT=8080
BASE_URL="http://localhost:${PORT}"

echo "=========================================="
echo "  MONET AI DIRECTOR - FULL PIPELINE TEST"
echo "=========================================="
echo ""

# Step 1: Extract Intent
echo "📝 STEP 1: Extracting creative intent..."
echo ""

INTENT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/decode-intent" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "make a 30s anime AMV with epic fight scenes cut to the beat",
    "projectId": "test-pipeline-1"
  }')

echo "$INTENT_RESPONSE" | jq '.'

# Extract intentId
INTENT_ID=$(echo "$INTENT_RESPONSE" | jq -r '.intentId')

if [ "$INTENT_ID" = "null" ] || [ -z "$INTENT_ID" ]; then
  echo "❌ Failed to extract intent"
  exit 1
fi

echo ""
echo "✅ Intent extracted: $INTENT_ID"
echo ""
echo "Press Enter to continue to analysis..."
read

# Step 2: Analyze Footage + Music
echo ""
echo "🎥 STEP 2: Analyzing footage and music..."
echo ""

ANALYSIS_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-pipeline-1",
    "footageIds": ["clip-anime-1", "clip-anime-2"],
    "musicId": "music-edm-1"
  }')

echo "$ANALYSIS_RESPONSE" | jq '.'

# Extract analysisId
ANALYSIS_ID=$(echo "$ANALYSIS_RESPONSE" | jq -r '.analysisId')

if [ "$ANALYSIS_ID" = "null" ] || [ -z "$ANALYSIS_ID" ]; then
  echo "❌ Failed to analyze media"
  exit 1
fi

echo ""
echo "✅ Analysis complete: $ANALYSIS_ID"
echo ""
echo "Press Enter to continue to EDL generation..."
read

# Step 3: Generate EDL
echo ""
echo "🎬 STEP 3: Generating edit timeline (EDL)..."
echo ""

EDL_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/generate-edl" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"test-pipeline-1\",
    \"intentId\": \"$INTENT_ID\",
    \"analysisId\": \"$ANALYSIS_ID\"
  }")

echo "$EDL_RESPONSE" | jq '.'

# Extract edlId and scores
EDL_ID=$(echo "$EDL_RESPONSE" | jq -r '.edlId')
BEAT_SYNC=$(echo "$EDL_RESPONSE" | jq -r '.scores.beatSyncScore')
PACING=$(echo "$EDL_RESPONSE" | jq -r '.scores.pacingVariance')
CONFIDENCE=$(echo "$EDL_RESPONSE" | jq -r '.scores.overallConfidence')

echo ""
echo "=========================================="
echo "  ✅ PIPELINE COMPLETE"
echo "=========================================="
echo ""
echo "EDL ID: $EDL_ID"
echo ""
echo "📊 Quality Scores:"
echo "  • Beat Sync: ${BEAT_SYNC} (higher = better alignment to beats)"
echo "  • Pacing Variance: ${PACING} (higher = more dynamic)"
echo "  • Overall Confidence: ${CONFIDENCE}"
echo ""

# Show shot count
SHOT_COUNT=$(echo "$EDL_RESPONSE" | jq -r '.edl.shots | length')
DURATION=$(echo "$EDL_RESPONSE" | jq -r '.edl.timeline.duration')

echo "🎞️  Edit Details:"
echo "  • Total shots: $SHOT_COUNT"
echo "  • Duration: ${DURATION}s"
echo "  • Avg shot duration: $(echo "scale=2; $DURATION / $SHOT_COUNT" | bc)s"
echo ""

# Show first 3 shots
echo "🎬 First 3 Shots:"
echo "$EDL_RESPONSE" | jq -r '.edl.shots[0:3] | .[] | "  [\(.timing.startTime)s] \(.source.clipId) (\(.timing.duration)s) - \(.aiRationale // "No rationale")"'

echo ""
echo "=========================================="
echo ""
echo "Full EDL saved. Next steps:"
echo "  1. Preview rendering (Phase 6)"
echo "  2. Export to MP4 (Phase 8)"
echo ""
