// src/server/director/reference-director.ts
// Exposes the Editor DNA engine translating analyzed styles to AI rules

import type { ReferenceStyle } from "../types/reference-style";
import type { MomentMap } from "../lib/moment-mapping";
import type { EffectVocabulary } from "../lib/effect-vocabulary";

/**
 * Build the "Reference Director" section injected into the EDL generation prompt.
 *
 * This is what makes Monet actually edit LIKE that creator.
 * We convert the analyzed ReferenceStyle into concrete, imperative
 * instructions that override Gemini's defaults and force it to think
 * like the reference editor — not generically.
 *
 * Philosophy: give Gemini the editor's CONTRACT, not just their numbers.
 *
 * @param rs - ReferenceStyle from Gemini analysis
 * @param referenceMode - strict_replication or inspired
 * @param targetDurationSec - Target output duration
 * @param momentMap - Optional moment-level mapping for precise editing
 * @param vocabulary - Optional effect vocabulary for specific effect instructions
 */
export function buildReferenceDirectorSection(
  rs: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired",
  targetDurationSec: number,
  momentMap?: MomentMap | null,
  vocabulary?: EffectVocabulary | null
): string {
  const im = rs.intentMapping;
  const ph = rs.editingPhilosophy;
  const sl = rs.shotLanguage;
  const pa = rs.pacing;
  const ef = rs.effects;
  const em = rs.emotionalArc;

  // Energy curve as human-readable description
  const curveDesc = pa.energyCurve
    .map((v, i) => `${i * 10}%: ${v >= 0.8 ? "🔥 intense" : v >= 0.5 ? "➡️ moderate" : "💧 calm"} (${v.toFixed(1)})`)
    .join(", ");

  const replicationContract = buildReferenceReplicationContract(
    rs,
    referenceMode,
    targetDurationSec
  );

  return `

## REFERENCE DIRECTOR STYLE — OVERRIDE DEFAULTS WITH THIS

You have analyzed a reference video from a specific editor. You must edit like THEM, not generically.
Deviate from this only if the footage physically cannot support it.

### The Editor's Philosophy

"${ph.summary}"

Their rhythm contract: "${ph.rhythmContract}"

Restraint level: ${ph.restraintLevel} (${
  ph.restraintLevel === "minimal"
      ? "hold back — silence and negative space are intentional"
      : ph.restraintLevel === "heavy"
      ? "maximum stimulation — every frame has purpose and energy"
      : "balanced — controlled intensity, not maximalist"
  })

Their signature move: ${ph.signatureMove}

### Concrete Rules You MUST Follow

**Shot timing**:
- Average shot duration: **${im.avgShotDuration.toFixed(1)}s** (hard target — measure your output)
- Vary by ±${Math.round(rs.rhythm.avgShotDuration * 0.3 * 10) / 10}s around that center
- Pacing type: ${im.pacing}

**Beat sync**:
- Cut alignment: **${rs.rhythm.cutAlignment}** (${
    rs.rhythm.cutAlignment === "strict"
      ? "EVERY cut must land within 50ms of a beat grid point"
      : rs.rhythm.cutAlignment === "loose"
      ? "cuts near beats preferred but can anticipate or delay by up to 200ms"
      : "ignore beat grid — this editor cuts for visual rhythm, not musical"
  })
- Beats per cut ratio: ${rs.rhythm.beatsPerCut.toFixed(1)} beats between cuts on average

**Energy curve** — your edit's energy must match this shape:
${curveDesc}
- Climax position: ${Math.round(pa.climaxPosition * 100)}% through the video
${pa.breathingMoments.length > 0 ? `- Breathing moments (deliberate slowdowns): around ${pa.breathingMoments.map(t => `${t.toFixed(1)}s`).join(", ")}` : ""}

**Shot selection — what this editor chooses**:
- Subject focus: ${sl.subjectFocus.join(", ")} (prioritize footage segments showing THESE subjects)
- Closeup ratio: ${Math.round(sl.closeupRatio * 100)}% of shots should be closeups
- Camera motion preference: ${sl.motionPreference === "moving" ? "favor footage with camera movement" : sl.motionPreference === "static" ? "favor static, composed shots" : "mix of moving and static"}
- Sequence grammar to apply: ${sl.sequencePatterns.length > 0 ? sl.sequencePatterns.join(", ") : "no specific sequence pattern required"}

**Effects**:
- ${Math.round(ef.effectsFrequency * 100)}% of shots should have an effect
- Effects used by this editor: ${ef.commonEffects.length > 0 ? ef.commonEffects.join(", ") : "minimal effects"}
- Transitions: ${Math.round(ef.transitionsBreakdown.cutPercentage * 100)}% cuts / ${Math.round(ef.transitionsBreakdown.crossfadePercentage * 100)}% crossfades / ${Math.round(ef.transitionsBreakdown.otherPercentage * 100)}% other

**Visual style**:
- Color grade: ${im.colorTreatment}
- Color temperature: ${rs.visualStyle.colorTemperature}
- Contrast: ${rs.visualStyle.contrastLevel}

**Emotional architecture**:
- Open with: ${em.openingMood} energy
- Peak at: ${em.peakMood}
- Close with: ${em.closingMood}
- Overall arc: ${em.emotionalContour}

### aiRationale Instructions

Write each shot's aiRationale the way THIS editor would think.
- Reference their philosophy: why would THEY choose this moment?
- Be specific: "This closeup of [action] at the ${Math.round(pa.climaxPosition * 100)}% climax point mirrors the reference editor's signature move of ${ph.signatureMove.toLowerCase()}"
- Not generic: never write "high motion score" — write what a human editor would say

${buildMomentMapSection(momentMap, targetDurationSec)}
${buildEffectVocabularySection(vocabulary)}

${replicationContract}

---
`;
}

export function buildReferenceReplicationContract(
  rs: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired",
  targetDurationSec: number
): string {
  const transitionCuts = Math.round(rs.effects.transitionsBreakdown.cutPercentage * 100);
  const transitionCrossfades = Math.round(
    rs.effects.transitionsBreakdown.crossfadePercentage * 100
  );
  const effectsFrequency = Math.round(rs.effects.effectsFrequency * 100);
  const targetShots = Math.max(1, Math.round(targetDurationSec / rs.rhythm.avgShotDuration));
  const strict = referenceMode === "strict_replication";

  return `
### Reference Replication Contract (${referenceMode})

Apply the reference to new footage as a structural clone, not a content clone.
Never copy specific frames/shots from the reference source; map the same editing logic onto available footage.

${strict ? "STRICT REQUIREMENTS (hard constraints):" : "INSPIRED REQUIREMENTS (soft constraints):"}
- Target shot count around ${targetShots} (duration ${targetDurationSec.toFixed(1)}s / avg shot ${rs.rhythm.avgShotDuration.toFixed(2)}s)
- Keep average shot duration within ${strict ? "±15%" : "±30%"} of ${rs.rhythm.avgShotDuration.toFixed(2)}s
- Keep transition mix near ${transitionCuts}% cuts and ${transitionCrossfades}% crossfades (${strict ? "±8pp" : "±15pp"} tolerance)
- Keep effects frequency near ${effectsFrequency}% of shots (${strict ? "±8pp" : "±15pp"} tolerance)
- Match macro energy curve and climax timing at ${Math.round(rs.pacing.climaxPosition * 100)}% timeline position
- Preserve subject focus priorities: ${rs.shotLanguage.subjectFocus.join(", ") || "none"}

Deliverable behavior:
- If reference says strict beat alignment, lock cuts to beats wherever musically possible.
- If footage quality or coverage is insufficient, degrade gracefully and explain deviations in aiRationale.
- In strict mode, prioritize preserving reference rhythm over adding extra novelty.
`;
}

/**
 * Build the moment map section of the prompt.
 * This gives the EDL generator specific timeline positions to hit.
 */
function buildMomentMapSection(
  momentMap: MomentMap | null | undefined,
  targetDurationSec: number
): string {
  if (!momentMap || momentMap.moments.length === 0) return "";

  const mustHit = momentMap.moments.filter(m => m.priority === "must_hit");
  const shouldHit = momentMap.moments.filter(m => m.priority === "should_hit");

  const momentLines: string[] = [];

  if (mustHit.length > 0) {
    momentLines.push("**MUST-HIT MOMENTS (non-negotiable)**:");
    for (const m of mustHit) {
      const timePercent = Math.round(m.normalizedTime * 100);
      momentLines.push(
        `  - [${timePercent}%] ${m.type}: ${m.description} (duration: ${m.shotDuration.toFixed(2)}s, effects: ${m.effects.map(e => e.type).join(", ") || "none"})`
      );
    }
  }

  if (shouldHit.length > 0) {
    momentLines.push("**SHOULD-HIT MOMENTS (strong preference)**:");
    for (const m of shouldHit) {
      const timePercent = Math.round(m.normalizedTime * 100);
      momentLines.push(
        `  - [${timePercent}%] ${m.type}: ${m.description} (duration: ${m.shotDuration.toFixed(2)}s)`
      );
    }
  }

  if (momentLines.length === 0) return "";

  return `
### MOMENT MAP — Match these specific timeline positions

The reference editor makes specific decisions at these exact timeline positions.
You MUST place shots at these positions with the specified characteristics.

${momentLines.join("\n")}

Rhythm pattern: ${momentMap.rhythmPattern}
Climax position: ${Math.round(momentMap.climaxPosition * 100)}% of timeline
Breathing moments: ${momentMap.breathingPositions.map(t => `${Math.round(t * 100)}%`).join(", ") || "none"}
`;
}

/**
 * Build the effect vocabulary section of the prompt.
 * This gives the EDL generator specific effects to use and when.
 */
function buildEffectVocabularySection(
  vocabulary: EffectVocabulary | null | undefined
): string {
  if (!vocabulary || vocabulary.totalEffects === 0) return "";

  // Get top effects by frequency
  const topEffects = Object.entries(vocabulary.effectFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  if (topEffects.length === 0) return "";

  const effectLines = topEffects.map(([type, count]) => {
    const pct = Math.round((count / vocabulary.totalEffects) * 100);
    return `  - ${type}: ${count} occurrences (${pct}%)`;
  });

  const transitionLines: string[] = [];
  const tb = vocabulary.transitionBreakdown;
  const totalTransitions = tb.cuts + tb.crossfades + tb.whipPans + tb.other;
  if (totalTransitions > 0) {
    transitionLines.push(`  - Cuts: ${Math.round((tb.cuts / totalTransitions) * 100)}%`);
    transitionLines.push(`  - Crossfades: ${Math.round((tb.crossfades / totalTransitions) * 100)}%`);
    transitionLines.push(`  - Whip pans: ${Math.round((tb.whipPans / totalTransitions) * 100)}%`);
  }

  // Effect hotspots
  const hotspotLines = vocabulary.effectTimeline
    .filter(b => b.effects.length >= 2)
    .slice(0, 5)
    .map(b => `  - [${Math.round(b.normalized * 100)}%] ${b.effects.join(", ")} (intensity: ${b.intensity.toFixed(2)})`);

  return `
### EFFECT VOCABULARY — Use these specific effects

Average effects per shot: ${vocabulary.avgEffectsPerShot.toFixed(1)}
Total effects in reference: ${vocabulary.totalEffects}

Most used effects:
${effectLines.join("\n")}

Transition breakdown:
${transitionLines.join("\n")}

Effect hotspots (moments with clustered effects):
${hotspotLines.length > 0 ? hotspotLines.join("\n") : "  (none detected)"}

INSTRUCTIONS:
- Use the effects listed above at their observed frequency
- Place effect hotspots at the timeline positions shown
- Match the transition breakdown percentages
- Every effect must serve the edit's emotional arc, not just decoration
`;
}
