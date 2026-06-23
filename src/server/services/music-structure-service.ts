// src/server/services/music-structure-service.ts
// Detects drops, sections, and downbeats from raw beat grid + energy data.
// Pure logic — no Gemini call needed for this layer.

export interface MusicSection {
  type: "intro" | "verse" | "chorus" | "drop" | "bridge" | "outro";
  startMs: number;
  endMs: number;
  energy: number;
  confidence: number;
}

export interface MusicStructure {
  bpm: number;
  beats: number[];           // ms timestamps
  downbeats: number[];       // first beat of each measure
  drops: number[];           // ms — biggest energy spikes
  sections: MusicSection[];
}

export interface AudioAnalysisInput {
  bpm: number;
  beats: number[];            // ms
  energyCurve: number[];      // 0-1 per second
  duration: number;           // ms
}

export function inferMusicStructure(input: AudioAnalysisInput): MusicStructure {
  // ===== Bulletproof inputs =====
  const beats = Array.isArray(input.beats) ? input.beats.slice().sort((a, b) => a - b) : [];
  const energy = Array.isArray(input.energyCurve) ? input.energyCurve : [];
  const duration = input.duration ?? (beats.length ? beats[beats.length - 1] : 30000);
  const bpm = input.bpm ?? 120;

  if (beats.length === 0 || energy.length === 0) {
    // Return a minimal valid structure
    return {
      bpm,
      beats,
      downbeats: [],
      drops: [],
      sections: [{
        type: "intro",
        startMs: 0,
        endMs: duration,
        energy: 0.5,
        confidence: 0.3,
      }],
    };
  }

  const downbeats = beats.filter((_, i) => i % 4 === 0);
  const drops: number[] = [];

  for (let i = 2; i < energy.length - 1; i++) {
    const delta = energy[i] - energy[i - 2];
    if (delta > 0.35 && energy[i] > 0.7) {
      const dropMs = i * 1000;
      const snapped = beats.length
        ? beats.reduce(
            (best, b) => Math.abs(b - dropMs) < Math.abs(best - dropMs) ? b : best,
            beats[0],
          )
        : dropMs;
      if (!drops.length || snapped - drops[drops.length - 1] > 4000) {
        drops.push(snapped);
      }
    }
  }

  const sections = segmentByEnergy(
    { bpm, beats, energyCurve: energy, duration },
    drops,
  );

  return { bpm, beats, downbeats, drops, sections };
}

function segmentByEnergy(input: AudioAnalysisInput, drops: number[]): MusicSection[] {
  const total = input.duration ?? 30000;
  const energy = Array.isArray(input.energyCurve) ? input.energyCurve : [];
  const sections: MusicSection[] = [];

  let cursor = 0;
  const firstEnergyIdx = energy.findIndex((e) => e > 0.5);
  const introEnd = Math.min(
    total * 0.15,
    firstEnergyIdx >= 0 ? firstEnergyIdx * 1000 : total * 0.1,
  );

  sections.push({
    type: "intro",
    startMs: 0,
    endMs: introEnd,
    energy: avgEnergy(energy, 0, introEnd),
    confidence: 0.8,
  });
  cursor = introEnd;

  // For each drop, the 10s before it is pre-drop tension (verse),
  // and the 12s after is chorus/drop
  drops.forEach((dropMs, i) => {
    const verseStart = cursor;
    const verseEnd = dropMs;
    if (verseEnd > verseStart) {
      sections.push({
        type: "verse",
        startMs: verseStart,
        endMs: verseEnd,
        energy: avgEnergy(energy, verseStart, verseEnd),
        confidence: 0.7,
      });
    }
    const chorusEnd = Math.min(dropMs + 12000, total - 5000);
    sections.push({
      type: i === 0 ? "drop" : "chorus",
      startMs: dropMs,
      endMs: chorusEnd,
      energy: avgEnergy(energy, dropMs, chorusEnd),
      confidence: 0.85,
    });
    cursor = chorusEnd;
  });

  // Outro = last 10%
  const outroStart = Math.max(cursor, total * 0.9);
  if (outroStart < total) {
    sections.push({
      type: "outro",
      startMs: outroStart,
      endMs: total,
      energy: avgEnergy(energy, outroStart, total),
      confidence: 0.75,
    });
  }

  return sections;
}

function avgEnergy(curve: number[], startMs: number, endMs: number): number {
  if (!Array.isArray(curve) || curve.length === 0) return 0;
  const startIdx = Math.max(0, Math.floor(startMs / 1000));
  const endIdx = Math.min(curve.length, Math.floor(endMs / 1000));
  if (endIdx <= startIdx) return curve[startIdx] ?? 0;
  let sum = 0;
  for (let i = startIdx; i < endIdx; i++) sum += curve[i] ?? 0;
  return sum / Math.max(1, endIdx - startIdx);
}
