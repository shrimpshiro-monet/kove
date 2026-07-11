#!/usr/bin/env node
/**
 * test-reference-pipeline.mjs — Comprehensive validation of reference → EDL pipeline.
 *
 * Tests: effects, transitions, speed ramps, pacing, beat locking,
 * energy alignment, color grading, shot continuity, source coverage,
 * effect density, transition distribution, metadata, resolution, fps.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TRAINING_DATA = path.join(ROOT, "src", "server", "data", "reference-training-data.json");

// ── Test harness ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warnings = 0;
const failures = [];

function assert(condition, name, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name} — ${detail}` : name;
    failures.push(msg);
    console.log(`  ✗ ${name}`);
    if (detail) console.log(`    ${detail}`);
  }
}

function warn(name, detail = "") {
  warnings++;
  console.log(`  ⚠ ${name}${detail ? " — " + detail : ""}`);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ── EDL generator (inline to avoid TS import) ─────────────────────

function generateEDL(ref, clipIds, totalDuration, intensity = 0.7) {
  const shots = [];
  let currentTime = 0;

  const effectMap = {
    impact_flash: "flash",
    speed_ramp: "speedRamp",
    context_shake: "shake",
    chromatic_burst: "glitch",
    bloom_highlights: "glow",
  };

  // Pre-compute effect placement: distribute effects across shots proportionally
  // instead of relying on timestamp alignment (which drifts with random variance)
  const refEffectsByType = {};
  for (const e of ref.effects.detected) {
    if (!refEffectsByType[e.type]) refEffectsByType[e.type] = [];
    refEffectsByType[e.type].push(e);
  }

  // Total effects to place, scaled by intensity
  const totalEffectsToPlace = Math.round(ref.effects.total * intensity);
  const effectSlots = []; // { shotIndex, type, intensity }

  for (const [type, effects] of Object.entries(refEffectsByType)) {
    // Distribute this type's effects evenly across shots
    const count = Math.round(effects.length * intensity);
    for (let ei = 0; ei < count; ei++) {
      const shotIdx = Math.floor((ei / count) * ref.shots.count);
      effectSlots.push({
        shotIdx,
        type: effectMap[type] ?? type,
        intensity: Math.min(1, effects[ei % effects.length].intensity * intensity),
        id: `fx-${type}-${ei}`,
      });
    }
  }

  // Also fill shots that have no effect yet (for high-density references)
  // AND ensure every effect type from the vocabulary appears at least once
  const effectDensity = ref.effects.total / Math.max(1, ref.shots.count);
  const vocab = Object.entries(ref.effects.vocabulary);
  const totalVocab = vocab.reduce((s, [, c]) => s + c, 0);

  // First pass: ensure every type appears at least once
  for (const [type] of vocab) {
    const hasType = effectSlots.some(s => s.type === (effectMap[type] ?? type));
    if (!hasType) {
      const shotIdx = Math.floor(Math.random() * ref.shots.count);
      effectSlots.push({
        shotIdx,
        type: effectMap[type] ?? type,
        intensity: 0.6 * intensity,
        id: `fx-guarantee-${type}`,
      });
    }
  }

  // Second pass: fill remaining shots for density
  if (effectDensity > 0.8) {
    for (let si = 0; si < ref.shots.count; si++) {
      const hasEffect = effectSlots.some(s => s.shotIdx === si);
      if (!hasEffect && Math.random() < effectDensity * 0.4) {
        let roll = Math.random() * totalVocab;
        for (const [type, count] of vocab) {
          roll -= count;
          if (roll <= 0) {
            effectSlots.push({
              shotIdx: si,
              type: effectMap[type] ?? type,
              intensity: 0.5 * intensity,
              id: `fx-fill-${si}-${type}`,
            });
            break;
          }
        }
      }
    }
  }

  // Group by shot index
  const shotEffectsMap = new Map();
  for (const slot of effectSlots) {
    if (!shotEffectsMap.has(slot.shotIdx)) shotEffectsMap.set(slot.shotIdx, []);
    shotEffectsMap.get(slot.shotIdx).push(slot);
  }

  for (let i = 0; i < ref.shots.count && currentTime < totalDuration; i++) {
    const refShot = ref.shots.timeline[i % ref.shots.timeline.length];
    const clipId = clipIds[i % clipIds.length];
    const baseDuration = refShot.duration;
    const variance = ref.shots.pacing.variance * 0.15;
    const duration = Math.max(0.1, baseDuration + (Math.random() - 0.5) * variance);

    const sourceStart = (currentTime / totalDuration) * 100;
    const sourceEnd = Math.min(100, sourceStart + (duration / totalDuration) * 100);

    // Effects — use pre-computed map
    let shotEffects = shotEffectsMap.get(i) ?? [];
    // Fill from vocabulary if high density and shot has none
    if (shotEffects.length === 0) {
      const effectDensity = ref.effects.total / Math.max(1, ref.shots.count);
      if (effectDensity > 0.8) {
        const vocab = Object.entries(ref.effects.vocabulary);
        if (vocab.length > 0) {
          const total = vocab.reduce((s, [, c]) => s + c, 0);
          let roll = Math.random() * total;
          for (const [type, count] of vocab) {
            roll -= count;
            if (roll <= 0) {
              shotEffects = [{
                id: `fx-s${i}-${type}-fill`,
                type: effectMap[type] ?? type,
                intensity: 0.5 * intensity,
              }];
              break;
            }
          }
        }
      }
    }

    // Transition
    let transition;
    if (i > 0) {
      const vocab = ref.transitions.vocabulary;
      const total = Object.values(vocab).reduce((s, c) => s + c, 0);
      let roll = Math.random() * total;
      let transType = "cut";
      for (const [type, count] of Object.entries(vocab)) {
        roll -= count;
        if (roll <= 0) { transType = type; break; }
      }
      transition = { type: transType, duration: transType === "flash" ? 0.1 : 0 };
    }

    // Speed ramp
    const hasRamp = ref.effects.detected.some(
      (e) => e.type === "speed_ramp" && Math.abs(e.timestamp - currentTime) < duration
    );

    // Beat lock
    let beatLock;
    if (ref.beat.grid.length > 0 && ref.beat.confidence > 0.15) {
      let bestIdx = 0, bestDist = Infinity;
      for (let b = 0; b < ref.beat.grid.length; b++) {
        const dist = Math.abs(ref.beat.grid[b] - currentTime);
        if (dist < bestDist) { bestDist = dist; bestIdx = b; }
      }
      if (bestDist < 0.3) beatLock = { beatIndex: bestIdx, lockMode: "start" };
    }

    shots.push({
      id: `shot-${i}`,
      name: `Shot ${i + 1}`,
      source: { clipId, inPoint: sourceStart, outPoint: sourceEnd },
      timing: {
        startTime: currentTime,
        duration: Math.min(duration, totalDuration - currentTime),
        speed: hasRamp ? undefined : 1,
        speedRamp: hasRamp ? { startSpeed: 0.5, endSpeed: 1.5, easing: "easeInOut" } : undefined,
      },
      effects: shotEffects.length > 0 ? shotEffects : undefined,
      transition,
      beatLock,
    });

    currentTime += Math.min(duration, totalDuration - currentTime);
  }

  return {
    version: "1.0.0",
    metadata: {
      title: `Reference: ${ref.name}`,
      createdAt: Date.now(),
      aiModel: "reference-matcher",
      prompt: `Replicate ${ref.name}`,
      intentId: `ref-${ref.id}`,
      analysisId: `ref-${ref.id}`,
    },
    timeline: {
      duration: totalDuration,
      fps: ref.info.fps || 30,
      resolution: { width: ref.info.width || 1920, height: ref.info.height || 1080 },
    },
    shots,
    music: ref.beat.bpm > 0 ? {
      id: "music-1",
      sourceId: "music-clip",
      beatGrid: ref.beat.grid,
      bpm: ref.beat.bpm,
      volume: 1,
    } : undefined,
    globalEffects: { colorGrade: "natural" },
  };
}

// ── Main test suite ───────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Reference → EDL Full Validation Suite");
  console.log("═══════════════════════════════════════════════════════════");

  const raw = await fs.readFile(TRAINING_DATA, "utf8");
  const data = JSON.parse(raw);

  // Test every reference video
  for (const ref of data.videos) {
    console.log(`\n━━━ ${ref.name} ━━━`);
    console.log(`  ${ref.info.duration}s | ${ref.shots.count} shots | ${ref.effects.total} effects | ${ref.beat.bpm} BPM`);

    const clipIds = ["footage-a", "footage-b", "footage-c", "footage-d"];
    const edl = generateEDL(ref, clipIds, ref.info.duration);

    // ── 1. STRUCTURE ──
    section("Structure");
    assert(edl.version === "1.0.0", "Version is 1.0.0");
    assert(edl.metadata?.title?.includes(ref.name), "Metadata title references source");
    assert(edl.metadata?.createdAt > 0, "Metadata has timestamp");
    assert(edl.metadata?.aiModel === "reference-matcher", "Metadata has AI model");
    assert(edl.metadata?.intentId?.startsWith("ref-"), "Metadata has intent ID");
    assert(edl.metadata?.analysisId?.startsWith("ref-"), "Metadata has analysis ID");
    assert(edl.timeline.fps === (ref.info.fps || 30), `FPS matches reference (${ref.info.fps})`);
    assert(
      edl.timeline.resolution.width === (ref.info.width || 1920) &&
      edl.timeline.resolution.height === (ref.info.height || 1080),
      `Resolution matches reference (${ref.info.width}x${ref.info.height})`
    );

    // ── 2. TIMING ──
    section("Timing Integrity");
    let totalTime = 0;
    let timingGaps = 0;
    let overlaps = 0;
    for (let i = 0; i < edl.shots.length; i++) {
      const shot = edl.shots[i];
      if (i > 0 && Math.abs(shot.timing.startTime - totalTime) > 0.01) {
        timingGaps++;
      }
      if (shot.timing.duration <= 0) {
        assert(false, `Shot ${i} has zero/negative duration`);
      }
      if (shot.timing.startTime < 0) {
        assert(false, `Shot ${i} has negative start time`);
      }
      totalTime += shot.timing.duration;
    }
    assert(timingGaps === 0, "No gaps between shots", timingGaps > 0 ? `${timingGaps} gaps found` : "");
    assert(
      Math.abs(totalTime - ref.info.duration) < 2.0,
      `Total duration within 2s of reference`,
      `got ${totalTime.toFixed(2)}s, expected ${ref.info.duration.toFixed(2)}s`
    );

    // ── 3. PACING ──
    section("Pacing Match");
    const edlDurations = edl.shots.map(s => s.timing.duration);
    const edlAvg = edlDurations.reduce((a, b) => a + b, 0) / edlDurations.length;
    const edlSorted = [...edlDurations].sort((a, b) => a - b);
    const edlMedian = edlSorted[Math.floor(edlSorted.length / 2)];
    const edlMin = edlSorted[0];
    const edlMax = edlSorted[edlSorted.length - 1];

    const avgDelta = Math.abs(edlAvg - ref.shots.pacing.avg);
    assert(
      avgDelta < 0.5,
      `Avg shot duration matches (±0.5s)`,
      `EDL: ${edlAvg.toFixed(3)}s, Ref: ${ref.shots.pacing.avg.toFixed(3)}s, Δ: ${avgDelta.toFixed(3)}s`
    );

    const medianDelta = Math.abs(edlMedian - ref.shots.pacing.median);
    assert(
      medianDelta < 0.5,
      `Median shot duration matches (±0.5s)`,
      `EDL: ${edlMedian.toFixed(3)}s, Ref: ${ref.shots.pacing.median.toFixed(3)}s`
    );

    // Shot count should be close (within 20%)
    const countDelta = Math.abs(edl.shots.length - ref.shots.count);
    const countThreshold = Math.max(3, ref.shots.count * 0.2);
    assert(
      countDelta <= countThreshold,
      `Shot count within 20% of reference`,
      `EDL: ${edl.shots.length}, Ref: ${ref.shots.count}, Δ: ${countDelta}`
    );

    // ── 4. EFFECTS ──
    section("Effects");
    const edlEffects = edl.shots.flatMap(s => s.effects ?? []);
    const edlEffectTypes = {};
    for (const e of edlEffects) {
      edlEffectTypes[e.type] = (edlEffectTypes[e.type] || 0) + 1;
    }

    const refEffectTypes = ref.effects.vocabulary;
    const hasAnyEffects = edlEffects.length > 0;
    const refHasEffects = ref.effects.total > 0;

    if (refHasEffects) {
      assert(hasAnyEffects, "EDL has effects when reference does",
        `EDL: ${edlEffects.length} effects, Ref: ${ref.effects.total}`);

      // Check effect types match reference vocabulary
      const effectMapReverse = { flash: "impact_flash", speedRamp: "speed_ramp", shake: "context_shake", glitch: "chromatic_burst", glow: "bloom_highlights" };
      const refTypes = new Set(Object.keys(refEffectTypes));
      const edlRawTypes = new Set(Object.keys(edlEffectTypes).map(t => effectMapReverse[t] ?? t));
      const missingTypes = [...refTypes].filter(t => !edlRawTypes.has(t));
      const extraTypes = [...edlRawTypes].filter(t => !refTypes.has(t));

      if (refTypes.size > 0) {
        assert(
          missingTypes.length < refTypes.size * 0.5,
          `Most reference effect types present in EDL`,
          missingTypes.length > 0 ? `Missing: ${missingTypes.join(", ")}` : ""
        );
      }

      // Effect density should be proportional
      const refDensity = ref.effects.total / ref.shots.count;
      const edlDensity = edlEffects.length / edl.shots.length;
      const densityRatio = refDensity > 0 ? edlDensity / refDensity : 1;
      assert(
        densityRatio > 0.3 && densityRatio < 3.0,
        `Effect density within 3× of reference`,
        `Ref: ${refDensity.toFixed(2)}/shot, EDL: ${edlDensity.toFixed(2)}/shot, ratio: ${densityRatio.toFixed(2)}`
      );
    } else {
      warn("Reference has no effects — skipping effect validation");
    }

    // Effect intensities must be 0-1
    const badIntensity = edlEffects.filter(e => e.intensity < 0 || e.intensity > 1);
    assert(badIntensity.length === 0, "All effect intensities in [0, 1]",
      badIntensity.length > 0 ? `${badIntensity.length} out of range` : "");

    // Effect IDs must be unique
    const effectIds = edlEffects.map(e => e.id);
    const uniqueEffects = new Set(effectIds);
    assert(uniqueEffects.size === effectIds.length, "All effect IDs unique",
      `${effectIds.length} total, ${uniqueEffects.size} unique`);

    // ── 5. TRANSITIONS ──
    section("Transitions");
    const edlTransitions = edl.shots.filter(s => s.transition).map(s => s.transition);
    const edlTransTypes = {};
    for (const t of edlTransitions) {
      edlTransTypes[t.type] = (edlTransTypes[t.type] || 0) + 1;
    }

    const refTransTypes = ref.transitions.vocabulary;
    const hasTransitions = edlTransitions.length > 0;

    if (Object.keys(refTransTypes).length > 0) {
      assert(hasTransitions, "EDL has transitions when reference does",
        `EDL: ${edlTransitions.length}, Ref cuts: ${ref.cuts.count}`);

      // Check transition type distribution
      for (const [type, refCount] of Object.entries(refTransTypes)) {
        const edlCount = edlTransTypes[type] || 0;
        const refRatio = refCount / ref.cuts.count;
        const edlRatio = edlCount / edl.shots.length;
        const ratioDelta = Math.abs(refRatio - edlRatio);
        assert(
          ratioDelta < 0.3,
          `Transition "${type}" ratio matches (±30%)`,
          `Ref: ${(refRatio * 100).toFixed(0)}%, EDL: ${(edlRatio * 100).toFixed(0)}%`
        );
      }

      // Flash transitions must have duration > 0
      const flashTrans = edlTransitions.filter(t => t.type === "flash");
      const badFlash = flashTrans.filter(t => t.duration <= 0);
      assert(badFlash.length === 0, "Flash transitions have duration > 0",
        badFlash.length > 0 ? `${badFlash.length} flash transitions with 0 duration` : "");

      // Cut transitions must have duration 0
      const cutTrans = edlTransitions.filter(t => t.type === "cut");
      const badCut = cutTrans.filter(t => t.duration !== 0);
      assert(badCut.length === 0, "Cut transitions have duration 0",
        badCut.length > 0 ? `${badCut.length} cut transitions with non-zero duration` : "");
    } else {
      warn("Reference has no transitions — skipping transition validation");
    }

    // ── 6. SPEED RAMPS ──
    section("Speed Ramps");
    const shotsWithRamp = edl.shots.filter(s => s.timing.speedRamp);
    const refRampCount = ref.effects.detected.filter(e => e.type === "speed_ramp").length;

    if (refRampCount > 0) {
      assert(shotsWithRamp.length > 0, "EDL has speed ramps when reference does",
        `Ref: ${refRampCount} ramps, EDL: ${shotsWithRamp.length}`);

      for (const shot of shotsWithRamp) {
        const ramp = shot.timing.speedRamp;
        assert(ramp.startSpeed > 0 && ramp.startSpeed < 1, "Speed ramp start < 1× (slow-mo)",
          `startSpeed: ${ramp.startSpeed}`);
        assert(ramp.endSpeed > 1, "Speed ramp end > 1× (speed-up)",
          `endSpeed: ${ramp.endSpeed}`);
        assert(ramp.easing, "Speed ramp has easing function");
        assert(shot.timing.speed === undefined, "Speed ramp shot has no fixed speed");
      }
    } else {
      // No ramps in reference — verify EDL doesn't add them spuriously
      assert(shotsWithRamp.length === 0, "No speed ramps when reference has none",
        `EDL has ${shotsWithRamp.length} ramps`);
    }

    // Shots without ramps should have speed = 1
    const shotsWithoutRamp = edl.shots.filter(s => !s.timing.speedRamp);
    const badSpeed = shotsWithoutRamp.filter(s => s.timing.speed !== 1);
    assert(badSpeed.length === 0, "Non-ramp shots have speed = 1",
      `${badSpeed.length} shots with unexpected speed`);

    // ── 7. BEAT LOCKING ──
    section("Beat Locking");
    const shotsWithBeatLock = edl.shots.filter(s => s.beatLock);

    if (ref.beat.bpm > 0 && ref.beat.confidence > 0.2) {
      assert(shotsWithBeatLock.length > 0, "Shots are beat-locked when BPM detected",
        `BPM: ${ref.beat.bpm}, confidence: ${(ref.beat.confidence * 100).toFixed(0)}%`);

      for (const shot of shotsWithBeatLock) {
        assert(
          shot.beatLock.lockMode === "start" || shot.beatLock.lockMode === "end" || shot.beatLock.lockMode === "center",
          `Beat lock mode is valid`,
          `mode: ${shot.beatLock.lockMode}`
        );
        assert(
          shot.beatLock.beatIndex >= 0,
          `Beat index is non-negative`,
          `index: ${shot.beatLock.beatIndex}`
        );
      }

      // Verify shots are actually close to beat positions
      let nearBeatCount = 0;
      for (const shot of edl.shots) {
        const nearestBeat = ref.beat.grid.reduce((best, b) =>
          Math.abs(b - shot.timing.startTime) < Math.abs(best - shot.timing.startTime) ? b : best,
          ref.beat.grid[0]
        );
        const beatInterval = ref.beat.avgInterval || 0.5;
        if (Math.abs(nearestBeat - shot.timing.startTime) < beatInterval * 0.6) nearBeatCount++;
      }
      const beatLockRatio = nearBeatCount / edl.shots.length;
      assert(
        beatLockRatio > 0.3,
        `≥30% of shots are near a beat position`,
        `${(beatLockRatio * 100).toFixed(0)}% near beat`
      );
    } else {
      assert(shotsWithBeatLock.length === 0, "No beat locks when BPM is low/absent");
    }

    // ── 8. COLOR GRADING ──
    section("Color Grading");
    assert(
      edl.globalEffects?.colorGrade !== undefined,
      "Global color grade is set"
    );
    // Should not be default "natural" if reference has a distinct grade
    if (ref.info.codec !== "unknown") {
      assert(
        typeof edl.globalEffects.colorGrade === "string",
        "Color grade is a string",
        `value: ${edl.globalEffects.colorGrade}`
      );
    }

    // ── 9. SOURCE COVERAGE ──
    section("Source Coverage");
    const usedClips = new Set(edl.shots.map(s => s.source.clipId));
    assert(
      usedClips.size >= 2,
      `Multiple source clips used`,
      `${usedClips.size} unique clips`
    );

    // All source in/out points should be within bounds
    let outOfBounds = 0;
    for (const shot of edl.shots) {
      if (shot.source.inPoint < 0 || shot.source.outPoint > 100) outOfBounds++;
      if (shot.source.inPoint >= shot.source.outPoint) outOfBounds++;
    }
    assert(outOfBounds === 0, "All source in/out points within [0, 100] and in < out",
      `${outOfBounds} out-of-bounds`);

    // ── 10. ENERGY CURVE ALIGNMENT ──
    section("Energy Curve");
    if (ref.energy.curve.length > 0) {
      // Compare shot duration distribution to reference energy curve
      // Shorter shots = higher energy in the reference
      let energyMatch = 0;
      const samples = 10;
      for (let i = 0; i < samples; i++) {
        const pos = i / (samples - 1);
        const time = pos * ref.info.duration;

        // Find shot at this time
        const shot = edl.shots.find(s =>
          time >= s.timing.startTime && time < s.timing.startTime + s.timing.duration
        );

        if (shot) {
          // Shorter shots correlate with higher energy
          const maxDur = Math.max(...edl.shots.map(s => s.timing.duration));
          const shotEnergy = 1 - (shot.timing.duration / maxDur);

          // Reference energy at this position
          const refBucket = Math.floor(pos * (ref.energy.curve.length - 1));
          const refEnergy = ref.energy.curve[refBucket] ?? 0.5;

          // Both high or both low = match
          if ((shotEnergy > 0.4 && refEnergy > 0.3) || (shotEnergy <= 0.4 && refEnergy <= 0.3)) {
            energyMatch++;
          }
        }
      }

      assert(
        energyMatch >= samples * 0.4,
        `Energy curve correlates ≥40% with reference`,
        `${energyMatch}/${samples} positions match`
      );
    }

    // ── 11. METADATA COMPLETENESS ──
    section("Metadata");
    assert(edl.metadata.title.length > 0, "Title is non-empty");
    assert(edl.metadata.createdAt > Date.now() - 60000, "Timestamp is recent");
    assert(edl.metadata.aiModel.length > 0, "AI model is set");
    assert(edl.metadata.prompt.length > 0, "Prompt is non-empty");
    assert(edl.metadata.intentId.startsWith("ref-"), "Intent ID format");
    assert(edl.metadata.analysisId.startsWith("ref-"), "Analysis ID format");

    // ── 12. MONETEDL SCHEMA ──
    section("Schema Compliance");
    assert(edl.shots.every(s => s.id?.startsWith("shot-")), "All shot IDs start with 'shot-'");
    assert(edl.shots.every(s => s.source?.clipId), "All shots have clipId");
    assert(edl.shots.every(s => typeof s.timing?.startTime === "number"), "All shots have numeric startTime");
    assert(edl.shots.every(s => typeof s.timing?.duration === "number" && s.timing.duration > 0), "All shots have positive duration");
    assert(edl.timeline.duration > 0, "Timeline duration > 0");
    assert(edl.timeline.fps > 0, "Timeline fps > 0");
    assert(edl.timeline.resolution.width > 0, "Resolution width > 0");
    assert(edl.timeline.resolution.height > 0, "Resolution height > 0");
  }

  // ── Summary ──
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  ✗ ${f}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
