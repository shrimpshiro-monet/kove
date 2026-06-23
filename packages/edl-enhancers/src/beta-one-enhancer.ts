import { MonetEDL } from "@monet/edl/src/schemas";
import { EnhancerContext, EnhancerResult } from "./types";

import { applyPushIn } from "./push-in-motion";
import { applySpeedRamp } from "./speed-ramp-lite";
import { applyImpactFlash } from "./impact-flash";
import { applyShake } from "./context-shake";
import { injectSFX } from "./sfx-injection";
import { applyBeatCuts } from "./beat-sync";

export function runBetaOneEnhancers(
  ctx: EnhancerContext
): EnhancerResult {
  try {
    const edl = structuredClone(ctx.edl);

    // ✅ Beat cuts first
    if (ctx.audioAnalysis?.beats?.length) {
      applyBeatCuts(edl, ctx.audioAnalysis.beats);
    }

    // ✅ Per clip effects
    for (const track of edl.timeline.tracks) {
      for (const clip of track.clips) {
        applyPushIn(clip);
        applySpeedRamp(clip);
        applyImpactFlash(clip);
        applyShake(clip);
      }
    }

    // ✅ Global injections
    injectSFX(edl);

    return { success: true, edl };
  } catch (err) {
    console.error("[Enhancer] Failed", err);

    return {
      success: false,
      error: {
        code: "ENHANCER_FAIL",
        message: "Enhancer pipeline failed",
      },
    };
  }
}