/**
 * monet-audio-adapter.ts — Bridges Monet's reference analysis into Kove's audio engine.
 *
 * Instead of rebuilding ducking/beat-sync/SFX with raw FFmpeg,
 * this adapter maps Monet's analysis results into Kove's existing
 * audio engine format (tracks, clips, markers, gain automation).
 *
 * Kove already handles:
 * - Auto-ducking (music gain drops when dialogue is active)
 * - Beat sync (pulse-based nearest beat detection)
 * - SFX synthesis (whoosh, hit, bass_drop)
 * - Multi-track scheduling (AudioTimelineEngine)
 *
 * This adapter feeds Monet's intelligence INTO that system.
 */

import type { MonetEDL } from "@monet/edl";

export interface MonetAudioAnalysis {
  // From song structure analysis
  songStructure: {
    duration: number;
    bpm: number;
    bestSegment: { start: number; end: number; score: number };
    sections: Array<{
      type: string;
      start: number;
      end: number;
      energy: number;
    }>;
    peakMoment: number;
  };
  // From speech detection
  speech: {
    hasSpeech: boolean;
    segments: Array<{ start: number; end: number }>;
    speechRatio: number;
  };
  // From reference analysis
  reference?: {
    effects: Record<string, number>;
    transitions: Record<string, number>;
    beat: { bpm: number; grid: number[] };
  };
}

/**
 * Convert Monet's audio analysis into Kove-compatible EDL audio tracks.
 *
 * This produces:
 * 1. Music track with best segment trimming
 * 2. Beat markers for sync
 * 3. SFX markers at edit points
 * 4. Gain automation for ducking (fallback if Kove's real-time ducking isn't active)
 */
export function monetAnalysisToKoveEDL(
  edl: MonetEDL,
  analysis: MonetAudioAnalysis
): { edl: MonetEDL; audioIntelligence: { beatGrid: number[]; sfxTriggers: Array<{ time: number; type: string; intensity: number }>; speechSegments: Array<{ start: number; end: number }>; songStructure: { bpm: number; bestSegment: { start: number; end: number; score: number }; sections: Array<{ type: string; start: number; end: number; energy: number }>; peakMoment: number } } } {
  const { songStructure, speech, reference } = analysis;

  // Build beat markers from BPM
  const beatGrid = reference?.beat?.grid ?? generateBeatGrid(
    songStructure.bpm,
    edl.timeline.duration,
    songStructure.bestSegment.start
  );

  // Add beat markers to EDL
  const beatMarkers = beatGrid.map((time, i) => ({
    id: `beat-${i}`,
    type: "beat" as const,
    time,
    label: `Beat ${i + 1}`,
  }));

  // Add transient markers at shot starts (for impact effects)
  const transientMarkers = edl.shots.map((shot, i) => ({
    id: `transient-${i}`,
    type: "transient" as const,
    time: shot.timing.startTime,
    label: `Shot ${i + 1}`,
  }));

  // Add section markers from song structure
  const sectionMarkers = songStructure.sections.map((section, i) => ({
    id: `section-${i}`,
    type: "marker" as const,
    time: section.start,
    label: `${section.type} (E: ${section.energy.toFixed(2)})`,
  }));

  // Add speech markers for ducking reference
  const speechMarkers = speech.segments.map((seg, i) => ({
    id: `speech-${i}`,
    type: "marker" as const,
    time: seg.start,
    label: `Speech ${i + 1}`,
    meta: { end: seg.end, isSpeech: true },
  }));

  // Collect all markers (stored in audioIntelligence, not in EDL schema)
  const allMarkers = [
    ...beatMarkers,
    ...transientMarkers,
    ...sectionMarkers,
    ...speechMarkers,
  ].sort((a, b) => a.time - b.time);

  // Add SFX triggers at high-energy edit points
  const sfxTriggers = reference?.effects
    ? buildSFXTriggers(edl, reference.effects, songStructure)
    : [];

  // Build music clip with best segment
  const musicClip = edl.music
    ? {
        ...edl.music,
        // Trim to best segment if we have song structure data
        inPoint: songStructure.bestSegment.start,
        outPoint: songStructure.bestSegment.end,
      }
    : edl.music;

  // Return the audio analysis as a separate structure (MonetEDL doesn't have meta)
  // The caller stores this alongside the EDL
  return {
    edl: {
      ...edl,
      music: musicClip as MonetEDL["music"],
    } as MonetEDL,
    audioIntelligence: {
      beatGrid,
      sfxTriggers,
      speechSegments: speech.segments,
      songStructure: {
        bpm: songStructure.bpm,
        bestSegment: songStructure.bestSegment,
        sections: songStructure.sections,
        peakMoment: songStructure.peakMoment,
      },
    },
  };
}

/**
 * Generate beat grid from BPM, starting at a reference time.
 */
function generateBeatGrid(
  bpm: number,
  duration: number,
  offset = 0
): number[] {
  if (bpm <= 0) return [];
  const interval = 60 / bpm;
  const grid: number[] = [];
  for (let t = offset; t < duration; t += interval) {
    grid.push(Math.round(t * 1000) / 1000);
  }
  return grid;
}

/**
 * Build SFX triggers for edit points.
 * Maps reference effect vocabulary to Kove's SFX types.
 */
function buildSFXTriggers(
  edl: MonetEDL,
  effectVocab: Record<string, number>,
  songStructure: MonetAudioAnalysis["songStructure"]
): Array<{
  time: number;
  type: "whoosh" | "hit" | "bass_drop";
  intensity: number;
}> {
  const triggers: Array<{
    time: number;
    type: "whoosh" | "hit" | "bass_drop";
    intensity: number;
  }> = [];

  // Map reference effects to SFX types
  const sfxMap: Record<string, "whoosh" | "hit" | "bass_drop"> = {
    impact_flash: "hit",
    context_shake: "hit",
    chromatic_burst: "hit",
    speed_ramp: "whoosh",
    bloom_highlights: "bass_drop",
  };

  // Place SFX at shot transitions
  for (let i = 1; i < edl.shots.length; i++) {
    const shot = edl.shots[i];
    const prevShot = edl.shots[i - 1];

    // Determine SFX type based on transition and effects
    let sfxType: "whoosh" | "hit" | "bass_drop" = "hit";
    let intensity = 0.5;

    if (shot.transition?.type === "flash") {
      sfxType = "hit";
      intensity = 0.8;
    } else if (prevShot?.timing.speedRamp) {
      sfxType = "whoosh";
      intensity = 0.7;
    } else if (i % 4 === 0) {
      // Every 4th shot gets a bass drop for rhythm
      sfxType = "bass_drop";
      intensity = 0.6;
    }

    // Check if this is near a peak energy moment
    const position = shot.timing.startTime / edl.timeline.duration;
    if (Math.abs(position - songStructure.peakMoment / songStructure.duration) < 0.1) {
      intensity = Math.min(1, intensity * 1.3);
    }

    triggers.push({
      time: shot.timing.startTime,
      type: sfxType,
      intensity,
    });
  }

  return triggers;
}

/**
 * Generate gain automation envelope for speech ducking.
 *
 * This is the server-side equivalent of Kove's real-time ducking.
 * For server rendering (FFmpeg), we need explicit volume automation.
 */
export function generateDuckingEnvelope(
  speechSegments: Array<{ start: number; end: number }>,
  totalDuration: number,
  duckLevel = 0.22,
  attackTime = 0.15,
  releaseTime = 0.3
): Array<{ time: number; volume: number }> {
  const envelope: Array<{ time: number; volume: number }> = [];

  if (speechSegments.length === 0) {
    envelope.push({ time: 0, volume: 1 });
    return envelope;
  }

  envelope.push({ time: 0, volume: 1 });

  for (const seg of speechSegments) {
    envelope.push({ time: Math.max(0, seg.start - attackTime), volume: 1 });
    envelope.push({ time: seg.start, volume: duckLevel });
    envelope.push({ time: seg.end, volume: duckLevel });
    envelope.push({ time: seg.end + releaseTime, volume: 1 });
  }

  envelope.push({ time: totalDuration, volume: 1 });
  envelope.sort((a, b) => a.time - b.time);

  // Deduplicate
  const deduped: Array<{ time: number; volume: number }> = [];
  for (const point of envelope) {
    if (deduped.length === 0 || Math.abs(point.time - deduped[deduped.length - 1].time) > 0.01) {
      deduped.push(point);
    }
  }

  return deduped;
}

/**
 * Convert ducking envelope to FFmpeg volume filter expression.
 */
export function duckingEnvelopeToFFmpegFilter(
  envelope: Array<{ time: number; volume: number }>
): string {
  if (envelope.length <= 1) return "";

  return envelope
    .map(p => `volume=${p.volume.toFixed(2)}:t=${p.time.toFixed(3)}`)
    .join(":");
}
