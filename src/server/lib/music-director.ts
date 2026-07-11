/**
 * AI Music Director
 *
 * Analyzes music structure and makes creative decisions about:
 * - Where to cut (beat alignment, phrase boundaries)
 * - When to duck music (under dialogue, for impact)
 * - When to boost music (drops, climaxes)
 * - How to match energy curves between music and video
 *
 * This is what makes the edit feel like the music drives the visuals.
 */

export interface MusicDirection {
  cuts: MusicCut[];
  energyMap: EnergyMapPoint[];
  duckZones: DuckZone[];
  boostZones: BoostZone[];
  phraseStructure: PhraseStructure;
  bpm: number;
  timeSignature: string;
}

export interface MusicCut {
  time: number;
  beatIndex: number;
  strength: "hard" | "soft" | "phrase";
  reason: string;
}

export interface EnergyMapPoint {
  time: number;
  energy: number;
  type: "beat" | "drop" | "build" | "break" | "chorus";
}

export interface DuckZone {
  start: number;
  end: number;
  targetVolume: number;
  fadeIn: number;
  fadeOut: number;
  reason: string;
}

export interface BoostZone {
  start: number;
  end: number;
  boostAmount: number;
  fadeIn: number;
  fadeOut: number;
  reason: string;
}

export interface PhraseStructure {
  bars: Array<{
    start: number;
    end: number;
    barNumber: number;
    energy: number;
    isChorus: boolean;
    isDrop: boolean;
    isBreak: boolean;
  }>;
  totalBars: number;
  avgBarDuration: number;
}

/**
 * Analyze music and generate a complete direction plan.
 *
 * @param beatGrid - Array of beat timestamps in seconds
 * @param bpm - Beats per minute
 * @param energyCurve - Energy values per second (0-1)
 * @param duration - Total duration in seconds
 * @param drops - Timestamps of drops/climaxes
 */
export function analyzeMusicDirection(
  beatGrid: number[],
  bpm: number,
  energyCurve: number[],
  duration: number,
  drops: number[] = []
): MusicDirection {
  // ─── Beat Analysis ──────────────────────────────────────────
  const beats = beatGrid.length > 0 ? beatGrid : generateBeats(bpm, duration);
  const beatsPerBar = 4; // Standard 4/4 time
  const barDuration = (60 / bpm) * beatsPerBar;

  // ─── Phrase Structure ────────────────────────────────────────
  const phraseStructure = analyzePhraseStructure(beats, energyCurve, duration, barDuration);

  // ─── Cut Points ──────────────────────────────────────────────
  const cuts = generateCutPoints(beats, phraseStructure, drops, duration);

  // ─── Energy Map ──────────────────────────────────────────────
  const energyMap = buildEnergyMap(beatGrid, energyCurve, drops, duration);

  // ─── Duck Zones ──────────────────────────────────────────────
  const duckZones = findDuckZones(energyCurve, phraseStructure, duration);

  // ─── Boost Zones ─────────────────────────────────────────────
  const boostZones = findBoostZones(energyCurve, drops, phraseStructure, duration);

  return {
    cuts,
    energyMap,
    duckZones,
    boostZones,
    phraseStructure,
    bpm,
    timeSignature: "4/4",
  };
}

// ─── Phrase Structure Analysis ──────────────────────────────────

function analyzePhraseStructure(
  beats: number[],
  energyCurve: number[],
  duration: number,
  barDuration: number
): PhraseStructure {
  const bars: PhraseStructure["bars"] = [];
  let barStart = 0;
  let barNumber = 1;

  while (barStart < duration) {
    const barEnd = Math.min(barStart + barDuration, duration);

    // Calculate average energy for this bar
    const barEnergy = calculateBarEnergy(barStart, barEnd, energyCurve, duration);

    // Detect if this bar is a chorus/drop/break based on energy
    const isChorus = barEnergy > 0.7;
    const isDrop = barEnergy > 0.85;
    const isBreak = barEnergy < 0.25;

    bars.push({
      start: barStart,
      end: barEnd,
      barNumber,
      energy: barEnergy,
      isChorus,
      isDrop,
      isBreak,
    });

    barStart = barEnd;
    barNumber++;
  }

  return {
    bars,
    totalBars: bars.length,
    avgBarDuration: barDuration,
  };
}

function calculateBarEnergy(
  barStart: number,
  barEnd: number,
  energyCurve: number[],
  totalDuration: number
): number {
  if (energyCurve.length === 0) return 0.5;

  const bucketSize = totalDuration / energyCurve.length;
  let energy = 0;
  let count = 0;

  for (let i = 0; i < energyCurve.length; i++) {
    const time = i * bucketSize;
    if (time >= barStart && time < barEnd) {
      energy += energyCurve[i];
      count++;
    }
  }

  return count > 0 ? energy / count : 0.5;
}

// ─── Cut Point Generation ────────────────────────────────────────

function generateCutPoints(
  beats: number[],
  phrase: PhraseStructure,
  drops: number[],
  duration: number
): MusicCut[] {
  const cuts: MusicCut[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (beat > duration) break;

    // Determine cut strength based on position in phrase
    const bar = phrase.bars.find(b => beat >= b.start && beat < b.end);
    const isBarStart = bar && Math.abs(beat - bar.start) < 0.05;
    const isPhraseStart = bar && bar.barNumber % 4 === 1;
    const isDrop = drops.some(d => Math.abs(d - beat) < 0.1);

    const key = `${beat.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (isDrop) {
      cuts.push({
        time: beat,
        beatIndex: i,
        strength: "hard",
        reason: "Drop/climax moment — maximum impact cut",
      });
    } else if (isPhraseStart) {
      cuts.push({
        time: beat,
        beatIndex: i,
        strength: "phrase",
        reason: "Phrase boundary — natural transition point",
      });
    } else if (isBarStart) {
      cuts.push({
        time: beat,
        beatIndex: i,
        strength: "soft",
        reason: "Bar start — rhythmic cut point",
      });
    }
  }

  return cuts;
}

// ─── Energy Map ──────────────────────────────────────────────────

function buildEnergyMap(
  beatGrid: number[],
  energyCurve: number[],
  drops: number[],
  duration: number
): EnergyMapPoint[] {
  const map: EnergyMapPoint[] = [];
  const bucketSize = duration / Math.max(1, energyCurve.length);

  for (let i = 0; i < energyCurve.length; i++) {
    const time = i * bucketSize;
    const energy = energyCurve[i];

    // Classify the energy point
    let type: EnergyMapPoint["type"] = "beat";
    if (drops.some(d => Math.abs(d - time) < 0.5)) {
      type = "drop";
    } else if (energy > 0.7) {
      type = "chorus";
    } else if (energy > 0.5 && i > 0 && energyCurve[i] > energyCurve[i - 1] * 1.2) {
      type = "build";
    } else if (energy < 0.25) {
      type = "break";
    }

    map.push({ time, energy, type });
  }

  return map;
}

// ─── Duck/Boost Zones ────────────────────────────────────────────

function findDuckZones(
  energyCurve: number[],
  phrase: PhraseStructure,
  duration: number
): DuckZone[] {
  const zones: DuckZone[] = [];

  // Duck during low-energy breaks (for potential dialogue/voiceover)
  for (const bar of phrase.bars) {
    if (bar.isBreak) {
      zones.push({
        start: bar.start,
        end: bar.end,
        targetVolume: 0.3,
        fadeIn: 0.2,
        fadeOut: 0.2,
        reason: "Low energy break — duck for voiceover/dialogue",
      });
    }
  }

  return zones;
}

function findBoostZones(
  energyCurve: number[],
  drops: number[],
  phrase: PhraseStructure,
  duration: number
): BoostZone[] {
  const zones: BoostZone[] = [];

  // Boost during drops and choruses
  for (const drop of drops) {
    zones.push({
      start: Math.max(0, drop - 0.5),
      end: Math.min(duration, drop + 2),
      boostAmount: 1.3,
      fadeIn: 0.3,
      fadeOut: 0.5,
      reason: "Drop/climax — boost for maximum impact",
    });
  }

  // Boost during high-energy choruses
  for (const bar of phrase.bars) {
    if (bar.isChorus && !bar.isDrop) {
      zones.push({
        start: bar.start,
        end: bar.end,
        boostAmount: 1.15,
        fadeIn: 0.1,
        fadeOut: 0.1,
        reason: "Chorus — slight energy boost",
      });
    }
  }

  return zones;
}

// ─── Helpers ──────────────────────────────────────────────────────

function generateBeats(bpm: number, duration: number): number[] {
  const beats: number[] = [];
  const interval = 60 / bpm;
  let time = 0;
  while (time < duration) {
    beats.push(time);
    time += interval;
  }
  return beats;
}
