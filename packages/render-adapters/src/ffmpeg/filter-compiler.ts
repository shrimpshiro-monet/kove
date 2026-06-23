import type { MonetEDL } from "@monet/edl/src/schemas";

export interface CompileFilterResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
  data?: {
    filterComplex: string;
    videoOutputLabel: string;
    audioOutputLabel?: string;
  };
}

interface EffectBlock {
  id: string;
  type: string;
  start: number;
  duration: number;
  params: Record<string, unknown>;
}

function numberParam(
  params: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = params[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function escapeExpression(value: string): string {
  return value.replace(/'/g, "\\'");
}

function compileImpactFlash(
  inputLabel: string,
  outputLabel: string,
  effect: EffectBlock
): string {
  const intensity = Math.max(0, Math.min(2, numberParam(effect.params, "intensity", 0.8)));
  const start = Math.max(0, effect.start);
  const end = Math.max(start, start + Math.max(0.01, effect.duration));

  return `[${inputLabel}]eq=brightness='if(between(t,${start.toFixed(3)},${end.toFixed(3)}),${intensity.toFixed(3)},0)':contrast='if(between(t,${start.toFixed(3)},${end.toFixed(3)}),1.15,1)'[${outputLabel}]`;
}

function compileContextShake(
  inputLabel: string,
  outputLabel: string,
  effect: EffectBlock
): string {
  const intensity = Math.max(0, Math.min(100, numberParam(effect.params, "intensity", 0.4) * 30));
  const frequency = Math.max(1, Math.min(60, numberParam(effect.params, "frequency", 8)));
  const start = Math.max(0, effect.start);
  const end = Math.max(start, start + Math.max(0.01, effect.duration));

  const xExpr = `if(between(t,${start.toFixed(3)},${end.toFixed(3)}),${intensity.toFixed(3)}*sin(${frequency.toFixed(3)}*t*6.28318),0)`;
  const yExpr = `if(between(t,${start.toFixed(3)},${end.toFixed(3)}),${(intensity * 0.6).toFixed(3)}*cos(${(frequency * 1.3).toFixed(3)}*t*6.28318),0)`;

  return `[${inputLabel}]crop=iw:ih:x='${escapeExpression(xExpr)}':y='${escapeExpression(yExpr)}'[${outputLabel}]`;
}

function compileColorGrade(
  inputLabel: string,
  outputLabel: string,
  effect: EffectBlock
): string {
  const strength = Math.max(0, Math.min(1, numberParam(effect.params, "strength", 0.7)));
  const saturation = 1 + strength * 0.15;
  const contrast = 1 + strength * 0.12;
  const brightness = strength * 0.015;

  return `[${inputLabel}]eq=saturation=${saturation.toFixed(3)}:contrast=${contrast.toFixed(3)}:brightness=${brightness.toFixed(3)}[${outputLabel}]`;
}

function compileUnsupportedPassthrough(
  inputLabel: string,
  outputLabel: string
): string {
  return `[${inputLabel}]null[${outputLabel}]`;
}

export function compileEDLEffectsToFFmpeg(edl: MonetEDL): CompileFilterResult {
  try {
    if (!edl || edl.version !== 1) {
      return {
        success: false,
        error: {
          code: "INVALID_EDL",
          message: "Expected MonetEDL version 1"
        }
      };
    }

    const videoTrack = edl.timeline.tracks.find((track) => track.type === "video");

    if (!videoTrack) {
      return {
        success: false,
        error: {
          code: "VIDEO_TRACK_MISSING",
          message: "EDL has no video track"
        }
      };
    }

    const effects: EffectBlock[] = [];

    for (const clip of videoTrack.clips) {
      for (const effect of clip.effects ?? []) {
        effects.push({
          id: effect.id,
          type: effect.type,
          start: effect.start,
          duration: effect.duration,
          params: effect.params
        });
      }
    }

    effects.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

    let currentLabel = "0:v";
    const filters: string[] = [];
    let counter = 0;

    for (const effect of effects) {
      const nextLabel = `vfx${counter}`;

      if (effect.type === "impact_flash") {
        filters.push(compileImpactFlash(currentLabel, nextLabel, effect));
      } else if (effect.type === "context_shake") {
        filters.push(compileContextShake(currentLabel, nextLabel, effect));
      } else if (effect.type === "color_grade") {
        filters.push(compileColorGrade(currentLabel, nextLabel, effect));
      } else {
        filters.push(compileUnsupportedPassthrough(currentLabel, nextLabel));
      }

      currentLabel = nextLabel;
      counter += 1;
    }

    if (filters.length === 0) {
      return {
        success: true,
        data: {
          filterComplex: "[0:v]null[vout]",
          videoOutputLabel: "vout"
        }
      };
    }

    const finalLabel = "vout";
    filters.push(`[${currentLabel}]format=yuv420p[${finalLabel}]`);

    return {
      success: true,
      data: {
        filterComplex: filters.join(";"),
        videoOutputLabel: finalLabel
      }
    };
  } catch (error) {
    console.error("[filter-compiler] failed", error);

    return {
      success: false,
      error: {
        code: "FILTER_COMPILE_FAILED",
        message: "Failed to compile EDL effects to FFmpeg filter graph"
      }
    };
  }
}