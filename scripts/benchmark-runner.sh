#!/bin/bash
# Benchmark Runner — Kove Reference Quality Benchmark
# Usage: ./benchmark-runner.sh [run_number]
# Example: ./benchmark-runner.sh 1  (runs Run 01 only)
# Example: ./benchmark-runner.sh all (runs all 9 tests)

set -e

FASTIFY_API="http://localhost:3000"
TANSTACK_API="http://localhost:8787"
FOOTAGE_DIR="/Users/hamza/Desktop/reserves/monet-ai-story/unedited files"
OUTPUT_DIR="/Users/hamza/Desktop/reserves/monet-ai-story/benchmark-outputs"
LOG_FILE="$OUTPUT_DIR/benchmark.log"

mkdir -p "$OUTPUT_DIR"

log() {
  echo "[$(date '+%H:%M:%S')] $1" >> "$LOG_FILE"
  echo "[$(date '+%H:%M:%S')] $1" >&2
}

upload_file() {
  local file_path="$1"
  local file_type="$2"
  
  # Sanitize filename for curl (handle special characters)
  local sanitized_path
  sanitized_path=$(echo "$file_path" | sed 's/"/\\"/g')
  
  local response
  response=$(curl -s -X POST "$FASTIFY_API/api/upload/direct" \
    -F "file=@${sanitized_path}" \
    -F "type=${file_type}" \
    --max-time 300 2>&1)  # 5 minute timeout for large files
  
  local file_id
  file_id=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['fileId'])" 2>/dev/null)
  
  local file_url
  file_url=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])" 2>/dev/null)
  
  local local_path
  local_path=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['asset']['localPath'])" 2>/dev/null)
  
  if [ -z "$file_id" ]; then
    log "ERROR: Failed to upload $file_path"
    log "Response: $response"
    return 1
  fi
  
  # Copy to local media cache for TanStack server audio analysis
  if [ -n "$local_path" ] && [ -f "$local_path" ]; then
    local cache_dir
    cache_dir=$(python3 -c "import tempfile; print(tempfile.gettempdir())")
    cache_dir="${cache_dir}/monet-media-dev"
    mkdir -p "$cache_dir"
    cp "$local_path" "$cache_dir/$file_id"
    # Create meta file for local media cache
    local mime_type
    mime_type=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['asset']['mimeType'])" 2>/dev/null)
    echo "{\"mimeType\":\"${mime_type}\",\"r2Key\":\"${file_id}\"}" > "$cache_dir/${file_id}.meta"
    log "Copied to local cache: $cache_dir/$file_id"
  fi
  
  echo "$file_id|$file_url"
}

analyze_and_generate() {
  local run_num="$1"
  local footage_id="$2"
  local footage_url="$3"
  local music_id="$4"
  local music_url="$5"
  local prompt="$6"
  
  # Analyze
  log "Analyzing..."
  local analyze_response
  analyze_response=$(curl -s -X POST "$TANSTACK_API/api/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"projectId\":\"benchmark-run-${run_num}\",\"footageIds\":[\"${footage_id}\"],\"musicId\":\"${music_id}\"}")
  
  local analysis_id
  analysis_id=$(echo "$analyze_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('analysisId',''))" 2>/dev/null)
  log "Analysis ID: $analysis_id"
  
  # Generate EDL
  log "Generating EDL..."
  local edl_response
  edl_response=$(curl -s -X POST "$TANSTACK_API/api/generate-edl" \
    -H "Content-Type: application/json" \
    -d "{\"projectId\":\"benchmark-run-${run_num}\",\"analysisId\":\"${analysis_id}\",\"prompt\":\"${prompt}\"}")
  
  echo "$edl_response" > "$OUTPUT_DIR/run-$(printf '%02d' $run_num)-edl.json"
  
  local shot_count
  shot_count=$(echo "$edl_response" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('edl',{}).get('shots',[])))" 2>/dev/null)
  local duration
  duration=$(echo "$edl_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('edl',{}).get('timeline',{}).get('duration',0))" 2>/dev/null)
  local gen_mode
  gen_mode=$(echo "$edl_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('generationMode',''))" 2>/dev/null)
  local bpm
  bpm=$(echo "$edl_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('edl',{}).get('music',{}).get('bpm',120))" 2>/dev/null)
  
  # Check if beat detection fell back to bpm:120
  local beat_fallback="false"
  if [ "$bpm" = "120" ]; then
    beat_fallback="true"
    log "WARNING: Beat detection fell back to bpm:120 - run may be degraded"
  fi
  
  log "EDL: ${shot_count} shots, ${duration}s, mode=${gen_mode}, bpm=${bpm}"
  
  # Export
  log "Exporting MP4..."
  local edl_data
  edl_data=$(echo "$edl_response" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin).get('edl', {})))" 2>/dev/null)
  
  local http_code
  http_code=$(curl -s -X POST "$TANSTACK_API/api/export-mp4" \
    -H "Content-Type: application/json" \
    -d "{\"edl\":${edl_data},\"mediaUrls\":{\"${footage_id}\":\"http://localhost:3000${footage_url}\",\"${music_id}\":\"http://localhost:3000${music_url}\"}}" \
    -o "$OUTPUT_DIR/run-$(printf '%02d' $run_num)-output.mp4" \
    -w "%{http_code}")
  
  local file_size
  file_size=$(stat -f%z "$OUTPUT_DIR/run-$(printf '%02d' $run_num)-output.mp4" 2>/dev/null || echo "0")
  log "Export: HTTP ${http_code}, ${file_size} bytes"
  
  # Get actual duration
  local actual_duration
  actual_duration=$(ffprobe -v quiet -print_format json -show_format "$OUTPUT_DIR/run-$(printf '%02d' $run_num)-output.mp4" 2>/dev/null | python3 -c "import sys, json; print(float(json.load(sys.stdin).get('format',{}).get('duration',0)))" 2>/dev/null || echo "0")
  log "Actual duration: ${actual_duration}s"
}

run_benchmark() {
  local run_num="$1"
  local footage_file="$2"
  local music_file="$3"
  local prompt="$4"
  
  log "=== Run $(printf '%02d' $run_num) ==="
  log "Footage: $(basename "$footage_file")"
  log "Music: $(basename "$music_file")"
  
  # Upload footage
  log "Uploading footage..."
  local footage_result
  footage_result=$(upload_file "$footage_file" "footage")
  if [ $? -ne 0 ]; then
    log "FAILED: Footage upload failed"
    return 1
  fi
  local footage_id="${footage_result%%|*}"
  local footage_url="${footage_result#*|}"
  log "Footage ID: $footage_id"
  
  # Upload music
  log "Uploading music..."
  local music_result
  music_result=$(upload_file "$music_file" "music")
  if [ $? -ne 0 ]; then
    log "FAILED: Music upload failed"
    return 1
  fi
  local music_id="${music_result%%|*}"
  local music_url="${music_result#*|}"
  log "Music ID: $music_id"
  
  # Analyze and generate
  analyze_and_generate "$run_num" "$footage_id" "$footage_url" "$music_id" "$music_url" "$prompt"
  
  log "=== Run $(printf '%02d' $run_num) Complete ==="
  log ""
}

# Define all 9 benchmark runs
declare -a FOOTAGE_FILES=(
  "$FOOTAGE_DIR/High Quality Steph Curry Clips for Edits! (2024-25).mp4"
  "$FOOTAGE_DIR/Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4"
  "$FOOTAGE_DIR/High Quality Steph Curry Clips for Edits! (2024-25).mp4"
  "$FOOTAGE_DIR/dragrace.mp4"
  "$FOOTAGE_DIR/milesmorales.mp4.mp4"
  "$FOOTAGE_DIR/MikeRoss.mp4"
  "$FOOTAGE_DIR/Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4"
  "$FOOTAGE_DIR/dragrace.mp4"
  "$FOOTAGE_DIR/milesmorales.mp4.mp4"
)

declare -a MUSIC_FILES=(
  "$FOOTAGE_DIR/audio/Outfit (with 21 Savage).mp3"
  "$FOOTAGE_DIR/audio/21 Savage - a lot ft. J. Cole.mp3"
  "$FOOTAGE_DIR/audio/Dave - Raindance (ft. Tems).mp3"
  "$FOOTAGE_DIR/audio/Timeless (w_ adlibs).mp3"
  "$FOOTAGE_DIR/audio/Outfit (with 21 Savage).mp3"
  "$FOOTAGE_DIR/audio/Dave - Raindance (ft. Tems).mp3"
  "$FOOTAGE_DIR/audio/Timeless (w_ adlibs).mp3"
  "$FOOTAGE_DIR/audio/Dave - Raindance (ft. Tems).mp3"
  "$FOOTAGE_DIR/audio/21 Savage - a lot ft. J. Cole.mp3"
)

declare -a PROMPTS=(
  "Create a medium-fast Steph Curry sports highlight edit. Match the reference-style rhythm: clean basketball pacing, tension-building cuts, crossfades where appropriate, natural color, minimal overdone effects."
  "Create a cinematic basketball highlight edit with medium pacing, beat-aware cuts, light glow, clean contrast, and reference-style sports rhythm. Avoid random flashy effects."
  "Create a slower emotional sports montage. Use the reference's pacing and shot duration, but make the mood more reflective and cinematic. Keep effects restrained."
  "Create a high-energy drag race edit with strong beat cuts, speed-ramp feeling, tension-building pacing, quick impact moments, and clean transitions. Make it feel like a viral action edit."
  "Create a stylish superhero/action montage. Match a reference-edit style with medium-fast pacing, punchy cuts, energetic transitions, and controlled glow/glitch effects. Avoid effect spam."
  "Create a cinematic character-focused edit. Use slower pacing, emotional rhythm, subtle transitions, natural color, and minimal effects. Prioritize readable moments and story flow."
  "Create a polished sports edit using this track. Keep pacing intentional and avoid random cuts. Prioritize best action moments, beat alignment, and clean visual flow."
  "Create a moody cinematic car edit. Do not force hype effects. Use restrained pacing, clean cuts, smooth transitions, and a premium visual tone."
  "Create a cinematic action edit with controlled pacing, beat-aware cuts, and tasteful effects. Match reference-style rhythm without overusing glitch, shake, or flash effects."
)

# Main execution
RUN_TARGET="${1:-all}"

log "Starting benchmark at $(date)"
log "Output directory: $OUTPUT_DIR"
log ""

# Preflight check: verify Python audio worker is running
log "Preflight: Checking Python audio worker..."
if curl -s http://127.0.0.1:8101/health >/dev/null 2>&1; then
  log "Preflight: Python audio worker OK"
else
  log "Preflight: WARNING - Python audio worker not reachable at port 8101"
  log "Preflight: Beat detection will fall back to bpm:120"
fi

# Preflight check: verify local media cache exists
log "Preflight: Checking local media cache..."
CACHE_DIR=$(python3 -c "import tempfile; print(tempfile.gettempdir())")
CACHE_DIR="${CACHE_DIR}/monet-media-dev"
if [ -d "$CACHE_DIR" ]; then
  FILE_COUNT=$(ls -1 "$CACHE_DIR" 2>/dev/null | grep -v ".meta" | wc -l)
  log "Preflight: Local media cache OK ($FILE_COUNT files)"
else
  log "Preflight: WARNING - Local media cache not found at $CACHE_DIR"
fi

if [ "$RUN_TARGET" = "all" ]; then
  for i in {1..9}; do
    run_benchmark "$i" "${FOOTAGE_FILES[$((i-1))]}" "${MUSIC_FILES[$((i-1))]}" "${PROMPTS[$((i-1))]}"
  done
else
  i="$RUN_TARGET"
  run_benchmark "$i" "${FOOTAGE_FILES[$((i-1))]}" "${MUSIC_FILES[$((i-1))]}" "${PROMPTS[$((i-1))]}"
fi

log "Benchmark complete at $(date)"
