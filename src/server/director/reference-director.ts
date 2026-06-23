// src/server/director/reference-director.ts
// Exposes the Editor DNA engine translating analyzed styles to AI rules

import type { ReferenceStyle } from "../types/reference-style";

/**
 * Build the "Reference Director" section injected into the EDL generation prompt.
 *
 * This is what makes Monet actually edit LIKE that creator.
 * We convert the analyzed ReferenceStyle into concrete, imperative
 * instructions that override Gemini's defaults and force it to think
 * like the reference editor — not generically.
 *
 * Philosophy: give Gemini the editor's CONTRACT, not just their numbers.
 */
export function buildReferenceDirectorSection(
  rs: ReferenceStyle,
  referenceMode: "strict_replication" | "inspired",
  targetDurationSec: number
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
