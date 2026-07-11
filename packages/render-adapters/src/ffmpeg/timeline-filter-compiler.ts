import type { Clip, EffectBlock, ProjectEDL as MonetEDL, Track } from "@monet/edl/src/schemas";
import type {
  ActionResult,
  CompiledTimelineGraph,
  FFmpegInput,
  IndexedAudioClip,
  IndexedVideoClip,
  RenderDimensions
} from "./timeline-types";
import {
  assertValidEDL,
  calculateTimelineDuration,
  clampNumber,
  escapeDrawText,
  getAudioTracks,
  getClipEffectsByType,
  getFxTracks,
  getNumberParam,
  getRenderDimensions,
  getStringParam,
  getTextTracks,
  getVideoTracks,
  normalizeEvenDimension,
  round3,
  shellSafeLabel
} from "./ffmpeg-utils";

interface CompileTimelineInput {
  edl: MonetEDL;
  width?: number;
  height?: number;
  fps?: number;
}

export function compileTimelineToFFmpegGraph(
  input: CompileTimelineInput
): ActionResult<CompiledTimelineGraph | null> {
  try {
    const validation = assertValidEDL(input.edl);

    if (!validation.success) {
      return validation;
    }

    const dimensionsResult = getRenderDimensions(input.edl, input.width, input.height);

    if (!dimensionsResult.success || !dimensionsResult.data) {
      return {
        success: false,
        error: dimensionsResult.error ?? {
          code: "DIMENSIONS_FAILED",
          message: "Failed to resolve render dimensions"
        }
      };
    }

    const fps =
      typeof input.fps === "number" && Number.isFinite(input.fps) && input.fps > 0
        ? input.fps
        : input.edl.meta.fps;

    const dimensions = dimensionsResult.data;
    const inputs: FFmpegInput[] = [];
    const filters: string[] = [];

    const indexedVideoResult = indexVideoClips(input.edl, inputs);

    if (!indexedVideoResult.success || !indexedVideoResult.data) {
      return {
        success: false,
        error: indexedVideoResult.error ?? {
          code: "VIDEO_INDEX_FAILED",
          message: "Failed to index video clips"
        }
      };
    }

    const indexedAudioResult = indexAudioClips(input.edl, inputs);

    if (!indexedAudioResult.success || !indexedAudioResult.data) {
      return {
        success: false,
        error: indexedAudioResult.error ?? {
          code: "AUDIO_INDEX_FAILED",
          message: "Failed to index audio clips"
        }
      };
    }

    const videoLabels: string[] = [];

    for (const indexedClip of indexedVideoResult.data) {
      const compiledClip = compileVideoClip(indexedClip, dimensions, fps);

      if (!compiledClip.success || !compiledClip.data) {
        return {
          success: false,
          error: compiledClip.error ?? {
            code: "VIDEO_CLIP_COMPILE_FAILED",
            message: `Failed to compile video clip ${indexedClip.clip.id}`
          }
        };
      }

      filters.push(...compiledClip.data.filters);
      videoLabels.push(compiledClip.data.outputLabel);
    }

    if (videoLabels.length === 0) {
      return {
        success: false,
        error: {
          code: "NO_VIDEO_LABELS",
          message: "No video labels were produced"
        }
      };
    }

    const concatVideoLabel = "v_concat";
    filters.push(
      `${videoLabels.map((label) => `[${label}]`).join("")}concat=n=${videoLabels.length}:v=1:a=0[${concatVideoLabel}]`
    );

    const captionResult = compileCaptionOverlay(input.edl, concatVideoLabel, "v_captioned");

    if (!captionResult.success || !captionResult.data) {
      return {
        success: false,
        error: captionResult.error ?? {
          code: "CAPTION_COMPILE_FAILED",
          message: "Failed to compile caption overlays"
        }
      };
    }

    filters.push(...captionResult.data.filters);

    const fxResult = compileFxOverlays(input.edl, captionResult.data.outputLabel, "v_fx");

    if (!fxResult.success || !fxResult.data) {
      return {
        success: false,
        error: fxResult.error ?? {
          code: "FX_COMPILE_FAILED",
          message: "Failed to compile FX overlays"
        }
      };
    }

    filters.push(...fxResult.data.filters);

    const audioResult = compileAudioGraph(indexedVideoResult.data, indexedAudioResult.data);

    if (!audioResult.success) {
      return {
        success: false,
        error: audioResult.error ?? {
          code: "AUDIO_COMPILE_FAILED",
          message: "Failed to compile audio graph"
        }
      };
    }

    if (audioResult.data?.filters.length) {
      filters.push(...audioResult.data.filters);
    }

    const duration = calculateTimelineDuration(input.edl);

    return {
      success: true,
      data: {
        filterComplex: filters.join(";"),
        videoOutputLabel: fxResult.data.outputLabel,
        audioOutputLabel: audioResult.data?.outputLabel,
        inputs,
        duration,
        dimensions
      }
    };
  } catch (error) {
    console.error("[timeline-filter-compiler] compile failed", {
      error,
      edlId: input.edl?.id
    });

    return {
      success: false,
      error: {
        code: "TIMELINE_GRAPH_COMPILE_FAILED",
        message: "Failed to compile MonetEDL timeline to FFmpeg graph"
      }
    };
  }
}

function indexVideoClips(
  edl: MonetEDL,
  inputs: FFmpegInput[]
): ActionResult<IndexedVideoClip[]> {
  const mediaMap = new Map(Object.entries(edl.assets.media));
  const indexed: IndexedVideoClip[] = [];

  for (const track of getVideoTracks(edl)) {
    for (const clip of track.clips) {
      const asset = mediaMap.get(clip.mediaId);

      if (!asset) {
        return {
          success: false,
          error: {
            code: "VIDEO_ASSET_MISSING",
            message: `Missing media asset for clip ${clip.id} with mediaId ${clip.mediaId}`
          }
        };
      }

      if (!asset.path || asset.path.trim().length === 0) {
        return {
          success: false,
          error: {
            code: "VIDEO_ASSET_PATH_MISSING",
            message: `Media asset ${asset.id} has no path`
          }
        };
      }

      const inputIndex = inputs.length;

      inputs.push({
        path: asset.path,
        kind: "video",
        clipId: clip.id,
        mediaId: clip.mediaId
      });

      indexed.push({
        clip,
        track,
        asset,
        inputIndex,
        outputVideoLabel: `v_${shellSafeLabel(clip.id)}`
      });
    }
  }

  indexed.sort((a, b) => {
    const byStart = a.clip.startTime - b.clip.startTime;

    return byStart !== 0 ? byStart : a.clip.id.localeCompare(b.clip.id);
  });

  return {
    success: true,
    data: indexed
  };
}

function indexAudioClips(
  edl: MonetEDL,
  inputs: FFmpegInput[]
): ActionResult<IndexedAudioClip[]> {
  const audioMap = new Map(Object.entries(edl.assets.audio));
  const indexed: IndexedAudioClip[] = [];

  for (const track of getAudioTracks(edl)) {
    for (const clip of track.clips) {
      const asset = audioMap.get(clip.mediaId);

      if (!asset) {
        return {
          success: false,
          error: {
            code: "AUDIO_ASSET_MISSING",
            message: `Missing audio asset for clip ${clip.id} with mediaId ${clip.mediaId}`
          }
        };
      }

      if (!asset.path || asset.path.trim().length === 0) {
        return {
          success: false,
          error: {
            code: "AUDIO_ASSET_PATH_MISSING",
            message: `Audio asset ${asset.id} has no path`
          }
        };
      }

      const inputIndex = inputs.length;

      inputs.push({
        path: asset.path,
        kind: "audio",
        clipId: clip.id,
        mediaId: clip.mediaId
      });

      indexed.push({
        clip,
        track,
        asset,
        inputIndex,
        outputAudioLabel: `a_${shellSafeLabel(clip.id)}`
      });
    }
  }

  indexed.sort((a, b) => {
    const byStart = a.clip.startTime - b.clip.startTime;

    return byStart !== 0 ? byStart : a.clip.id.localeCompare(b.clip.id);
  });

  return {
    success: true,
    data: indexed
  };
}

function compileVideoClip(
  indexedClip: IndexedVideoClip,
  dimensions: RenderDimensions,
  fps: number
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const { clip, inputIndex } = indexedClip;

  if (clip.duration <= 0) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_DURATION",
        message: `Clip ${clip.id} has invalid duration ${clip.duration}`
      }
    };
  }

  if (clip.outPoint <= clip.inPoint) {
    return {
      success: false,
      error: {
        code: "INVALID_CLIP_RANGE",
        message: `Clip ${clip.id} has invalid in/out range`
      }
    };
  }

  const safeSpeed = clampNumber(clip.speed || 1, 0.05, 8);
  const targetWidth = normalizeEvenDimension(dimensions.width);
  const targetHeight = normalizeEvenDimension(dimensions.height);

  const base = shellSafeLabel(clip.id);
  const trimLabel = `v_trim_${base}`;
  const scaledLabel = `v_scaled_${base}`;
  const cropLabel = `v_crop_${base}`;
  const effectOutput = `v_effect_${base}`;
  const outputLabel = indexedClip.outputVideoLabel;

  const filters: string[] = [];

  filters.push(
    `[${inputIndex}:v]trim=start=${round3(clip.inPoint)}:end=${round3(
      clip.outPoint
    )},setpts=(PTS-STARTPTS)/${safeSpeed.toFixed(6)},fps=${fps}[${trimLabel}]`
  );

  filters.push(
    `[${trimLabel}]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase[${scaledLabel}]`
  );

  const crop = resolveCropFilter(clip, targetWidth, targetHeight);
  filters.push(`[${scaledLabel}]${crop}[${cropLabel}]`);

  const effectResult = compileClipVisualEffects(clip, cropLabel, effectOutput);

  if (!effectResult.success || !effectResult.data) {
    return {
      success: false,
      error: effectResult.error ?? {
        code: "CLIP_EFFECT_COMPILE_FAILED",
        message: `Failed to compile effects for clip ${clip.id}`
      }
    };
  }

  filters.push(...effectResult.data.filters);

  filters.push(
    `[${effectResult.data.outputLabel}]format=yuv420p,setsar=1[${outputLabel}]`
  );

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function resolveCropFilter(
  clip: Clip,
  targetWidth: number,
  targetHeight: number
): string {
  const cropKeyframes = clip.transforms.crop;

  if (!Array.isArray(cropKeyframes) || cropKeyframes.length === 0) {
    return `crop=${targetWidth}:${targetHeight}`;
  }

  const first = cropKeyframes[0];

  if (!first) {
    return `crop=${targetWidth}:${targetHeight}`;
  }

  const x = clampNumber(first.x, 0, 1);
  const y = clampNumber(first.y, 0, 1);
  const width = clampNumber(first.width, 0.05, 1);
  const height = clampNumber(first.height, 0.05, 1);

  const cropW = normalizeEvenDimension(targetWidth * width);
  const cropH = normalizeEvenDimension(targetHeight * height);
  const cropX = normalizeEvenDimension(targetWidth * x);
  const cropY = normalizeEvenDimension(targetHeight * y);

  return `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${targetWidth}:${targetHeight}`;
}

function compileClipVisualEffects(
  clip: Clip,
  inputLabel: string,
  requestedOutputLabel: string
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const filters: string[] = [];
  let currentLabel = inputLabel;
  let index = 0;

  const colorGrades = getClipEffectsByType(clip, "color_grade");
  const impactFlashes = getClipEffectsByType(clip, "impact_flash");
  const shakes = getClipEffectsByType(clip, "context_shake");

  for (const effect of colorGrades) {
    const nextLabel = `${requestedOutputLabel}_color_${index}`;
    const strength = clampNumber(getNumberParam(effect.params, "strength", 0.5), 0, 1);
    const saturation = 1 + strength * 0.2;
    const contrast = 1 + strength * 0.14;
    const brightness = strength * 0.012;

    filters.push(
      `[${currentLabel}]eq=saturation=${saturation.toFixed(3)}:contrast=${contrast.toFixed(
        3
      )}:brightness=${brightness.toFixed(3)}[${nextLabel}]`
    );

    currentLabel = nextLabel;
    index += 1;
  }

  for (const effect of impactFlashes) {
    const nextLabel = `${requestedOutputLabel}_flash_${index}`;
    const localStart = clampNumber(effect.start - clip.startTime, 0, clip.duration);
    const localEnd = clampNumber(localStart + effect.duration, localStart + 0.01, clip.duration);
    const intensity = clampNumber(getNumberParam(effect.params, "intensity", 0.8), 0, 2);

    filters.push(
      `[${currentLabel}]eq=brightness=\'if(between(t,${round3(localStart)},${round3(
        localEnd
      )}),${intensity.toFixed(3)},0)\':contrast=\'if(between(t,${round3(
        localStart
      )}),${round3(localEnd)}),1.16,1)\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
    index += 1;
  }

  for (const effect of shakes) {
    const nextLabel = `${requestedOutputLabel}_shake_${index}`;
    const localStart = clampNumber(effect.start - clip.startTime, 0, clip.duration);
    const localEnd = clampNumber(localStart + effect.duration, localStart + 0.01, clip.duration);
    const intensity = clampNumber(getNumberParam(effect.params, "intensity", 0.4), 0, 2) * 18;
    const frequency = clampNumber(getNumberParam(effect.params, "frequency", 8), 1, 40);

    const xExpr = `if(between(t,${round3(localStart)},${round3(
      localEnd
    )}),${intensity.toFixed(3)}*sin(${frequency.toFixed(3)}*t*6.28318),0)`;
    const yExpr = `if(between(t,${round3(localStart)},${round3(
      localEnd
    )}),${(intensity * 0.55).toFixed(3)}*cos(${(frequency * 1.29).toFixed(
      3
    )}*t*6.28318),0)`;

    filters.push(
      `[${currentLabel}]crop=iw:ih:x=\'${xExpr}\':y=\'${yExpr}\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
    index += 1;
  }

  if (filters.length === 0) {
    filters.push(`[${currentLabel}]null[${requestedOutputLabel}]`);

    return {
      success: true,
      data: {
        filters,
        outputLabel: requestedOutputLabel
      }
    };
  }

  if (currentLabel !== requestedOutputLabel) {
    filters.push(`[${currentLabel}]null[${requestedOutputLabel}]`);
  }

  return {
    success: true,
    data: {
      filters,
      outputLabel: requestedOutputLabel
    }
  };
}

function compileCaptionOverlay(
  edl: MonetEDL,
  inputLabel: string,
  outputLabel: string
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const textTracks = getTextTracks(edl);
  const captionEffects: Array<{ clip: Clip; effect: EffectBlock }> = [];

  for (const track of textTracks) {
    for (const clip of track.clips) {
      for (const effect of clip.effects) {
        if (effect.type === "caption_pop") {
          captionEffects.push({ clip, effect });
        }
      }
    }
  }

  if (captionEffects.length === 0) {
    return {
      success: true,
      data: {
        filters: [`[${inputLabel}]null[${outputLabel}]`],
        outputLabel
      }
    };
  }

  let currentLabel = inputLabel;
  const filters: string[] = [];

  captionEffects.sort((a, b) => a.clip.startTime - b.clip.startTime);

  for (let index = 0; index < captionEffects.length; index += 1) {
    const item = captionEffects[index];

    if (!item) {
      return {
        success: false,
        error: {
          code: "INVALID_CAPTION_EFFECT",
          message: "Caption effect entry was unexpectedly missing"
        }
      };
    }

    const nextLabel = index === captionEffects.length - 1 ? outputLabel : `v_caption_${index}`;
    const text = getStringParam(item.effect.params, "text", String(item.clip.meta?.text ?? ""));
    const escaped = escapeDrawText(text.toUpperCase());
    const start = round3(item.clip.startTime);
    const end = round3(item.clip.startTime + item.clip.duration);

    filters.push(
      `[${currentLabel}]drawtext=text=\'${escaped}\':x=(w-text_w)/2:y=h*0.76:fontsize=h*0.052:fontcolor=white:borderw=6:bordercolor=black:enable=\'between(t,${start},${end})\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
  }

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function compileFxOverlays(
  edl: MonetEDL,
  inputLabel: string,
  outputLabel: string
): ActionResult<{ filters: string[]; outputLabel: string }> {
  const fxTracks = getFxTracks(edl);
  const pulses: Clip[] = [];

  for (const track of fxTracks) {
    for (const clip of track.clips) {
      const hasPulse = clip.effects.some((effect) => effect.type === "asset_pulse");

      if (hasPulse) {
        pulses.push(clip);
      }
    }
  }

  if (pulses.length === 0) {
    return {
      success: true,
      data: {
        filters: [`[${inputLabel}]null[${outputLabel}]`],
        outputLabel
      }
    };
  }

  let currentLabel = inputLabel;
  const filters: string[] = [];

  pulses.sort((a, b) => a.startTime - b.startTime);

  for (let index = 0; index < pulses.length; index += 1) {
    const pulse = pulses[index];

    if (!pulse) {
      return {
        success: false,
        error: {
          code: "INVALID_FX_PULSE",
          message: "FX pulse entry was unexpectedly missing"
        }
      };
    }

    const effect = pulse.effects.find((item) => item.type === "asset_pulse");

    if (!effect) {
      return {
        success: false,
        error: {
          code: "ASSET_PULSE_EFFECT_MISSING",
          message: `FX clip ${pulse.id} was expected to contain asset_pulse effect`
        }
      };
    }

    const nextLabel = index === pulses.length - 1 ? outputLabel : `v_fx_${index}`;
    const start = round3(pulse.startTime);
    const end = round3(pulse.startTime + pulse.duration);
    const intensity = clampNumber(getNumberParam(effect.params, "intensity", 0.7), 0, 1.5);

    filters.push(
      `[${currentLabel}]drawbox=x=0:y=0:w=iw:h=ih:color=white@${(0.07 * intensity).toFixed(
        3
      )}:t=fill:enable=\'between(t,${start},${end})\'[${nextLabel}]`
    );

    currentLabel = nextLabel;
  }

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function compileAudioGraph(
  videoClips: IndexedVideoClip[],
  audioClips: IndexedAudioClip[]
): ActionResult<{ filters: string[]; outputLabel?: string }> {
  const filters: string[] = [];
  const audioLabels: string[] = [];

  for (const indexed of videoClips) {
    const clip = indexed.clip;
    const label = `a_video_${shellSafeLabel(clip.id)}`;
    const delayMs = Math.max(0, Math.round(clip.startTime * 1000));
    const gain = typeof clip.audio?.gain === "number" ? clampNumber(clip.audio.gain, 0, 3) : 1;

    filters.push(
      `[${indexed.inputIndex}:a]atrim=start=${round3(clip.inPoint)}:end=${round3(
        clip.outPoint
      )},asetpts=PTS-STARTPTS,atempo=${compileAtempoChain(
        clip.speed || 1
      )},volume=${gain.toFixed(3)},adelay=${delayMs}|${delayMs}[${label}]`
    );

    audioLabels.push(label);
  }

  for (const indexed of audioClips) {
    const clip = indexed.clip;
    const label = indexed.outputAudioLabel;
    const delayMs = Math.max(0, Math.round(clip.startTime * 1000));
    const gain = typeof clip.audio?.gain === "number" ? clampNumber(clip.audio.gain, 0, 3) : 1;

    filters.push(
      `[${indexed.inputIndex}:a]atrim=start=${round3(clip.inPoint)}:end=${round3(
        clip.outPoint
      )},asetpts=PTS-STARTPTS,volume=${gain.toFixed(3)},adelay=${delayMs}|${delayMs}[${label}]`
    );

    audioLabels.push(label);
  }

  if (audioLabels.length === 0) {
    return {
      success: true,
      data: {
        filters
      }
    };
  }

  const outputLabel = "aout";

  filters.push(
    `${audioLabels.map((label) => `[${label}]`).join("")}amix=inputs=${
      audioLabels.length
    }:duration=longest:dropout_transition=0,alimiter=limit=0.95[${outputLabel}]`
  );

  return {
    success: true,
    data: {
      filters,
      outputLabel
    }
  };
}

function compileAtempoChain(speed: number): string {
  const safeSpeed = clampNumber(speed, 0.05, 8);
  const factors: number[] = [];
  let remaining = safeSpeed;

  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }

  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }

  factors.push(remaining);

  return factors.map((factor) => factor.toFixed(6)).join(",atempo=");
}