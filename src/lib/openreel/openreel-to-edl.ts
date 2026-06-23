import type { MonetEDL, Shot, Effect as MonetEffect, TextOverlay, TransitionType, EasingType, Keyframe } from "@/server/types/edl";

// Matches types in edl-to-openreel.ts
interface OpenReelMediaMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  sampleRate: number;
  channels: number;
  fileSize: number;
}

interface OpenReelMediaItem {
  id: string;
  name: string;
  type: "video" | "audio" | "image";
  fileHandle: null;
  blob: null;
  metadata: OpenReelMediaMetadata;
  thumbnailUrl: string | null;
  waveformData: null;
  isPlaceholder?: boolean;
  originalUrl?: string;
}

interface OpenReelClip {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  effects: Array<{
    id: string;
    type: string;
    enabled: boolean;
    params: Record<string, number>;
  }>;
  audioEffects: Array<{
    id: string;
    type: string;
    enabled: boolean;
    params: Record<string, number>;
  }>;
  transform: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    anchor: { x: number; y: number };
    opacity: number;
  };
  volume: number;
  keyframes: Array<{
    id: string;
    time: number;
    property: string;
    value: unknown;
    easing: "linear";
  }>;
  speed?: number;
}

interface OpenReelProject {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  settings: {
    width: number;
    height: number;
    frameRate: number;
    sampleRate: number;
    channels: number;
  };
  mediaLibrary: {
    items: OpenReelMediaItem[];
  };
  timeline: {
    tracks: Array<{
      id: string;
      type: "video" | "audio" | "image" | "text" | "graphics";
      name: string;
      clips: OpenReelClip[];
      transitions: Array<{
        id: string;
        clipAId: string;
        clipBId: string;
        type: "crossfade" | "wipe" | "slide" | "zoom" | "push" | "dipToBlack" | "dipToWhite";
        duration: number;
        params: Record<string, unknown>;
      }>;
      locked: boolean;
      hidden: boolean;
      muted: boolean;
      solo: boolean;
    }>;
    subtitles: Array<{
      id: string;
      text: string;
      startTime: number;
      endTime: number;
      style?: {
        fontFamily: string;
        fontSize: number;
        color: string;
        backgroundColor: string;
        position: "top" | "center" | "bottom";
      };
    }>;
    duration: number;
    markers: Array<{ id: string; time: number; label: string; color: string }>;
    beatMarkers?: Array<{ time: number; strength: number; index: number; isDownbeat: boolean }>;
    beatAnalysis?: {
      bpm: number;
      confidence: number;
      sourceClipId?: string;
      analyzedAt: number;
    };
  };
}

export interface BridgeResult {
  edl: MonetEDL;
  changes: string[];
}

function denormalizePosition(val: number): number {
  return (val - 0.5) * 2;
}

function getNumericParam(
  params: Record<string, unknown> | undefined,
  key: string,
  defaultValue: number
): number {
  const value = params?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function mapOpenReelEffect(effect: any): MonetEffect | null {
  const params = effect.params as Record<string, unknown> | undefined;

  switch (effect.type) {
    case "blur": {
      const radius = getNumericParam(params, "radius", 27.5);
      return { id: effect.id, type: "blur", intensity: (radius - 10) / 35 };
    }
    case "glow": {
      const intensity = getNumericParam(params, "intensity", 1);
      return { id: effect.id, type: "glow", intensity: intensity / 2 };
    }
    case "brightness": {
      const value = getNumericParam(params, "value", 0);
      return { id: effect.id, type: "brightness", intensity: value / 100 + 0.5 };
    }
    case "contrast": {
      const value = getNumericParam(params, "value", 0);
      return { id: effect.id, type: "contrast", intensity: value / 100 + 0.5 };
    }
    case "saturation": {
      const value = getNumericParam(params, "value", 0);
      return { id: effect.id, type: "saturation", intensity: value / 100 + 0.5 };
    }
    case "motion-blur": {
      const amount = getNumericParam(params, "amount", 0.5);
      return { id: effect.id, type: "shake", intensity: amount };
    }
    default:
      return null;
  }
}

export function convertOpenReelProjectToMonetEDL(
  project: OpenReelProject,
  originalEDL?: MonetEDL
): BridgeResult {
  const changes: string[] = [];
  
  const videoTrack = project.timeline.tracks.find(t => t.type === "video");
  const audioTrack = project.timeline.tracks.find(t => t.type === "audio");
  
  const shots: Shot[] = (videoTrack?.clips || []).map((clip) => {
    const transition = videoTrack?.transitions.find(tr => tr.clipBId === clip.id);
    
    const shot: Shot = {
      id: clip.id,
      source: {
        clipId: clip.mediaId,
        inPoint: clip.inPoint,
        outPoint: clip.outPoint,
      },
      timing: {
        startTime: clip.startTime,
        duration: clip.duration,
        speed: clip.speed ?? 1,
      },
      transform: {
        position: {
          x: denormalizePosition(clip.transform.position.x),
          y: denormalizePosition(clip.transform.position.y),
        },
        scale: clip.transform.scale.x, // Assuming uniform scale
        rotation: clip.transform.rotation,
        opacity: clip.transform.opacity,
      },
      effects: clip.effects.map(mapOpenReelEffect).filter((e): e is MonetEffect => e !== null),
      transition: transition ? {
        type: "crossfade", // OpenReel transitions mostly map to crossfade in Monet MVP
        duration: transition.duration,
      } : undefined,
    };
    return shot;
  });

  const musicClip = audioTrack?.clips[0];
  const edl: MonetEDL = {
    version: "1.0.0",
    metadata: {
      title: project.name,
      createdAt: Date.now(),
      aiModel: originalEDL?.metadata.aiModel ?? "manual-edit",
      prompt: originalEDL?.metadata.prompt ?? "",
      intentId: originalEDL?.metadata.intentId ?? "",
      analysisId: originalEDL?.metadata.analysisId ?? "",
    },
    timeline: {
      resolution: { width: project.settings.width, height: project.settings.height },
      fps: project.settings.frameRate,
      duration: project.timeline.duration,
    },
    music: musicClip ? {
      id: "music-main",
      sourceId: musicClip.mediaId,
      bpm: project.timeline.beatAnalysis?.bpm ?? 120,
      beatGrid: project.timeline.beatMarkers?.map(m => m.time) ?? [],
      volume: musicClip.volume,
    } : undefined,
    shots,
    textOverlays: project.timeline.subtitles.map(s => ({
      id: s.id,
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
      style: {
        fontSize: s.style?.fontSize,
        color: s.style?.color,
      }
    })),
  };

  // Generate changes summary if originalEDL is provided
  if (originalEDL) {
    // 1. Check for shot additions/deletions
    if (originalEDL.shots.length !== shots.length) {
      changes.push(`Number of shots changed from ${originalEDL.shots.length} to ${shots.length}.`);
    }

    // 2. Check timing shifts
    shots.forEach((shot, i) => {
      const orig = originalEDL.shots.find(s => s.id === shot.id);
      if (orig) {
        if (Math.abs(orig.timing.startTime - shot.timing.startTime) > 0.1) {
          changes.push(`Shot ${i + 1} shifted in timeline.`);
        }
        if (Math.abs(orig.source.inPoint - shot.source.inPoint) > 0.1 || Math.abs(orig.source.outPoint - shot.source.outPoint) > 0.1) {
          changes.push(`Shot ${i + 1} trim points adjusted.`);
        }
        if (orig.effects?.length !== shot.effects?.length) {
          changes.push(`Effects on shot ${i + 1} were modified.`);
        }
      } else {
        changes.push(`New shot added at ${shot.timing.startTime}s.`);
      }
    });

    originalEDL.shots.forEach(orig => {
      if (!shots.find(s => s.id === orig.id)) {
        changes.push(`Shot starting at ${orig.timing.startTime}s was removed.`);
      }
    });
  }

  return { edl, changes };
}
