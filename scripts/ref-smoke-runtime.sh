#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8081}"
PROJECT_ID="smoke-ref-$(date +%s)"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-120}"

echo "Running reference replication smoke on ${BASE_URL} (project ${PROJECT_ID})" >&2
echo "[1/5] analyze-reference" >&2

REF_RESP=$(curl -s --max-time "${CURL_TIMEOUT_SECONDS}" -X POST "${BASE_URL}/api/analyze-reference" \
  -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"${PROJECT_ID}\",\"fileId\":\"reference/mock-amv.mp4\"}")

if [[ "$(echo "${REF_RESP}" | jq -r '.success')" != "true" ]]; then
  echo "Reference analysis failed" >&2
  echo "${REF_RESP}" | jq '.'
  exit 1
fi

STYLE_JSON=$(echo "${REF_RESP}" | jq -c '.style')

echo "[2/5] decode-intent" >&2

INTENT_RESP=$(curl -s --max-time "${CURL_TIMEOUT_SECONDS}" -X POST "${BASE_URL}/api/decode-intent" \
  -H 'Content-Type: application/json' \
  -d "{\"prompt\":\"replicate this reference editing style onto my clips for a 30s cut\",\"projectId\":\"${PROJECT_ID}\",\"context\":{\"hasMusic\":true,\"hasFootage\":true,\"hasReference\":true,\"referenceStyle\":${STYLE_JSON}}}")

INTENT_ID=$(echo "${INTENT_RESP}" | jq -r '.intentId')
if [[ -z "${INTENT_ID}" || "${INTENT_ID}" == "null" ]]; then
  echo "Intent extraction failed" >&2
  echo "${INTENT_RESP}" | jq '.'
  exit 1
fi

echo "[3/5] analyze" >&2

ANALYSIS_RESP=$(curl -s --max-time "${CURL_TIMEOUT_SECONDS}" -X POST "${BASE_URL}/api/analyze" \
  -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"${PROJECT_ID}\",\"footageIds\":[\"clip-anime-1\"]}")

ANALYSIS_ID=$(echo "${ANALYSIS_RESP}" | jq -r '.analysisId')
if [[ -z "${ANALYSIS_ID}" || "${ANALYSIS_ID}" == "null" ]]; then
  echo "Analysis failed" >&2
  echo "${ANALYSIS_RESP}" | jq '.'
  exit 1
fi

echo "[4/5] generate-edl" >&2

GEN_RESP=$(curl -s --max-time "${CURL_TIMEOUT_SECONDS}" -X POST "${BASE_URL}/api/generate-edl" \
  -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"${PROJECT_ID}\",\"intentId\":\"${INTENT_ID}\",\"analysisId\":\"${ANALYSIS_ID}\",\"referenceStyle\":${STYLE_JSON},\"referenceMode\":\"strict_replication\"}")

if [[ "$(echo "${GEN_RESP}" | jq -r '.success')" != "true" ]]; then
  echo "EDL generation failed" >&2
  echo "${GEN_RESP}" | jq '.'
  exit 1
fi

EDL_ID=$(echo "${GEN_RESP}" | jq -r '.edlId')
EDL_JSON=$(echo "${GEN_RESP}" | jq -c '.edl')

echo "[5/5] refine-edl" >&2

REFINE_RESP=$(curl -s --max-time "${CURL_TIMEOUT_SECONDS}" -X POST "${BASE_URL}/api/refine-edl" \
  -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"${PROJECT_ID}\",\"edlId\":\"${EDL_ID}\",\"edl\":${EDL_JSON},\"feedback\":\"keep the same reference DNA but make drop hit harder\",\"intentId\":\"${INTENT_ID}\",\"analysisId\":\"${ANALYSIS_ID}\",\"referenceStyle\":${STYLE_JSON},\"referenceMode\":\"strict_replication\"}")

if [[ "$(echo "${REFINE_RESP}" | jq -r '.success')" != "true" ]]; then
  echo "EDL refinement failed" >&2
  echo "${REFINE_RESP}" | jq '.'
  exit 1
fi

REFINED_JSON=$(echo "${REFINE_RESP}" | jq -c '.edl')

STYLE_JSON="${STYLE_JSON}" EDL_JSON="${EDL_JSON}" REFINED_JSON="${REFINED_JSON}" PROJECT_ID="${PROJECT_ID}" node <<'NODE'
const style = JSON.parse(process.env.STYLE_JSON || '{}');
const edl = JSON.parse(process.env.EDL_JSON || '{}');
const refined = JSON.parse(process.env.REFINED_JSON || '{}');

function metrics(s, e) {
  const shots = Array.isArray(e?.shots) ? e.shots : [];
  const durations = shots.map((x) => Number(x?.timing?.duration || 0)).filter((n) => n > 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const transitionShots = shots.filter((x) => x?.transition?.type).length;
  const cutCount = shots.filter((x) => x?.transition?.type === 'cut').length;
  const withEffects = shots.filter((x) => Array.isArray(x?.effects) && x.effects.length > 0).length;
  const beatLocked = shots.filter((x) => x?.beatLock).length;

  const targetAvg = Number(s?.rhythm?.avgShotDuration || 0);
  const targetCutPct = Number(s?.effects?.transitionsBreakdown?.cutPercentage || 0) * 100;
  const targetEffectsPct = Number(s?.effects?.effectsFrequency || 0) * 100;

  const timeline = Number(e?.timeline?.duration || 0);
  const targetClimax = Number(s?.pacing?.climaxPosition || 0);
  const climaxAbs = timeline * targetClimax;
  const nearClimaxShots = shots.filter((x) => {
    const st = Number(x?.timing?.startTime || 0);
    return Math.abs(st - climaxAbs) <= Math.max(1, timeline * 0.1);
  }).length;

  const cutPct = transitionShots ? (cutCount / transitionShots) * 100 : 0;
  const effectsPct = shots.length ? (withEffects / shots.length) * 100 : 0;

  return {
    shotCount: shots.length,
    avgShotDuration: avg,
    targetAvgShotDuration: targetAvg,
    avgShotDeltaPct: targetAvg ? (Math.abs(avg - targetAvg) / targetAvg) * 100 : 0,
    cutPct,
    targetCutPct,
    cutDeltaPctPoints: Math.abs(cutPct - targetCutPct),
    effectsPct,
    targetEffectsPct,
    effectsDeltaPctPoints: Math.abs(effectsPct - targetEffectsPct),
    beatLockCoveragePct: shots.length ? (beatLocked / shots.length) * 100 : 0,
    climaxWindowShotCount: nearClimaxShots,
  };
}

console.log(
  JSON.stringify(
    {
      projectId: process.env.PROJECT_ID || '',
      generation: metrics(style, edl),
      refinement: metrics(style, refined),
    },
    null,
    2,
  ),
);
NODE
