#!/usr/bin/env bash
# 5-Reference Validation Suite — Fixed version
# Analyzes 30s of each reference video at 3fps, exports Edit DNA.
set -euo pipefail

OUTPUT_DIR="/Users/hamza/Desktop/reserves/monet-ai-story/validation-output"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

PYTHON_AI="http://localhost:8102"

# 5 diverse references — use -ss 0 -t 30 for fast analysis
REFERENCES=(
  "reference-videos-long/Building Quinn's BMW M3 - throtl (1080p, h264, youtube).mp4"
  "reference-videos-long/This car almost broke my legs! - carwow (1080p, h264, youtube).mp4"
  "reference-videos-long/World's Smallest TV  OT 30 - Dude Perfect (1080p, h264, youtube).mp4"
  "monet-reference-edits/creed.MP4"
  "monet-reference-edits/steph curry.MP4"
)

NAMES=(
  "bmw-m3-throtl"
  "carwow-broke-legs"
  "dude-perfect-smallest-tv"
  "creed"
  "steph-curry"
)

echo "=== 5-Reference Validation Suite ==="
echo "Output: $OUTPUT_DIR"
echo ""

# First, extract 30s segments to temp files
echo "=== Step 0: Extracting 30s segments ==="
SEGMENT_DIR="/tmp/jalebi-segments"
rm -rf "$SEGMENT_DIR"
mkdir -p "$SEGMENT_DIR"

for i in "${!REFERENCES[@]}"; do
  ref="${REFERENCES[$i]}"
  name="${NAMES[$i]}"
  FULL_PATH="/Users/hamza/Desktop/reserves/monet-ai-story/$ref"
  SEGMENT="$SEGMENT_DIR/${name}.mp4"
  
  if [ ! -f "$SEGMENT" ]; then
    echo "  Extracting 30s of $name..."
    ffmpeg -i "$FULL_PATH" -ss 0 -t 30 -c copy -y "$SEGMENT" 2>/dev/null
  fi
done
echo ""

for i in "${!REFERENCES[@]}"; do
  segment="$SEGMENT_DIR/${NAMES[$i]}.mp4"
  name="${NAMES[$i]}"
  
  if [ ! -f "$segment" ]; then
    echo "--- [$((i+1))/5] SKIP: $name (segment not created) ---"
    continue
  fi
  
  echo "--- [$((i+1))/5] Analyzing: $name ---"
  
  # Step 1: Extract frames at 3fps
  FRAME_DIR="$OUTPUT_DIR/$name/frames"
  mkdir -p "$FRAME_DIR"
  
  FRAME_RESULT=$(curl -s -X POST "$PYTHON_AI/extract-frames" \
    -H "Content-Type: application/json" \
    -d "{\"filePath\": \"$segment\", \"fps\": 3, \"outputDir\": \"$FRAME_DIR\"}")
  
  FRAME_COUNT=$(echo "$FRAME_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['metadata']['total_frames'])" 2>/dev/null || echo "0")
  DURATION=$(echo "$FRAME_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['metadata']['duration_s'])" 2>/dev/null || echo "0")
  echo "  Frames: $FRAME_COUNT (duration: ${DURATION}s)"
  
  if [ "$FRAME_COUNT" = "0" ]; then
    echo "  ERROR: 0 frames extracted — skipping"
    continue
  fi
  
  # Step 2: Detect cuts
  CUT_RESULT=$(curl -s -X POST "$PYTHON_AI/detect-cuts" \
    -H "Content-Type: application/json" \
    -d "{\"frameDir\": \"$FRAME_DIR\", \"fps\": 3}")
  
  CUT_COUNT=$(echo "$CUT_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['cuts']))" 2>/dev/null || echo "0")
  SHOT_COUNT=$(echo "$CUT_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['shots']))" 2>/dev/null || echo "0")
  echo "  Cuts: $CUT_COUNT, Shots: $SHOT_COUNT"
  
  # Step 3: Analyze motion
  SHOTS_JSON=$(echo "$CUT_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['data']['shots']))" 2>/dev/null || echo "[]")
  
  MOTION_RESULT=$(curl -s -X POST "$PYTHON_AI/analyze-motion" \
    -H "Content-Type: application/json" \
    -d "{\"frameDir\": \"$FRAME_DIR\", \"shots\": $SHOTS_JSON}")
  
  MOTION_TYPES=$(echo "$MOTION_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print([m['motion'] for m in d['data']['motions']])" 2>/dev/null || echo "[]")
  echo "  Motions: $MOTION_TYPES"
  
  # Step 4: Analyze color
  COLOR_RESULT=$(curl -s -X POST "$PYTHON_AI/analyze-color" \
    -H "Content-Type: application/json" \
    -d "{\"frameDir\": \"$FRAME_DIR\", \"shots\": $SHOTS_JSON}")
  
  GLOBAL_COLOR=$(echo "$COLOR_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); g=d['data']['global']; print(f\"contrast={g['contrast']}, sat={g['saturation']}, temp={g['temperature_shift']}\")" 2>/dev/null || echo "unknown")
  echo "  Color: $GLOBAL_COLOR"
  
  # Save full analysis export
  ANALYSIS_EXPORT="$OUTPUT_DIR/$name/analysis.json"
  python3 << PYEOF
import json

cuts_data = json.loads('''$CUT_RESULT''')
motion_data = json.loads('''$MOTION_RESULT''')
color_data = json.loads('''$COLOR_RESULT''')

analysis = {
    "name": "$name",
    "duration_s": float("$DURATION"),
    "frame_count": $FRAME_COUNT,
    "shots": cuts_data["data"]["shots"],
    "cuts": cuts_data["data"]["cuts"],
    "motions": motion_data["data"]["motions"],
    "color": color_data["data"],
    "shot_count": $SHOT_COUNT,
    "cut_count": $CUT_COUNT,
}

with open("$ANALYSIS_EXPORT", "w") as f:
    json.dump(analysis, f, indent=2)
PYEOF
  
  echo "  -> analysis.json saved"
  echo ""
done

echo "=== Validation Complete ==="
echo ""
echo "Analysis exports:"
for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  if [ -f "$OUTPUT_DIR/$name/analysis.json" ]; then
    echo "  validation-output/$name/analysis.json"
    python3 -c "
import json
with open('$OUTPUT_DIR/$name/analysis.json') as f:
    d = json.load(f)
print(f\"    Shots: {d['shot_count']}, Cuts: {d['cut_count']}\")
print(f\"    Motions: {[m['motion'] for m in d['motions']]}\")
print(f\"    Color: contrast={d['color']['global']['contrast']}, sat={d['color']['global']['saturation']}, temp={d['color']['global']['temperature_shift']}\")
"
  fi
done
