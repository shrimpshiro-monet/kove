import type { 
  AudioAnalysis,
  HeavyEditDirectorInput,
  SourceMediaInput,
  SubjectTrackAnalysis,
  TranscriptAnalysis,
  TranscriptWord,
  ReferenceStyle
} from "@monet/edl/src/analysis-types";
import type { Clip, CropKeyframe, EffectBlock, ProjectEDL as MonetEDL, Track } from "@monet/edl/src/schemas";
import { deriveHybridSignals } from "./reference-style-engine";

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<TData = unknown> {
  success: boolean;
  error?: ActionError;
  data?: TData;
}

interface PlannedSegment {
  id: string;
  media: SourceMediaInput;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  duration: number;
  speed: number;
  energy: number;
  anchorType: "beat" | "transient" | "energy" | "fallback";
}

interface CaptionGroup {
  id: string;
  text: string;
  start: number;
  duration: number;
  words: TranscriptWord[];
}

const MIN_CLIP_DURATION = 0.35;
const MAX_CLIP_DURATION_HEAVY = 1.15;
const MAX_CLIP_DURATION_CINEMATIC = 2.4;
const DEFAULT_TARGET_DURATION = 28;
const DEFAULT_FPS = 30;
const DEFAULT_SAMPLE_RATE = 48000;

export function createHeavyEditEDL(input: HeavyEditDirectorInput): ActionResult<MonetEDL | null> {
  try {
    const validation = validateDirectorInput(input);

    if (!validation.success) {
      return validation;
    }

    const now = Date.now();
    const targetDuration = clampNumber(
      input.targetDuration !== undefined ? input.targetDuration : DEFAULT_TARGET_DURATION,
      6,
      Math.max(6, input.audioAnalysis.duration)
    );

    const signals = deriveHybridSignals(input.referenceStyle);

    const segmentsResult = planSegments({
      media: input.media,
      audioAnalysis: input.audioAnalysis,
      targetDuration,
      style: input.style,
      signals
    });

    if (!segmentsResult.success || !segmentsResult.data) {
      return {
        success: false,
        error: segmentsResult.error ?? {
          code: "SEGMENT_PLANNING_FAILED",
          message: "Failed to plan heavy-edit segments"
        }
      };
    }

    const captionGroups = input.transcript
      ? createCaptionGroups(input.transcript, targetDuration, signals)
      : [];

    const videoTrack = createVideoTrack(
      segmentsResult.data,
      input.subjectTrack,
      input.aspectRatio,
      input.audioAnalysis,
      signals
    );

    const textTrack = createCaptionTrack(captionGroups, signals);
    const fxTrack = createFxTrack(segmentsResult.data, input.audioAnalysis);
    const audioTrack = createSfxTrack(segmentsResult.data);

    const edl: MonetEDL = {
      version: 1,
      id: `monet-edl-${input.projectId}-${now}`,
      meta: {
        createdAt: now,
        updatedAt: now,
        aspectRatio: input.aspectRatio,
        fps: DEFAULT_FPS,
        sampleRate: DEFAULT_SAMPLE_RATE
      },
      assets: {
        media: createMediaRegistry(input.media),
        audio: {
          "sfx-impact-hit": {
            id: "sfx-impact-hit",
            path: "assets/sfx-library/impacts/impact-hit.wav",
            duration: 0.5
          },
          "sfx-whoosh-fast": {
            id: "sfx-whoosh-fast",
            path: "assets/sfx-library/whooshes/whoosh-fast.wav",
            duration: 0.45
          },
          "sfx-bass-drop": {
            id: "sfx-bass-drop",
            path: "assets/sfx-library/bass/bass-drop.wav",
            duration: 0.8
          }
        },
        overlays: createCaptionOverlayRegistry(captionGroups)
      },
      timeline: {
        duration: calculateDuration([videoTrack, textTrack, fxTrack, audioTrack]),
        markers: createMarkers(input.audioAnalysis, captionGroups, targetDuration),
        tracks: [videoTrack, textTrack, fxTrack, audioTrack]
      }
    };

    return {
      success: true,
      data: edl
    };
  } catch (error) {
    console.error("[director-pack] createHeavyEditEDL failed", {
      error,
      projectId: input.projectId
    });

    return {
      success: false,
      error: {
        code: "DIRECTOR_PACK_FAILED",
        message: "Failed to create heavy-edit MonetEDL"
      }
    };
  }
}

function validateDirectorInput(input: HeavyEditDirectorInput): ActionResult<null> {
  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "Director input is required"
      }
    };
  }

  if (!input.projectId || input.projectId.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_PROJECT_ID",
        message: "projectId is required"
      }
    };
  }

  if (!Array.isArray(input.media) || input.media.length === 0) {
    return {
      success: false,
      error: {
        code: "MEDIA_REQUIRED",
        message: "At least one source media item is required"
      }
    };
  }

  for (const item of input.media) {
    if (!item.id || !item.path || item.duration <= 0 || item.width <= 0 || item.height <= 0) {
      return {
        success: false,
        error: {
          code: "INVALID_MEDIA",
          message: `Invalid media item: ${item.id || "unknown"}`
        }
      };
    }
  }

  if (!input.audioAnalysis || input.audioAnalysis.duration <= 0) {
    return {
      success: false,
      error: {
        code: "AUDIO_ANALYSIS_REQUIRED",
        message: "audioAnalysis with duration is required"
      }
    };
  }

  if (!Array.isArray(input.audioAnalysis.beats)) {
    return {
      success: false,
      error: {
        code: "INVALID_BEATS",
        message: "audioAnalysis.beats must be an array"
      }
    };
  }

  return {
    success: true,
    data: null
  };
}

function planSegments(params: {
  media: SourceMediaInput[];
  audioAnalysis: AudioAnalysis;
  targetDuration: number;
  style: HeavyEditDirectorInput["style"];
  signals: ReturnType<typeof deriveHybridSignals>;
}): ActionResult<PlannedSegment[]> {
  const anchors = createCutAnchors(params.audioAnalysis, params.targetDuration);

  if (anchors.length === 0) {
    return {
      success: false,
      error: {
        code: "NO_CUT_ANCHORS",
        message: "No beats, transients, or fallback anchors could be generated"
      }
    };
  }

  const planned: PlannedSegment[] = [];
  const minClipDuration = clampNumber(MIN_CLIP_DURATION / params.signals.cutDensity, 0.22, 1.0);
  const maxClipDuration = clampNumber(
    (params.style === "cinematic" ? MAX_CLIP_DURATION_CINEMATIC : MAX_CLIP_DURATION_HEAVY) / params.signals.cutDensity,
    minClipDuration + 0.1,
    6.0
  );

  let timelineCursor = 0;

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const nextAnchor = anchors[index + 1];

    const rawDuration =
      nextAnchor !== undefined
        ? nextAnchor.time - anchor.time
        : maxClipDuration;

    // Apply hybrid pacing: divide by cut density, multiply by narrative weight
    const duration = clampNumber(
      (rawDuration / params.signals.cutDensity) * params.signals.narrativeWeight,
      minClipDuration,
      maxClipDuration
    );

    if (timelineCursor + duration > params.targetDuration) {
      const remaining = params.targetDuration - timelineCursor;

      if (remaining < minClipDuration) {
        break;
      }

      const media = params.media[index % params.media.length];
      const sourceStart = chooseSourceStart(media, index, remaining);
      const speed = chooseSpeed(anchor.energy, params.style);

      planned.push({
        id: `segment-${index}`,
        media,
        sourceStart,
        sourceEnd: Math.min(media.duration, sourceStart + remaining * speed),
        timelineStart: timelineCursor,
        duration: remaining,
        speed,
        energy: anchor.energy,
        anchorType: anchor.type
      });

      break;
    }

    const media = params.media[index % params.media.length];
    const speed = chooseSpeed(anchor.energy, params.style);
    const sourceStart = chooseSourceStart(media, index, duration);
    const sourceEnd = Math.min(media.duration, sourceStart + duration * speed);

    if (sourceEnd <= sourceStart) {
      return {
        success: false,
        error: {
          code: "INVALID_SOURCE_RANGE",
          message: `Invalid source range for media ${media.id}`
        }
      };
    }

    planned.push({
      id: `segment-${index}`,
      media,
      sourceStart,
      sourceEnd,
      timelineStart: timelineCursor,
      duration,
      speed,
      energy: anchor.energy,
      anchorType: anchor.type
    });

    timelineCursor += duration;

    if (timelineCursor >= params.targetDuration) {
      break;
    }
  }

  if (planned.length === 0) {
    return {
      success: false,
      error: {
        code: "NO_SEGMENTS",
        message: "Director could not create any timeline segments"
      }
    };
  }

  return {
    success: true,
    data: planned
  };
}

function createCutAnchors(
  audioAnalysis: AudioAnalysis,
  targetDuration: number
): Array<{ time: number; energy: number; type: PlannedSegment["anchorType"] }> {
  const anchorsByTime = new Map<string, { time: number; energy: number; type: PlannedSegment["anchorType"] }>();

  for (const beat of audioAnalysis.beats) {
    if (beat >= 0 && beat <= targetDuration) {
      const energy = sampleCurve(audioAnalysis.energyCurve, beat);
      anchorsByTime.set(beat.toFixed(3), {
        time: beat,
        energy,
        type: "beat"
      });
    }
  }

  for (const transient of audioAnalysis.transients) {
    if (transient >= 0 && transient <= targetDuration) {
      const energy = sampleCurve(audioAnalysis.energyCurve, transient);

      if (energy >= 0.62) {
        anchorsByTime.set(transient.toFixed(3), {
          time: transient,
          energy,
          type: "transient"
        });
      }
    }
  }

  if (anchorsByTime.size === 0) {
    for (let time = 0; time < targetDuration; time += 0.75) {
      anchorsByTime.set(time.toFixed(3), {
        time,
        energy: sampleCurve(audioAnalysis.energyCurve, time),
        type: "fallback"
      });
    }
  }

  const anchors = Array.from(anchorsByTime.values()).sort((a, b) => a.time - b.time);

  if (anchors[0]?.time !== 0) {
    anchors.unshift({
      time: 0,
      energy: sampleCurve(audioAnalysis.energyCurve, 0),
      type: "fallback"
    });
  }

  return anchors;
}

function chooseSpeed(
  energy: number,
  style: HeavyEditDirectorInput["style"]
): number {
  if (style === "cinematic") {
    return energy > 0.75 ? 1.1 : 0.85;
  }

  if (style === "clean-captions") {
    return 1;
  }

  if (energy >= 0.86) return 1.65;
  if (energy >= 0.72) return 1.35;
  if (energy <= 0.28) return 0.75;

  return 1;
}

function chooseSourceStart(
  media: SourceMediaInput,
  index: number,
  duration: number
): number {
  const safeDuration = Math.max(MIN_CLIP_DURATION, duration);
  const available = Math.max(0, media.duration - safeDuration);

  if (available <= 0) {
    return 0;
  }

  const goldenRatio = 0.61803398875;
  const offset = ((index * goldenRatio) % 1) * available;

  return clampNumber(offset, 0, available);
}

function createVideoTrack(
  segments: PlannedSegment[],
  subjectTrack: SubjectTrackAnalysis | undefined,
  aspectRatio: "16:9" | "9:16" | "1:1",
  audioAnalysis: AudioAnalysis,
  signals: ReturnType<typeof deriveHybridSignals>
): Track {
  const clips: Clip[] = segments.map((segment, index) => {
    const crop = createCropKeyframesForSegment(segment, subjectTrack, aspectRatio);
    const effects = createClipEffects(segment, index, audioAnalysis, signals);

    return {
      id: `video-${segment.id}`,
      mediaId: segment.media.id,
      startTime: round3(segment.timelineStart),
      duration: round3(segment.duration),
      inPoint: round3(segment.sourceStart),
      outPoint: round3(segment.sourceEnd),
      speed: segment.speed,
      transforms: {
        position: [{ time: 0, x: 0, y: 0 }],
        scale: createPushInScale(segment, signals),
        rotation: [{ time: 0, value: 0 }],
        crop
      },
      audio: {
        gain: 1,
        fadeIn: index === 0 ? 0.05 : 0,
        fadeOut: 0.04
      },
      effects,
      meta: {
        monet: {
          anchorType: segment.anchorType,
          energy: segment.energy,
          sourceMediaId: segment.media.id
        }
      }
    };
  });

  return {
    id: "video-main",
    type: "video",
    order: 0,
    locked: false,
    hidden: false,
    clips
  };
}

function createClipEffects(
  segment: PlannedSegment,
  index: number,
  audioAnalysis: AudioAnalysis,
  signals: ReturnType<typeof deriveHybridSignals>
): EffectBlock[] {
  const effects: EffectBlock[] = [];

  effects.push({
    id: `color-${segment.id}`,
    type: "color_grade",
    start: round3(segment.timelineStart),
    duration: round3(segment.duration),
    params: {
      preset: signals.colorGradePreset,
      strength: clampNumber((segment.energy >= 0.7 ? 0.72 : 0.45) * (signals.effectIntensity > 1 ? 1.15 : 0.9), 0.2, 1.0)
    }
  });

  if (segment.speed !== 1) {
    effects.push({
      id: `speed-${segment.id}`,
      type: "speed_ramp",
      start: round3(segment.timelineStart),
      duration: round3(Math.min(0.35, segment.duration)),
      params: {
        from: 1,
        to: segment.speed,
        easing: segment.speed > 1 ? "ease-in" : "ease-out"
      }
    });
  }

  // Amplified Flash using keyframes if effect intensity is high
  const intensity = signals.effectIntensity;
  if (intensity > 0.9 && (segment.energy >= 0.68 || segment.anchorType === "transient")) {
    effects.push({
      id: `flash-${segment.id}`,
      type: "impact_flash",
      start: round3(segment.timelineStart),
      duration: round3(0.25 * clampNumber(intensity, 0.5, 1.8)),
      params: {
        intensity: {
          base: 0,
          keyframes: [
            { time: 0, value: 0 },
            { time: 0.1, value: clampNumber((0.45 + segment.energy * 0.65) * intensity, 0.2, 1.5) },
            { time: 0.25, value: 0 }
          ]
        }
      }
    });
  } else if (segment.energy >= 0.68 || segment.anchorType === "transient") {
    // Normal flash fallback
    effects.push({
      id: `flash-${segment.id}`,
      type: "impact_flash",
      start: round3(segment.timelineStart),
      duration: 0.12,
      params: {
        intensity: clampNumber(0.45 + segment.energy * 0.65, 0.4, 1.1)
      }
    });
  }

  if (segment.energy >= 0.78) {
    effects.push({
      id: `shake-${segment.id}`,
      type: "context_shake",
      start: round3(segment.timelineStart),
      duration: round3(Math.min(0.42 * signals.motionIntensity, segment.duration)),
      params: {
        intensity: clampNumber((segment.energy * 0.65) * signals.motionIntensity, 0.15, 1.5),
        frequency: clampNumber(Math.round((9 + segment.energy * 8) * signals.motionIntensity), 4, 30),
        decay: true
      }
    });
  }

  // Extra context shakes for powerful viral/sports edits
  if (intensity > 1.2 && segment.energy >= 0.85) {
    effects.push({
      id: `shake-extra-${segment.id}`,
      type: "context_shake",
      start: round3(segment.timelineStart),
      duration: 0.3,
      params: {
        intensity: clampNumber(intensity, 0.2, 1.8)
      }
    });
  }

  if (intensity > 1.3 && index % 3 === 0) {
    effects.push({
      id: `impact-bloom-${segment.id}`,
      type: "impact_flash",
      start: round3(segment.timelineStart),
      duration: 0.25,
      params: {
        intensity: clampNumber(intensity * 0.8, 0.2, 1.5)
      }
    });
  }

  const nearestTransient = nearestTime(audioAnalysis.transients, segment.timelineStart);

  if (nearestTransient !== null && Math.abs(nearestTransient - segment.timelineStart) <= 0.12) {
    effects.push({
      id: `transient-marker-${segment.id}`,
      type: "beat_marker",
      start: round3(segment.timelineStart),
      duration: 0.01,
      params: {
        source: "transient",
        index
      }
    });
  }

  return effects;
}

function createPushInScale(
  segment: PlannedSegment,
  signals: ReturnType<typeof deriveHybridSignals>
): Clip["transforms"]["scale"] {
  // Preserve original camera motion preference but apply slight viral boost scaling
  const baseScaleModifier = 1 + (signals.motionIntensity - 1) * 0.2;
  const baseAmount = segment.energy >= 0.75 ? 0.085 : 0.045;
  const amount = 1 + (baseAmount * baseScaleModifier);

  return [
    { time: 0, value: 1, easing: "linear" },
    { time: round3(segment.duration), value: amount, easing: "ease-in-out" }
  ];
}

function createCropKeyframesForSegment(
  segment: PlannedSegment,
  subjectTrack: SubjectTrackAnalysis | undefined,
  aspectRatio: "16:9" | "9:16" | "1:1"
): CropKeyframe[] | undefined {
  if (!subjectTrack || subjectTrack.tracks.length === 0) {
    return defaultCropForAspect(aspectRatio);
  }

  const framesInSegment = subjectTrack.tracks.filter(
    (frame) => frame.time >= segment.sourceStart && frame.time <= segment.sourceEnd
  );

  if (framesInSegment.length === 0) {
    return defaultCropForAspect(aspectRatio);
  }

  const keyframes: CropKeyframe[] = [];
  const maxKeyframes = 8;
  const stride = Math.max(1, Math.floor(framesInSegment.length / maxKeyframes));

  for (let index = 0; index < framesInSegment.length; index += stride) {
    const frame = framesInSegment[index];

    if (!frame) {
      return defaultCropForAspect(aspectRatio);
    }

    const localTime = clampNumber(
      (frame.time - segment.sourceStart) / Math.max(0.001, segment.speed),
      0,
      segment.duration
    );

    const crop = cropAroundSubject(frame.bbox.centerX, frame.bbox.centerY, aspectRatio);

    keyframes.push({
      time: round3(localTime),
      x: crop.x,
      y: crop.y,
      width: crop.width,
      height: crop.height
    });
  }

  if (keyframes.length === 0) {
    return defaultCropForAspect(aspectRatio);
  }

  return smoothCropKeyframes(keyframes);
}

function defaultCropForAspect(
  aspectRatio: "16:9" | "9:16" | "1:1"
): CropKeyframe[] {
  if (aspectRatio === "9:16") {
    return [
      {
        time: 0,
        x: 0.21875,
        y: 0,
        width: 0.5625,
        height: 1
      }
    ];
  }

  if (aspectRatio === "1:1") {
    return [
      {
        time: 0,
        x: 0.125,
        y: 0,
        width: 0.75,
        height: 1
      }
    ];
  }

  return [
    {
      time: 0,
      x: 0,
      y: 0,
      width: 1,
      height: 1
    }
  ];
}

function cropAroundSubject(
  centerX: number,
  centerY: number,
  aspectRatio: "16:9" | "9:16" | "1:1"
): { x: number; y: number; width: number; height: number } {
  if (aspectRatio === "16:9") {
    return {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    };
  }

  const width = aspectRatio === "9:16" ? 0.5625 : 0.75;
  const height = 1;

  const x = clampNumber(centerX - width / 2, 0, 1 - width);
  const y = clampNumber(centerY - height / 2, 0, 1 - height);

  return {
    x: round4(x),
    y: round4(y),
    width: round4(width),
    height: round4(height)
  };
}

function smoothCropKeyframes(keyframes: CropKeyframe[]): CropKeyframe[] {
  if (keyframes.length <= 2) {
    return keyframes;
  }

  const smoothed: CropKeyframe[] = [];

  for (let index = 0; index < keyframes.length; index += 1) {
    const prev = keyframes[Math.max(0, index - 1)];
    const current = keyframes[index];
    const next = keyframes[Math.min(keyframes.length - 1, index + 1)];

    if (!prev || !current || !next) {
      return keyframes;
    }

    smoothed.push({
      time: current.time,
      x: round4((prev.x + current.x * 2 + next.x) / 4),
      y: round4((prev.y + current.y * 2 + next.y) / 4),
      width: current.width,
      height: current.height
    });
  }

  return smoothed;
}

function createCaptionGroups(
  transcript: TranscriptAnalysis,
  targetDuration: number,
  signals: ReturnType<typeof deriveHybridSignals>
): CaptionGroup[] {
  if (!Array.isArray(transcript.words) || transcript.words.length === 0) {
    return [];
  }

  const groups: CaptionGroup[] = [];
  let currentWords: TranscriptWord[] = [];

  const maxWords = signals.captionDensity > 1.2 ? 2 : signals.captionDensity < 0.8 ? 6 : 4;
  const maxPhraseDuration = signals.captionDensity > 1.2 ? 1.0 : signals.captionDensity < 0.8 ? 2.5 : 1.65;
  const maxGap = signals.captionDensity > 1.2 ? 0.3 : 0.45;

  for (const word of transcript.words) {
    if (word.start > targetDuration) {
      break;
    }

    if (currentWords.length === 0) {
      currentWords.push(word);
      continue;
    }

    const first = currentWords[0];

    if (!first) {
      return groups;
    }

    const phraseDuration = word.end - first.start;
    const gap = word.start - currentWords[currentWords.length - 1]!.end;

    if (currentWords.length >= maxWords || phraseDuration > maxPhraseDuration || gap > maxGap) {
      groups.push(createCaptionGroup(currentWords));
      currentWords = [word];
    } else {
      currentWords.push(word);
    }
  }

  if (currentWords.length > 0) {
    groups.push(createCaptionGroup(currentWords));
  }

  return groups.filter((group) => group.duration >= 0.15);
}

function createCaptionGroup(words: TranscriptWord[]): CaptionGroup {
  const first = words[0];
  const last = words[words.length - 1];

  if (!first || !last) {
    return {
      id: `caption-empty-${Date.now()}`,
      text: "",
      start: 0,
      duration: 0,
      words: []
    };
  }

  return {
    id: `caption-${first.start.toFixed(2)}-${last.end.toFixed(2)}`,
    text: words.map((word) => word.word).join(" "),
    start: round3(first.start),
    duration: round3(Math.max(0.15, last.end - first.start)),
    words
  };
}

function createCaptionTrack(
  groups: CaptionGroup[],
  signals: ReturnType<typeof deriveHybridSignals>
): Track {
  const fontVibe = signals.styleClass === "viral" ? "bold_sans" : "standard";
  const positioning = signals.styleClass === "viral" ? "center" : "lower_third";
  const preset = signals.styleClass === "viral" ? "bold-pop" : "standard-caption";

  const clips: Clip[] = groups.map((group) => ({
    id: `text-${group.id}`,
    mediaId: `overlay-${group.id}`,
    startTime: group.start,
    duration: group.duration,
    inPoint: 0,
    outPoint: group.duration,
    speed: 1,
    transforms: {
      position: [{ time: 0, x: 0.5, y: positioning === "center" ? 0.5 : 0.78 }],
      scale: [
        { time: 0, value: 0.92, easing: "ease-out" },
        { time: Math.min(0.12, group.duration), value: 1, easing: "ease-out" }
      ],
      rotation: [{ time: 0, value: 0 }]
    },
    audio: {
      gain: 0
    },
    effects: [
      {
        id: `caption-pop-${group.id}`,
        type: "caption_pop",
        start: group.start,
        duration: group.duration,
        params: {
          text: group.text,
          preset,
          fontVibe,
          positioning,
          wordTimings: group.words.map((word) => ({
            word: word.word,
            start: word.start,
            end: word.end
          }))
        }
      }
    ],
    meta: {
      text: group.text,
      monet: {
        captionGroupId: group.id
      }
    }
  }));

  return {
    id: "text-captions",
    type: "text",
    order: 10,
    locked: false,
    hidden: false,
    clips
  };
}

function createFxTrack(
  segments: PlannedSegment[],
  audioAnalysis: AudioAnalysis
): Track {
  const clips: Clip[] = [];

  for (const segment of segments) {
    if (segment.energy < 0.76) {
      continue;
    }

    clips.push({
      id: `fx-pulse-${segment.id}`,
      mediaId: "overlay-generated-pulse",
      startTime: round3(segment.timelineStart),
      duration: round3(Math.min(0.35, segment.duration)),
      inPoint: 0,
      outPoint: round3(Math.min(0.35, segment.duration)),
      speed: 1,
      transforms: {
        position: [{ time: 0, x: 0.5, y: 0.5 }],
        scale: [{ time: 0, value: 1 }],
        rotation: [{ time: 0, value: 0 }]
      },
      audio: {
        gain: 0
      },
      effects: [
        {
          id: `asset-pulse-${segment.id}`,
          type: "asset_pulse",
          start: round3(segment.timelineStart),
          duration: round3(Math.min(0.35, segment.duration)),
          params: {
            intensity: segment.energy,
            source: "energy"
          }
        }
      ],
      meta: {
        monet: {
          energy: segment.energy
        }
      }
    });
  }

  for (const transient of audioAnalysis.transients) {
    if (transient < 0 || transient > calculateSegmentsDuration(segments)) {
      continue;
    }

    const energy = sampleCurve(audioAnalysis.energyCurve, transient);

    if (energy < 0.82) {
      continue;
    }

    clips.push({
      id: `fx-whip-${transient.toFixed(2)}`,
      mediaId: "overlay-generated-whip",
      startTime: round3(transient),
      duration: 0.18,
      inPoint: 0,
      outPoint: 0.18,
      speed: 1,
      transforms: {
        position: [{ time: 0, x: 0.5, y: 0.5 }],
        scale: [{ time: 0, value: 1 }],
        rotation: [{ time: 0, value: 0 }]
      },
      audio: {
        gain: 0
      },
      effects: [
        {
          id: `whip-${transient.toFixed(2)}`,
          type: "whip_transition",
          start: round3(transient),
          duration: 0.18,
          params: {
            direction: "right",
            blur: 0.75
          }
        }
      ]
    });
  }

  return {
    id: "fx-heavy-edit",
    type: "fx",
    order: 20,
    locked: false,
    hidden: false,
    clips
  };
}

function createSfxTrack(segments: PlannedSegment[]): Track {
  const clips: Clip[] = [];

  for (const segment of segments) {
    if (segment.energy >= 0.78) {
      clips.push(createSfxClip(segment, "sfx-impact-hit", 0.5, "impact"));
    }

    if (segment.speed > 1.25) {
      clips.push(createSfxClip(segment, "sfx-whoosh-fast", 0.45, "whoosh"));
    }

    if (segment.energy >= 0.9) {
      clips.push(createSfxClip(segment, "sfx-bass-drop", 0.8, "bass"));
    }
  }

  return {
    id: "audio-sfx",
    type: "audio",
    order: 30,
    locked: false,
    hidden: false,
    clips
  };
}

function createSfxClip(
  segment: PlannedSegment,
  mediaId: string,
  duration: number,
  kind: string
): Clip {
  return {
    id: `audio-${kind}-${segment.id}`,
    mediaId,
    startTime: round3(segment.timelineStart),
    duration,
    inPoint: 0,
    outPoint: duration,
    speed: 1,
    transforms: {
      position: [],
      scale: [],
      rotation: []
    },
    audio: {
      gain: kind === "bass" ? 0.72 : 0.9,
      fadeIn: 0.01,
      fadeOut: 0.08
    },
    effects: [
      {
        id: `sfx-${kind}-${segment.id}`,
        type: "sfx_hit",
        start: round3(segment.timelineStart),
        duration,
        params: {
          kind,
          energy: segment.energy
        }
      }
    ],
    meta: {
      monet: {
        kind
      }
    }
  };
}

function createMediaRegistry(
  media: SourceMediaInput[]
): MonetEDL["assets"]["media"] {
  const registry: MonetEDL["assets"]["media"] = {};

  for (const item of media) {
    registry[item.id] = {
      id: item.id,
      path: item.path,
      duration: item.duration,
      width: item.width,
      height: item.height
    };
  }

  return registry;
}

function createCaptionOverlayRegistry(
  groups: CaptionGroup[]
): MonetEDL["assets"]["overlays"] {
  const registry: MonetEDL["assets"]["overlays"] = {
    "overlay-generated-pulse": {
      id: "overlay-generated-pulse",
      path: "generated://pulse",
      type: "generated"
    },
    "overlay-generated-whip": {
      id: "overlay-generated-whip",
      path: "generated://whip",
      type: "generated"
    }
  };

  for (const group of groups) {
    registry[`overlay-${group.id}`] = {
      id: `overlay-${group.id}`,
      path: `text://${encodeURIComponent(group.text)}`,
      type: "text"
    };
  }

  return registry;
}

function createMarkers(
  audioAnalysis: AudioAnalysis,
  captionGroups: CaptionGroup[],
  targetDuration: number
): MonetEDL["timeline"]["markers"] {
  const markers: MonetEDL["timeline"]["markers"] = [];

  for (const beat of audioAnalysis.beats) {
    if (beat >= 0 && beat <= targetDuration) {
      markers.push({
        id: `beat-${beat.toFixed(3)}`,
        time: round3(beat),
        type: "beat",
        label: "Beat"
      });
    }
  }

  for (const transient of audioAnalysis.transients) {
    if (transient >= 0 && transient <= targetDuration) {
      markers.push({
        id: `transient-${transient.toFixed(3)}`,
        time: round3(transient),
        type: "transient",
        label: "Transient"
      });
    }
  }

  for (const group of captionGroups) {
    markers.push({
      id: `caption-marker-${group.id}`,
      time: group.start,
      type: "caption",
      label: group.text
    });
  }

  markers.sort((a, b) => a.time - b.time);

  return markers;
}

function calculateDuration(tracks: Track[]): number {
  let max = 0;

  for (const track of tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startTime + clip.duration);
    }
  }

  return round3(max);
}

function calculateSegmentsDuration(segments: PlannedSegment[]): number {
  let max = 0;

  for (const segment of segments) {
    max = Math.max(max, segment.timelineStart + segment.duration);
  }

  return max;
}

function sampleCurve(
  curve: Array<{ time: number; value: number }>,
  time: number
): number {
  if (!Array.isArray(curve) || curve.length === 0) {
    return 0.5;
  }

  if (time <= curve[0]!.time) {
    return clampNumber(curve[0]!.value, 0, 1);
  }

  const last = curve[curve.length - 1];

  if (last && time >= last.time) {
    return clampNumber(last.value, 0, 1);
  }

  let low = 0;
  let high = curve.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const point = curve[mid];

    if (!point) {
      return 0.5;
    }

    if (point.time < time) {
      low = mid + 1;
    } else if (point.time > time) {
      high = mid - 1;
    } else {
      return clampNumber(point.value, 0, 1);
    }
  }

  const right = curve[low];
  const left = curve[Math.max(0, low - 1)];

  if (!left || !right) {
    return 0.5;
  }

  const span = right.time - left.time;

  if (span <= 0) {
    return clampNumber(left.value, 0, 1);
  }

  const t = (time - left.time) / span;

  return clampNumber(left.value + (right.value - left.value) * t, 0, 1);
}

function nearestTime(values: number[], time: number): number | null {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  let nearest = values[0];

  if (nearest === undefined) {
    return null;
  }

  let nearestDistance = Math.abs(nearest - time);

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];

    if (value === undefined) {
      return null;
    }

    const distance = Math.abs(value - time);

    if (distance < nearestDistance) {
      nearest = value;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}