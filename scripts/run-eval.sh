#!/usr/bin/env bash
# E33 — Evaluation harness runner for CI / dev loop.
#
# Usage:
#   ./scripts/run-eval.sh                  # build fixtures + eval + compare
#   ./scripts/run-eval.sh --save-baseline   # freeze current metrics as baseline
#   ./scripts/run-eval.sh --list            # list available fixtures
#
# Exits 0 on pass, 1 on regression/failure.

set -euo pipefail
cd "$(dirname "$0")/.."

FIXTURES_DIR="tests/fixtures"
BASELINES_DIR="${FIXTURES_DIR}/baselines"
mkdir -p "$BASELINES_DIR"

# ── Parse args ──
SAVE_BASELINE=false
LIST=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --save-baseline) SAVE_BASELINE=true; shift ;;
    --list) LIST=true; shift ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# ── List fixtures ──
if $LIST; then
  echo "Available fixtures:"
  for f in "$FIXTURES_DIR"/fixture-*/; do
    name=$(basename "$f")
    ref="$f/reference-cuts.json"
    if [ -f "$ref" ]; then
      echo "  $name  ✓ has reference-cuts.json"
    else
      echo "  $name  ✗ no reference-cuts.json"
    fi
  done
  exit 0
fi

# ── Build fixtures ──
echo "=== E33 Eval Runner ==="

# Fixture C
if [ ! -f "$FIXTURES_DIR/fixture-c/output.mp4" ]; then
  echo "  Building Fixture C..."
  python3 scripts/build-fixture-c.py 2>&1 | sed 's/^/    /'
fi

# Dialogue fixture D
if [ ! -f "$FIXTURES_DIR/youtube_talking_head/footage.mp4" ]; then
  echo "  Building Youtube Talking-Head Fixture..."
  python3 scripts/build-fixture-d.py 2>&1 | sed 's/^/    /'
fi

# Run montage evaluation on each montage fixture
ALL_PASS=true
for fixture_dir in "$FIXTURES_DIR"/fixture-*/; do
  name=$(basename "$fixture_dir")
  output="${fixture_dir}output.mp4"
  ref_cuts="${fixture_dir}reference-cuts.json"
  music="${fixture_dir}music.mp3"
  metrics_out="${fixture_dir}eval-metrics.json"
  baseline="${BASELINES_DIR}/${name}.json"

  if [ ! -f "$output" ]; then
    echo "  [SKIP] $name — no output.mp4"
    continue
  fi

  eval_args=(
    --generated "$output"
    --reference-cuts "$ref_cuts"
    --output "$metrics_out"
  )
  [ -f "$music" ] && eval_args+=(--music "$music")

  if $SAVE_BASELINE; then
    eval_args+=(--save-baseline "$baseline")
  elif [ -f "$baseline" ]; then
    eval_args+=(--compare "$baseline")
  fi

  echo "  Evaluating $name..."
  out=$(KMP_DUPLICATE_LIB_OK=TRUE python3 scripts/eval.py "${eval_args[@]}" 2>&1) || true
  echo "$out" | sed 's/^/    /'

  if echo "$out" | grep -q "REGRESSION"; then
    ALL_PASS=false
  fi
done

# Run dialogue evaluation on dialogue fixtures
DIALOGUE_FIXTURES=("youtube_talking_head")
for fixture_name in "${DIALOGUE_FIXTURES[@]}"; do
  baseline="${BASELINES_DIR}/${fixture_name}.json"

  eval_args=(
    --fixture "$fixture_name"
  )
  if $SAVE_BASELINE; then
    eval_args+=(--save-baseline)
  elif [ -f "$baseline" ]; then
    eval_args+=(--compare)
  fi

  echo "  Evaluating $fixture_name (dialogue)..."
  out=$(KMP_DUPLICATE_LIB_OK=TRUE python3 scripts/eval_dialogue.py "${eval_args[@]}" 2>&1) || true
  echo "$out" | sed 's/^/    /'

  if echo "$out" | grep -q "REGRESSIONS FOUND"; then
    ALL_PASS=false
  fi
done

echo ""
if $ALL_PASS; then
  echo "=== ALL PASS ==="
  exit 0
else
  echo "=== REGRESSIONS FOUND ==="
  exit 1
fi
