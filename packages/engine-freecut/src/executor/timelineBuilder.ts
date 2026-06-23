// packages/engine-freecut/src/executor/timelineBuilder.ts
import {
  Action,
  AddMediaAction,
  AudioSegment,
  CaptionSegment,
  ProjectSettings,
  Timeline,
  VideoSegment,
} from "./types";
import { AssetResolver, AssetEntry } from "./assetResolver";
import { probeDuration } from "./ffprobe";

interface ClipState {
  trackId: string;
  inputIndex: number;
  inputPath: string;
  kind: "video" | "audio";
  // SOURCE range currently bound to this clipId
  sourceIn: number;
  sourceOut: number;
  // TIMELINE start (clip will be shifted as speed changes downstream)
  timelineStart: number;
  playbackSpeed: number;
  volume: number;
  mute: boolean;
}

export async function buildTimeline(
  actions: Action[],
  resolver: AssetResolver,
  settings: ProjectSettings
): Promise<Timeline> {
  const clips = new Map<string, ClipState>();
  const captions: CaptionSegment[] = [];

  // map inputPath -> inputIndex (dedupe inputs to ffmpeg)
  const inputIndexByPath = new Map<string, number>();
  const nextInputIndex = () => inputIndexByPath.size;

  const ensureInput = (path: string): number => {
    if (inputIndexByPath.has(path)) return inputIndexByPath.get(path)!;
    const idx = nextInputIndex();
    inputIndexByPath.set(path, idx);
    return idx;
  };

  for (const a of actions) {
    switch (a.type) {
      case "addMedia": {
        const entry = resolver.resolve(a.mediaId);
        if (!entry) throw new Error(`addMedia: unresolved ${a.mediaId}`);
        const duration =
          entry.durationSec ?? (await probeDuration(entry.filePath));
        const sourceIn = a.sourceIn ?? 0;
        const sourceOut = a.sourceOut ?? duration;
        const inputIndex = ensureInput(entry.filePath);

        const kind: "video" | "audio" =
          entry.kind === "audio" ? "audio" : "video";

        clips.set(a.clipId, {
          trackId: a.trackId,
          inputIndex,
          inputPath: entry.filePath,
          kind,
          sourceIn,
          sourceOut,
          timelineStart: a.startTime,
          playbackSpeed: 1.0,
          volume: 1.0,
          mute: false,
        });
        break;
      }

      case "split": {
        const orig = clips.get(a.clipId);
        if (!orig) throw new Error(`split: unknown clipId ${a.clipId}`);
        const splitSource = orig.sourceIn + a.time;
        if (splitSource <= orig.sourceIn || splitSource >= orig.sourceOut)
          throw new Error(`split: time ${a.time} out of bounds`);

        const seg1: ClipState = { ...orig, sourceOut: splitSource };
        const seg1Duration = seg1.sourceOut - seg1.sourceIn;

        const seg2: ClipState = {
          ...orig,
          sourceIn: splitSource,
          timelineStart: orig.timelineStart + seg1Duration / orig.playbackSpeed,
        };

        clips.delete(a.clipId);
        clips.set(`${a.clipId}_segment_1`, seg1);
        clips.set(`${a.clipId}_segment_2`, seg2);
        break;
      }

      case "updateClip": {
        const c = clips.get(a.clipId);
        if (!c) throw new Error(`updateClip: unknown clipId ${a.clipId}`);
        if (a.properties.playbackSpeed !== undefined)
          c.playbackSpeed = a.properties.playbackSpeed;
        if (a.properties.volume !== undefined) c.volume = a.properties.volume;
        if (a.properties.mute !== undefined) c.mute = a.properties.mute;
        break;
      }

      case "removeClip": {
        clips.delete(a.clipId);
        break;
      }

      case "addCaption": {
        captions.push({
          startTime: a.startTime,
          duration: a.duration,
          text: a.text,
          style: normalizeCaptionStyle(a.style, settings),
        });
        break;
      }
    }
  }

  // Partition clips into video vs audio (bgm) tracks
  const videoSegments: VideoSegment[] = [];
  const bgmTracks: AudioSegment[] = [];

  for (const c of clips.values()) {
    if (c.trackId.startsWith("video_")) {
      videoSegments.push({
        inputIndex: c.inputIndex,
        inputPath: c.inputPath,
        sourceIn: c.sourceIn,
        sourceOut: c.sourceOut,
        timelineStart: c.timelineStart,
        playbackSpeed: c.playbackSpeed,
        volume: c.mute ? 0 : c.volume,
        mute: c.mute,
      });
    } else if (c.trackId.startsWith("audio_")) {
      bgmTracks.push({
        inputIndex: c.inputIndex,
        inputPath: c.inputPath,
        sourceIn: c.sourceIn,
        sourceOut: c.sourceOut,
        timelineStart: c.timelineStart,
        volume: c.mute ? 0 : c.volume,
      });
    }
  }

  videoSegments.sort((a, b) => a.timelineStart - b.timelineStart);
  bgmTracks.sort((a, b) => a.timelineStart - b.timelineStart);

  // total timeline duration = end of last video segment
  const duration = videoSegments.reduce((max, s) => {
    const segDur = (s.sourceOut - s.sourceIn) / s.playbackSpeed;
    return Math.max(max, s.timelineStart + segDur);
  }, 0);

  return { settings, duration, videoSegments, bgmTracks, captions };
}

function normalizeCaptionStyle(
  style: any,
  settings: ProjectSettings
): CaptionSegment["style"] {
  const fs = parseFontSize(style?.fontSize, settings);
  return {
    color: style?.color ?? "white",
    fontSize: fs,
    fontFamily: style?.fontFamily ?? "Arial",
    fontWeight: style?.fontWeight ?? "bold",
    textAlign: style?.textAlign ?? "center",
    verticalAlign: style?.verticalAlign ?? "middle",
    backgroundColor: style?.backgroundColor,
    strokeColor: style?.strokeColor,
    strokeWidth: style?.strokeWidth ?? 0,
  };
}

function parseFontSize(input: any, settings: ProjectSettings): number {
  if (typeof input === "number") return input;
  if (typeof input === "string") {
    const m = input.match(/^([\d.]+)(vw|vh|px)?$/i);
    if (!m) return 72;
    const n = parseFloat(m[1]);
    const unit = (m[2] ?? "px").toLowerCase();
    if (unit === "vw") return Math.round((settings.width * n) / 100);
    if (unit === "vh") return Math.round((settings.height * n) / 100);
    return n;
  }
  return 72;
}
