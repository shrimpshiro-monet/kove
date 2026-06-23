// src/lib/style/reference-analyzer.ts
/**
 * Client-side reference analyzer.
 * Extracts pacing, motion, color, and audio signals from a reference video.
 * Heavy ML (SAM, depth) lives server-side; this is the lightweight pass.
 */

export interface StyleProfile {
  // Pacing
  avgShotDurationSec: number;
  cutsPerMin: number;
  pacingClass: "slow_burn" | "balanced" | "rapid" | "frantic";

  // Motion
  motionIntensity: number;        // 0..1
  cameraMovementPct: number;      // 0..1
  slowMoPct: number;
  speedUpPct: number;

  // Color
  dominantPalette: string[];      // hex
  avgSaturation: number;
  avgContrast: number;
  avgBrightness: number;
  temperature: number;            // -1..+1

  // Composition
  aspectRatio: number;

  // Audio
  bpm: number;
  audioEnergy: number;
  hasVoiceover: boolean;

  // Text
  textPresencePct: number;
  textStyleKeywords: string[];

  // Summary (human-readable, for the chat UI + the planner prompt)
  summary: string;

  // Provenance
  source: "reference" | "default" | "prompt-only";
  referenceMediaId?: string;
  analyzedAt: number;
}

const DEFAULT_PROFILE: StyleProfile = {
  avgShotDurationSec: 2.5,
  cutsPerMin: 24,
  pacingClass: "balanced",
  motionIntensity: 0.5,
  cameraMovementPct: 0.3,
  slowMoPct: 0.1,
  speedUpPct: 0.05,
  dominantPalette: ["#222", "#888", "#ddd"],
  avgSaturation: 1.0,
  avgContrast: 1.0,
  avgBrightness: 0.5,
  temperature: 0,
  aspectRatio: 9 / 16,
  bpm: 120,
  audioEnergy: 0.5,
  hasVoiceover: false,
  textPresencePct: 0,
  textStyleKeywords: [],
  summary: "balanced pacing, neutral grade",
  source: "default",
  analyzedAt: Date.now(),
};

export async function analyzeReference(
  videoElement: HTMLVideoElement,
  audioContext?: AudioContext,
): Promise<StyleProfile> {
  // Wait for metadata
  if (videoElement.readyState < 1) {
    await new Promise((res) => videoElement.addEventListener("loadedmetadata", res, { once: true }));
  }

  const [pacing, motion, color, audio, text] = await Promise.all([
    analyzePacing(videoElement),
    analyzeMotion(videoElement),
    analyzeColor(videoElement),
    analyzeAudio(videoElement),
    analyzeText(videoElement),
  ]);

  const profile: StyleProfile = {
    ...pacing,
    ...motion,
    ...color,
    ...audio,
    ...text,
    aspectRatio: videoElement.videoWidth / videoElement.videoHeight,
    source: "reference",
    analyzedAt: Date.now(),
    summary: "",
    referenceMediaId: undefined, // caller fills in
  };
  profile.summary = buildSummary(profile);
  return profile;
}

// ----- Pacing via frame-difference scene detection -----
async function analyzePacing(
  video: HTMLVideoElement,
): Promise<Pick<StyleProfile, "avgShotDurationSec" | "cutsPerMin" | "pacingClass">> {
  const duration = video.duration || 10;
  const sampleHz = 4; // 4 samples per second
  const samples = Math.min(120, Math.floor(duration * sampleHz));

  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 36;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  let prevPixels: Uint8ClampedArray | null = null;
  const diffs: number[] = [];
  const cutTimes: number[] = [];
  const cutThreshold = 30; // mean diff threshold for cut

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * duration;
    video.currentTime = t;
    await new Promise((res) => video.addEventListener("seeked", res, { once: true }));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    if (prevPixels) {
      let sum = 0;
      for (let j = 0; j < data.length; j += 4) {
        sum += Math.abs(data[j] - prevPixels[j]) +
               Math.abs(data[j+1] - prevPixels[j+1]) +
               Math.abs(data[j+2] - prevPixels[j+2]);
      }
      const meanDiff = sum / (data.length / 4 * 3);
      diffs.push(meanDiff);
      if (meanDiff > cutThreshold) cutTimes.push(t);
    }
    prevPixels = new Uint8ClampedArray(data);
  }

  const cuts = cutTimes.length;
  const cutsPerMin = (cuts / duration) * 60;
  const avgShotDuration = cuts > 0 ? duration / (cuts + 1) : duration;

  const pacingClass: StyleProfile["pacingClass"] =
    avgShotDuration < 0.8 ? "frantic" :
    avgShotDuration < 1.8 ? "rapid" :
    avgShotDuration < 4 ? "balanced" : "slow_burn";

  return { avgShotDurationSec: avgShotDuration, cutsPerMin, pacingClass };
}

// ----- Motion via optical flow approximation -----
async function analyzeMotion(
  video: HTMLVideoElement,
): Promise<Pick<StyleProfile, "motionIntensity" | "cameraMovementPct" | "slowMoPct" | "speedUpPct">> {
  const samples = 20;
  const canvas = document.createElement("canvas");
  canvas.width = 80; canvas.height = 45;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  let prev: Uint8ClampedArray | null = null;
  const intensities: number[] = [];

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * (video.duration || 10);
    video.currentTime = t;
    await new Promise((res) => video.addEventListener("seeked", res, { once: true }));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    if (prev) {
      let sum = 0;
      for (let j = 0; j < data.length; j += 4) {
        sum += Math.abs(data[j] - prev[j]);
      }
      intensities.push(sum / (data.length / 4));
    }
    prev = new Uint8ClampedArray(data);
  }

  const avg = intensities.reduce((a, b) => a + b, 0) / Math.max(1, intensities.length);
  const motionIntensity = Math.min(1, avg / 40);
  const cameraMovementPct = intensities.filter((x) => x > 15).length / Math.max(1, intensities.length);

  return {
    motionIntensity,
    cameraMovementPct,
    slowMoPct: 0,    // requires playback rate detection, defer to server
    speedUpPct: 0,
  };
}

// ----- Color: palette + saturation/contrast/brightness/temperature -----
async function analyzeColor(
  video: HTMLVideoElement,
): Promise<Pick<StyleProfile, "dominantPalette" | "avgSaturation" | "avgContrast" | "avgBrightness" | "temperature">> {
  const samples = 12;
  const canvas = document.createElement("canvas");
  canvas.width = 80; canvas.height = 45;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const allPixels: number[][] = [];
  const brightnesses: number[] = [];

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * (video.duration || 10);
    video.currentTime = t;
    await new Promise((res) => video.addEventListener("seeked", res, { once: true }));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let brightSum = 0;
    for (let j = 0; j < data.length; j += 4) {
      allPixels.push([data[j], data[j+1], data[j+2]]);
      brightSum += (data[j] + data[j+1] + data[j+2]) / 3;
    }
    brightnesses.push(brightSum / (data.length / 4));
  }

  // k-means lite for 5 dominant colors
  const palette = kmeansColors(allPixels, 5).map(rgbToHex);

  // saturation/contrast/brightness/temperature
  let satSum = 0, rSum = 0, bSum = 0;
  for (const [r, g, b] of allPixels) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
    rSum += r; bSum += b;
  }
  const avgSat = satSum / allPixels.length;       // 0..1
  const avgBright = (brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length) / 255;
  const brightStd = Math.sqrt(
    brightnesses.map((x) => Math.pow(x / 255 - avgBright, 2)).reduce((a, b) => a + b, 0) / brightnesses.length
  );
  const contrast = Math.min(2, brightStd * 5);
  const temp = Math.max(-1, Math.min(1, (rSum - bSum) / (rSum + bSum + 1)));

  return {
    dominantPalette: palette,
    avgSaturation: avgSat * 2,                  // map 0..1 → 0..2 for grading
    avgContrast: contrast,
    avgBrightness: avgBright,
    temperature: temp,
  };
}

// ----- Audio: BPM + energy + voiceover heuristic -----
async function analyzeAudio(
  video: HTMLVideoElement,
): Promise<Pick<StyleProfile, "bpm" | "audioEnergy" | "hasVoiceover">> {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const response = await fetch(video.currentSrc || video.src);
    const buf = await response.arrayBuffer();
    const audio = await ac.decodeAudioData(buf);
    const samples = audio.getChannelData(0);

    // RMS energy
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
    const rms = Math.sqrt(sumSq / samples.length);
    const energy = Math.min(1, rms * 8);

    // BPM via autocorrelation on energy envelope (cheap)
    const bpm = estimateBpm(samples, audio.sampleRate);

    // VO heuristic: dominant low-mid frequencies
    const hasVO = await detectVoiceover(audio);

    ac.close();
    return { bpm, audioEnergy: energy, hasVoiceover: hasVO };
  } catch {
    return { bpm: 120, audioEnergy: 0.5, hasVoiceover: false };
  }
}

function estimateBpm(samples: Float32Array, sampleRate: number): number {
  // Build a coarse energy envelope at 50Hz
  const hop = Math.floor(sampleRate / 50);
  const env: number[] = [];
  for (let i = 0; i < samples.length - hop; i += hop) {
    let s = 0;
    for (let j = 0; j < hop; j++) s += Math.abs(samples[i + j]);
    env.push(s);
  }
  // Autocorrelate within typical BPM range
  const minBpm = 60, maxBpm = 180;
  const envHz = 50;
  let best = 120, bestScore = -Infinity;
  for (let bpm = minBpm; bpm <= maxBpm; bpm++) {
    const lag = Math.floor((envHz * 60) / bpm);
    let score = 0;
    for (let i = 0; i < env.length - lag; i++) {
      score += env[i] * env[i + lag];
    }
    if (score > bestScore) { bestScore = score; best = bpm; }
  }
  return best;
}

async function detectVoiceover(audio: AudioBuffer): Promise<boolean> {
  const chunk = audio.getChannelData(0).slice(0, Math.min(audio.length, audio.sampleRate * 10));
  let zc = 0;
  for (let i = 1; i < chunk.length; i++) {
    if ((chunk[i] > 0) !== (chunk[i-1] > 0)) zc++;
  }
  const zcRate = zc / chunk.length;
  return zcRate > 0.04 && zcRate < 0.18;
}

// ----- Text presence heuristic -----
async function analyzeText(
  video: HTMLVideoElement,
): Promise<Pick<StyleProfile, "textPresencePct" | "textStyleKeywords">> {
  const samples = 15;
  const canvas = document.createElement("canvas");
  canvas.width = 160; canvas.height = 90;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  let framesWithText = 0;
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * (video.duration || 10);
    video.currentTime = t;
    await new Promise((res) => video.addEventListener("seeked", res, { once: true }));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (hasTextHeuristic(ctx, canvas.width, canvas.height)) framesWithText++;
  }
  const pct = framesWithText / samples;
  const keywords: string[] = [];
  if (pct > 0.3) keywords.push("bold");
  if (pct > 0.5) keywords.push("impact", "high_contrast");
  return { textPresencePct: pct, textStyleKeywords: keywords };
}

function hasTextHeuristic(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, Math.floor(h * 0.6), w, Math.floor(h * 0.4)).data;
  let edges = 0;
  for (let y = 1; y < Math.floor(h * 0.4); y++) {
    for (let x = 1; x < w; x++) {
      const i = (y * w + x) * 4;
      const ip = ((y - 1) * w + x) * 4;
      const lumDiff = Math.abs(
        (data[i] + data[i+1] + data[i+2]) - (data[ip] + data[ip+1] + data[ip+2])
      );
      if (lumDiff > 60) edges++;
    }
  }
  return edges / (w * Math.floor(h * 0.4)) > 0.06;
}

// ----- Utilities -----

function kmeansColors(pixels: number[][], k: number, iter = 8): number[][] {
  if (pixels.length === 0) return Array.from({ length: k }, () => [0, 0, 0]);
  const centroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);
  }
  for (let it = 0; it < iter; it++) {
    const buckets: number[][][] = Array.from({ length: k }, () => []);
    for (const p of pixels) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < k; i++) {
        const d = sqDist(p, centroids[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      buckets[best].push(p);
    }
    for (let i = 0; i < k; i++) {
      if (buckets[i].length === 0) continue;
      const sum = [0, 0, 0];
      for (const p of buckets[i]) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
      centroids[i] = [sum[0] / buckets[i].length, sum[1] / buckets[i].length, sum[2] / buckets[i].length];
    }
  }
  return centroids.map((c) => c.map(Math.round));
}

function sqDist(a: number[], b: number[]): number {
  return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
}

function rgbToHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

// ----- Summary builder -----
function buildSummary(p: StyleProfile): string {
  const bits: string[] = [];
  bits.push(p.pacingClass.replace("_", "-") + " pacing");
  bits.push(`~${p.bpm} BPM`);
  if (p.motionIntensity > 0.6) bits.push("motion-heavy");
  if (p.cameraMovementPct > 0.5) bits.push("handheld feel");
  if (p.temperature > 0.15) bits.push("warm grade");
  else if (p.temperature < -0.15) bits.push("cool grade");
  if (p.avgSaturation > 1.3) bits.push("punchy colors");
  else if (p.avgSaturation < 0.8) bits.push("desaturated");
  if (p.textPresencePct > 0.3) bits.push("text-heavy");
  return bits.join(", ");
}

export { DEFAULT_PROFILE };
