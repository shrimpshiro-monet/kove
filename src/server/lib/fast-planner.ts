// Deterministic EDL fallback when all AI providers fail.
// NO LLM. Pure math. Always works. Looks like a template — but ships.

import { effectMapper, type EffectIntent } from "./effect-mapper";

interface FootageAnalysis {
  clipId: string;
  duration: number;
  segments: Array<{
    startTime: number;
    endTime: number;
    motionLevel: "static" | "low" | "medium" | "high" | "extreme";
    dominantColors: string[];
    energyScore: number;
    visualInterestScore: number;
    description: string;
  }>;
}

interface MusicAnalysis {
  sourceId: string;
  duration: number;
  bpm: number;
  onsets: number[];
  beatGrid: number[];
}

interface Intent {
  style: string | { energy: string; pacing: string };
  energy?: string;
  goal?: { primary: string };
}

type PacingClass = "rapid" | "medium" | "cinematic" | "dialogue";

interface PacingBounds {
  minShotDuration: number;
  maxShotDuration: number;
  targetShotCount: number;
}

const PACING_BOUNDS: Record<PacingClass, PacingBounds> = {
  rapid:    { minShotDuration: 0.7, maxShotDuration: 2.0, targetShotCount: 20 },
  medium:   { minShotDuration: 1.0, maxShotDuration: 2.5, targetShotCount: 15 },
  cinematic:{ minShotDuration: 1.8, maxShotDuration: 4.0, targetShotCount: 10 },
  dialogue: { minShotDuration: 2.5, maxShotDuration: 6.0, targetShotCount: 7 },
};

function parsePacingClass(prompt: string): PacingClass {
  const lower = prompt.toLowerCase();
  
  // Check for explicit medium/moderate indicators first
  if (/\b(medium|moderate|balanced|controlled)\b/.test(lower)) {
    // If "medium" is explicitly mentioned, use medium unless strong rapid indicators
    if (/\b(rapid|hype|aggressive)\b/.test(lower)) return "rapid";
    if (/\b(slow|moody|cinematic|restrained|emotional)\b/.test(lower)) return "cinematic";
    return "medium";
  }
  
  // Check for cinematic/slow indicators
  if (/\b(slow|moody|cinematic|restrained|emotional|reflective|gentle)\b/.test(lower)) return "cinematic";
  
  // Check for dialogue indicators
  if (/\b(dialogue|drama|character|story|readable|conversational)\b/.test(lower)) return "dialogue";
  
  // Check for rapid indicators (only strong signals)
  if (/\b(rapid|hype|aggressive|quick|fast-paced)\b/.test(lower)) return "rapid";
  
  // Default to medium for ambiguous prompts
  return "medium";
}

function getEnergyMultiplier(position: number, pacingClass: PacingClass): number {
  // position: 0 = start, 1 = end
  // Returns a multiplier for shot duration (shorter = more energy)
  const arc = pacingClass === "rapid"
    ? 0.8 + 0.4 * Math.sin(position * Math.PI) // peak in middle
    : pacingClass === "cinematic"
    ? 1.2 - 0.4 * Math.sin(position * Math.PI) // slower in middle
    : 1.0; // medium: flat
  return arc;
}

interface FastPlannerOpts {
  intent: Intent;
  footage: FootageAnalysis[];
  music: MusicAnalysis;
  intentId: string;
  analysisId: string;
  prompt: string;
  targetDuration?: number;
  fps?: number;
  resolution?: { width: number; height: number };
  referenceStyle?: any;
}

export const fastPlanner = {
  generate(opts: FastPlannerOpts) {
    const {
      intent,
      footage,
      music,
      intentId,
      analysisId,
      prompt,
      targetDuration = Math.min(music?.duration ?? 30, 30),
      fps = 30,
      resolution = { width: 1920, height: 1080 },
      referenceStyle,
    } = opts;

    // Parse pacing class from prompt
    const pacingClass = parsePacingClass(prompt);
    const pacingBounds = PACING_BOUNDS[pacingClass];
    console.log("[fast-planner] Pacing class:", pacingClass, "bounds:", pacingBounds);

    // Use reference pacing if available to determine shot count
    const refAvgShotDuration = referenceStyle?.rhythm?.avgShotDuration;
    const refPacing = referenceStyle?.intentMapping?.pacing;
    
    // Shot count: use reference avg shot duration if available, otherwise use pacing class
    let shotCount: number;
    if (refAvgShotDuration && refAvgShotDuration > 0) {
      shotCount = Math.max(4, Math.min(20, Math.round(targetDuration / refAvgShotDuration)));
      console.log("[fast-planner] Using reference pacing:", { avgShotDuration: refAvgShotDuration, shotCount });
    } else {
      // Use pacing class to determine shot count
      const avgShotDuration = (pacingBounds.minShotDuration + pacingBounds.maxShotDuration) / 2;
      shotCount = Math.max(4, Math.min(20, Math.round(targetDuration / avgShotDuration)));
    }

    // Generate onsets spanning the full target duration if no music analysis exists
    let onsets = music?.onsets?.length > 0 ? music.onsets : music?.beatGrid?.length > 0 ? music.beatGrid : [];
    if (onsets.length === 0) {
      // Create synthetic onsets every 1.5s across the full duration
      onsets = [];
      for (let t = 0; t <= targetDuration; t += 1.5) {
        onsets.push(t);
      }
    }
    const allSegments = (Array.isArray(footage) ? footage : []).flatMap((clip) =>
      (clip.segments ?? []).map((seg) => {
        const raw = seg as any;
        // Extract CV metrics if available
        const cvMetrics = raw?.cvMetrics ?? null;
        
        // Use CV metrics for scores if available, otherwise use position-based heuristics
        const motionScore = cvMetrics?.motionScore ?? raw?.scores?.motion ?? 0.5;
        const brightnessScore = cvMetrics?.brightnessScore ?? 0.5;
        const sharpnessScore = cvMetrics?.blurScore ?? raw?.scores?.visual ?? 0.5;
        const overallQuality = cvMetrics?.overallQuality ?? raw?.scores?.overall ?? 0.5;
        
        return {
        clipId: clip.clipId,
        seg: {
          ...seg,
          // Normalize field names
          startTime: seg.startTime ?? raw.start ?? 0,
          endTime: seg.endTime ?? raw.end ?? raw.duration ?? 10,
          // Use CV-backed scores
          visualInterestScore: raw?.scores?.interest ?? overallQuality,
          energyScore: raw?.scores?.motion ?? motionScore,
          motionLevel: (
            motionScore > 0.7 ? "high" :
            motionScore > 0.4 ? "medium" :
            motionScore > 0.2 ? "low" : "static"
          ) as "static" | "low" | "medium" | "high" | "extreme",
          dominantColors: seg.dominantColors ?? [],
          // Attach CV metrics for downstream use
          cvMetrics: cvMetrics ? {
            motionScore: cvMetrics.motionScore,
            brightnessScore: cvMetrics.brightnessScore,
            blurScore: cvMetrics.blurScore,
            sceneChangeScore: cvMetrics.sceneChangeScore,
            overallQuality: cvMetrics.overallQuality,
            isBlackFrame: cvMetrics.isBlackFrame,
            isStaticFrame: cvMetrics.isStaticFrame,
          } : null,
        },
      };
      })
    );

    // Safety: build a set of valid clip IDs from the footage analysis
    const validClipIds = new Set((Array.isArray(footage) ? footage : []).map((f) => f.clipId));
    const firstValidClipId = Array.from(validClipIds)[0] || "unknown";

    // Sort by visual interest — boosted by reference-awareness and CV metrics
    const ranked = [...allSegments].sort((a, b) => {
      // Base score: visual interest + energy
      let scoreA = a.seg.visualInterestScore + a.seg.energyScore;
      let scoreB = b.seg.visualInterestScore + b.seg.energyScore;
      
      // CV metrics boost if available (from footage analysis metadata)
      const cvA = (a.seg as any).cvMetrics;
      const cvB = (b.seg as any).cvMetrics;
      if (cvA) {
        scoreA += cvA.overallQuality * 0.4;
        // Penalize black/static frames
        if (cvA.isBlackFrame) scoreA *= 0.1;
        if (cvA.isStaticFrame) scoreA *= 0.3;
      }
      if (cvB) {
        scoreB += cvB.overallQuality * 0.4;
        if (cvB.isBlackFrame) scoreB *= 0.1;
        if (cvB.isStaticFrame) scoreB *= 0.3;
      }
      
      // Reference boost: prefer segments that match reference motion profile
      if (referenceStyle?.motionEnergyProfile?.length > 0) {
        const refAvgMotion = referenceStyle.motionEnergyProfile.reduce((s: number, v: number) => s + v, 0) / referenceStyle.motionEnergyProfile.length;
        const motionA = a.seg.energyScore;
        const motionB = b.seg.energyScore;
        // Boost segments closer to reference motion level
        scoreA += (1 - Math.abs(motionA - refAvgMotion)) * 0.3;
        scoreB += (1 - Math.abs(motionB - refAvgMotion)) * 0.3;
      }
      
      // Reference boost: prefer high-energy segments for aggressive pacing
      if (refPacing === "fast" || refPacing === "aggressive") {
        scoreA += a.seg.energyScore * 0.2;
        scoreB += b.seg.energyScore * 0.2;
      }
      
      // Pacing-class adjustments
      if (pacingClass === "rapid") {
        // Prefer high-motion segments
        scoreA += a.seg.energyScore * 0.2;
        scoreB += b.seg.energyScore * 0.2;
      } else if (pacingClass === "cinematic") {
        // Prefer well-exposed, sharp segments
        if (cvA) scoreA += cvA.blurScore * 0.2; // sharpness
        if (cvB) scoreB += cvB.blurScore * 0.2;
      }
      
      return scoreB - scoreA;
    });

    // Pick shots — quality-based selection with position awareness
    const picked: typeof ranked = [];
    const usedSegments = new Set<number>();
    const usedClipIds = new Set<string>();
    
    for (let i = 0; i < shotCount; i++) {
      const position = i / shotCount;
      
      // Determine timeline section for this shot
      let section: "intro" | "build" | "peak" | "release";
      if (position < 0.15) section = "intro";
      else if (position < 0.6) section = "build";
      else if (position < 0.85) section = "peak";
      else section = "release";
      
      // Determine what we're looking for in this section
      let targetMotion: number;
      let targetSharpness: number;
      let motionWeight: number;
      let sharpnessWeight: number;
      
      if (section === "intro") {
        // Intro: readable, moderate motion, high sharpness
        targetMotion = 0.4;
        targetSharpness = 0.7;
        motionWeight = 0.2;
        sharpnessWeight = 0.4;
      } else if (section === "peak") {
        // Peak: highest motion, highest visual interest
        targetMotion = 0.8;
        targetSharpness = 0.5;
        motionWeight = 0.5;
        sharpnessWeight = 0.2;
      } else if (section === "release") {
        // Release: cleaner, calmer
        targetMotion = 0.3;
        targetSharpness = 0.6;
        motionWeight = 0.3;
        sharpnessWeight = 0.3;
      } else {
        // Build: rising energy
        targetMotion = 0.3 + (position * 0.5); // 0.3-0.55
        targetSharpness = 0.6;
        motionWeight = 0.35;
        sharpnessWeight = 0.3;
      }
      
      // Find best segment for this position
      let bestIdx = -1;
      let bestScore = -1;
      
      for (let j = 0; j < ranked.length; j++) {
        const seg = ranked[j];
        const segIdx = (seg.seg as any).segmentIndex ?? j;
        
        // Skip already-used segments (unless we've exhausted all)
        if (usedSegments.has(segIdx) && usedSegments.size < ranked.length) {
          continue;
        }
        
        // CV metrics for quality
        const cv = (seg.seg as any).cvMetrics;
        
        // Motion fit: how close to target motion
        const motionFit = cv
          ? 1 - Math.abs(cv.motionScore - targetMotion)
          : 1 - Math.abs(seg.seg.energyScore - targetMotion);
        
        // Sharpness fit
        const sharpnessFit = cv
          ? cv.blurScore
          : seg.seg.visualInterestScore;
        
        // Position-based scoring
        let positionScore = 0;
        if (section === "intro") {
          // Intro: prefer establishing shots (moderate motion)
          positionScore = 1 - Math.abs(seg.seg.energyScore - 0.4);
        } else if (section === "peak") {
          // Peak: prefer high-energy moments
          positionScore = seg.seg.energyScore;
        } else if (section === "release") {
          // Resolution: prefer calmer moments
          positionScore = 1 - seg.seg.energyScore;
        } else {
          // Build/release: balanced
          positionScore = 0.5;
        }
        
        // Quality penalty for bad segments
        let qualityPenalty = 0;
        if (cv) {
          if (cv.isBlackFrame) qualityPenalty -= 0.8;
          if (cv.isStaticFrame) qualityPenalty -= 0.3;
          if (cv.brightnessScore < 0.1 || cv.brightnessScore > 0.9) qualityPenalty -= 0.2;
        }
        
        // Novelty bonus: prefer segments from different parts of the footage
        const noveltyBonus = !usedClipIds.has(seg.clipId) ? 0.1 : 0;
        
        // Total score: weighted combination
        const totalScore = (
          motionFit * motionWeight +
          sharpnessFit * sharpnessWeight +
          positionScore * 0.3 +
          qualityPenalty +
          noveltyBonus
        );
        
        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestIdx = j;
        }
      }
      
      if (bestIdx >= 0) {
        picked.push(ranked[bestIdx]);
        usedSegments.add((ranked[bestIdx].seg as any).segmentIndex ?? bestIdx);
        usedClipIds.add(ranked[bestIdx].clipId);
      } else if (ranked.length > 0) {
        // Fallback: cycle through remaining
        picked.push(ranked[i % ranked.length]);
      }
    }

    // Generate cut times with energy arc and pacing bounds
    const cutTimes: number[] = [0];
    let currentTime = 0;
    
    for (let i = 0; i < shotCount; i++) {
      const position = i / shotCount;
      const energyMult = getEnergyMultiplier(position, pacingClass);
      
      // Base duration from pacing bounds, modulated by energy arc
      const baseDuration = (pacingBounds.minShotDuration + pacingBounds.maxShotDuration) / 2;
      let shotDuration = baseDuration * energyMult;
      
      // Clamp to pacing bounds
      shotDuration = Math.max(pacingBounds.minShotDuration, Math.min(pacingBounds.maxShotDuration, shotDuration));
      
      // For last shot, fill remaining duration
      if (i === shotCount - 1) {
        shotDuration = targetDuration - currentTime;
      }
      
      // Snap to nearest onset if close enough
      const idealEnd = currentTime + shotDuration;
      const snapWindow = shotDuration * 0.3; // 30% window
      const nearestOnset = onsets.reduce(
        (best, t) => (Math.abs(t - idealEnd) < Math.abs(best - idealEnd) && Math.abs(t - idealEnd) <= snapWindow ? t : best),
        idealEnd // default to ideal if no onset close enough
      );
      
      // Ensure minimum duration
      const actualEnd = Math.max(currentTime + pacingBounds.minShotDuration, nearestOnset);
      cutTimes.push(actualEnd);
      currentTime = actualEnd;
    }
    
    // Force last cut to exactly targetDuration
    cutTimes[cutTimes.length - 1] = targetDuration;
    
    // Ensure monotonically increasing
    for (let i = 1; i < cutTimes.length; i++) {
      if (cutTimes[i] <= cutTimes[i - 1]) {
        cutTimes[i] = cutTimes[i - 1] + pacingBounds.minShotDuration;
      }
    }
    // Ensure total duration is correct
    if (cutTimes[cutTimes.length - 1] !== targetDuration) {
      cutTimes[cutTimes.length - 1] = targetDuration;
    }

    const shots = picked.map((p, i) => {
      const startTime = cutTimes[i];
      const duration = Math.max(pacingBounds.minShotDuration, cutTimes[i + 1] - startTime);
      const segDuration = p.seg.endTime - p.seg.startTime;
      const position = i / shotCount;
      
      // Determine timeline section for this shot
      let section: "intro" | "build" | "peak" | "release";
      if (position < 0.15) section = "intro";
      else if (position < 0.6) section = "build";
      else if (position < 0.85) section = "peak";
      else section = "release";
      
      // Use golden-ratio based offset for maximum diversity across shots
      const PHI = 1.618033988749895;
      const goldenOffset = ((i * PHI) % 1) * segDuration;
      const inPoint = Math.min(p.seg.startTime + goldenOffset, p.seg.endTime - Math.min(duration, 0.5));
      const outPoint = Math.min(inPoint + Math.min(duration, segDuration), p.seg.endTime);

      // Safety: enforce valid clipId
      const clipId = validClipIds.has(p.clipId) ? p.clipId : firstValidClipId;

      // Position-aware effect selection with variety
      let chosen: { type: EffectIntent["type"]; trigger: EffectIntent["trigger"] };
      
      if (section === "intro") {
        // Intro: subtle, establishing
        chosen = pacingClass === "rapid"
          ? { type: "subject_focus", trigger: "sustained" }
          : { type: "subject_focus", trigger: "sustained" };
      } else if (section === "peak") {
        // Peak: highest energy, impact
        if (pacingClass === "rapid") {
          const peakPool = [
            { type: "impact_hit" as const, trigger: "one_shot" as const },
            { type: "speed_emphasis" as const, trigger: "sustained" as const },
            { type: "glitch_chaos" as const, trigger: "one_shot" as const },
          ];
          chosen = peakPool[i % peakPool.length];
        } else if (pacingClass === "cinematic") {
          const peakPool = [
            { type: "tension_build" as const, trigger: "sustained" as const },
            { type: "dreamy_soft" as const, trigger: "sustained" as const },
            { type: "subject_focus" as const, trigger: "sustained" as const },
            { type: "color_pop" as const, trigger: "sustained" as const },
          ];
          chosen = peakPool[i % peakPool.length];
        } else {
          chosen = { type: "energy_boost", trigger: "cut_in" };
        }
      } else if (section === "release") {
        // Release: calming
        if (pacingClass === "rapid") {
          chosen = { type: "subject_focus", trigger: "sustained" };
        } else if (pacingClass === "cinematic") {
          const releasePool = [
            { type: "dreamy_soft" as const, trigger: "sustained" as const },
            { type: "subject_focus" as const, trigger: "sustained" as const },
          ];
          chosen = releasePool[i % releasePool.length];
        } else {
          chosen = { type: "dreamy_soft", trigger: "sustained" };
        }
      } else {
        // Build: varied based on pacing class with rotation
        if (pacingClass === "rapid") {
          const buildPool = [
            { type: "speed_emphasis" as const, trigger: "sustained" as const },
            { type: "impact_hit" as const, trigger: "one_shot" as const },
            { type: "glitch_chaos" as const, trigger: "one_shot" as const },
            { type: "subject_focus" as const, trigger: "sustained" as const },
            { type: "tension_build" as const, trigger: "cut_in" as const },
          ];
          chosen = buildPool[i % buildPool.length];
        } else if (pacingClass === "cinematic") {
          const buildPool = [
            { type: "dreamy_soft" as const, trigger: "sustained" as const },
            { type: "subject_focus" as const, trigger: "sustained" as const },
            { type: "tension_build" as const, trigger: "sustained" as const },
            { type: "color_pop" as const, trigger: "sustained" as const },
          ];
          chosen = buildPool[i % buildPool.length];
        } else if ((pacingClass as string) === "cinematic") {
          const buildPool = [
            { type: "dreamy_soft" as const, trigger: "sustained" as const },
            { type: "subject_focus" as const, trigger: "sustained" as const },
            { type: "tension_build" as const, trigger: "sustained" as const },
          ];
          chosen = buildPool[i % buildPool.length];
        } else if ((pacingClass as string) === "dialogue") {
          chosen = { type: "subject_focus", trigger: "sustained" };
        } else {
          const buildPool = [
            { type: "color_pop" as const, trigger: "sustained" as const },
            { type: "energy_boost" as const, trigger: "sustained" as const },
            { type: "dreamy_soft" as const, trigger: "sustained" as const },
            { type: "subject_focus" as const, trigger: "sustained" as const },
          ];
          chosen = buildPool[i % buildPool.length];
        }
      }
      
      // Energy-aware intensity: dramatic arc across timeline
      // intro: 0.2-0.3, build: 0.3-0.5, peak: 0.6-0.8, release: 0.3-0.4
      const baseByPacing = pacingClass === "rapid" ? 0.15 : pacingClass === "cinematic" ? 0.1 : 0.12;
      let intensity: number;
      if (section === "intro") {
        intensity = baseByPacing + 0.1; // subtle
      } else if (section === "build") {
        intensity = baseByPacing + 0.2 + (position * 0.3); // building
      } else if (section === "peak") {
        intensity = baseByPacing + 0.5 + (Math.sin((position - 0.6) / 0.25 * Math.PI) * 0.2); // maximum
      } else {
        intensity = baseByPacing + 0.15; // winding down
      }
      intensity = Math.max(0.1, Math.min(0.85, intensity));

      const effectIntent: EffectIntent = {
        type: chosen.type,
        intensity,
        trigger: chosen.trigger,
      };

      const effects = effectMapper.toEffects({
        intent: effectIntent,
        shotStartTime: startTime,
        shotDuration: duration,
        shotMotionLevel: p.seg.motionLevel,
        shotColors: p.seg.dominantColors,
        beatLockOnsetTime: startTime,
      });

      // Transition energy arc
      let transitionType: string;
      if (section === "intro") {
        // Intro: smooth entry
        transitionType = pacingClass === "rapid" ? "flash" : "crossfade";
      } else if (section === "peak") {
        // Peak: energetic, fast
        if (pacingClass === "rapid") {
          transitionType = i % 2 === 0 ? "flash" : "cut";
        } else if (pacingClass === "cinematic") {
          transitionType = i % 3 === 0 ? "crossfade" : "cut";
        } else {
          transitionType = i % 4 === 0 ? "flash" : "cut";
        }
      } else if (section === "release") {
        // Release: smoother
        transitionType = pacingClass === "rapid" ? "cut" : "crossfade";
      } else {
        // Build: varied, increasing energy
        if (pacingClass === "rapid") {
          // More flashes as we approach peak
          const flashChance = 0.2 + (position * 0.3); // 20-50% chance
          transitionType = Math.random() < flashChance ? "flash" : "cut";
        } else if (pacingClass === "cinematic") {
          transitionType = i % 2 === 0 ? "crossfade" : i % 5 === 0 ? "dip_black" : "cut";
        } else if (pacingClass === "dialogue") {
          transitionType = i % 3 === 0 ? "crossfade" : "cut";
        } else {
          transitionType = ["cut", "cut", "crossfade", "flash", "cut", "dip_black"][i % 6];
        }
      }

      // Selection metadata
      const segmentScore = p.seg.visualInterestScore + p.seg.energyScore;
      const cv = (p.seg as any).cvMetrics;
      const cvScore = cv?.overallQuality ?? null;

      // Selection metadata with actual computed values
      const selectionMeta = {
        section,
        segmentScore,
        cvScore,
        motionScore: cv?.motionScore ?? p.seg.energyScore,
        brightnessScore: cv?.brightnessScore ?? 0.5,
        sharpnessScore: cv?.blurScore ?? p.seg.visualInterestScore,
        selectionReason: cv && cv.overallQuality != null
          ? `cv_quality=${cv.overallQuality.toFixed(2)}, motion=${cv.motionScore.toFixed(2)}, brightness=${cv.brightnessScore.toFixed(2)}, sharpness=${cv.blurScore.toFixed(2)}`
          : `interest=${p.seg.visualInterestScore.toFixed(2)}, energy=${p.seg.energyScore.toFixed(2)}`,
        pacingClass,
        sourceTimestamp: `${inPoint.toFixed(2)}-${outPoint.toFixed(2)}s`,
      };

      return {
        id: `shot_${String(i + 1).padStart(3, "0")}`,
        source: { clipId, inPoint, outPoint },
        timing: { startTime, duration, speed: 1 },
        effects,
        transition: transitionType === "cut"
          ? { type: "cut" as const, duration: 0 }
          : { type: transitionType as any, duration: 0.3 },
        beatLock: {
          onsetIndex: onsets.indexOf(startTime),
          onsetTime: startTime,
          quantization: "soft" as const,
        },
        meta: selectionMeta,
        aiRationale:
          i === 0 ? `intro shot — ${chosen.type}` :
          i === shotCount - 1 ? `closer shot — ${chosen.type}` :
          position > 0.6 && position < 0.85 ? `peak moment — ${chosen.type}` :
          `${chosen.type} for visual variety`,
      };
    });

    return {
      version: "1.0.0",
      metadata: {
        title: "Monet Edit (Fast Planner)",
        createdAt: Date.now(),
        aiModel: "fast_planner_v1",
        prompt,
        intentId,
        analysisId,
      },
      timeline: { resolution, fps, duration: targetDuration },
      shots,
      music: {
        sourceId: music?.sourceId ?? "",
        bpm: music?.bpm ?? 120,
        beatGrid: music?.beatGrid ?? [0, 0.5, 1, 1.5, 2],
      },
    };
  },
};
