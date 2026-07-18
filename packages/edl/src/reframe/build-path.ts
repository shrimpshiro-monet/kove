import type { SubjectTrack, CropRect, SmoothCfg } from "./types.js";

export const DEFAULT_SMOOTH_CFG: SmoothCfg = {
  minCutoff: 0.4,
  beta: 0.3,
  dCutoff: 1.0,
  gapDecayMs: 2000,
};

interface OneEuroState {
  prevValue: number;
  prevDerivative: number;
  prevTime: number;
}

function oneEuroFilter(
  state: OneEuroState,
  value: number,
  time: number,
  minCutoff: number,
  beta: number,
  dCutoff: number,
): number {
  const dt = Math.max(time - state.prevTime, 1 / 30_000);
  const cutoff = minCutoff + beta * Math.abs(state.prevDerivative);
  const alpha = 1 / (1 + dt * cutoff * Math.PI * 2);
  const smoothed = state.prevValue + alpha * (value - state.prevValue);
  const derivative = (smoothed - state.prevValue) / dt;
  const dAlpha = 1 / (1 + dt * dCutoff * Math.PI * 2);
  const smoothedDerivative = state.prevDerivative + dAlpha * (derivative - state.prevDerivative);
  state.prevValue = smoothed;
  state.prevDerivative = smoothedDerivative;
  state.prevTime = time;
  return smoothed;
}

export function buildPath(
  track: SubjectTrack,
  targetRatio: { w: number; h: number },
  cfg: SmoothCfg = DEFAULT_SMOOTH_CFG,
  lockedTrackId?: number,
): Float64Array {
  const sorted = [...track.detections].sort((a, b) => a.time - b.time);
  if (sorted.length === 0) {
    return new Float64Array(0);
  }

  const trackIds = [...new Set(sorted.map((d) => d.trackId))];
  const followId = lockedTrackId ?? trackIds[0];

  const subjectDetections = sorted.filter((d) => d.trackId === followId);
  if (subjectDetections.length === 0) {
    return new Float64Array(0);
  }

  const fps = 30;
  const totalFrames = Math.ceil(track.duration * fps);
  const path = new Float64Array(totalFrames * 4);

  const states: Record<string, OneEuroState> = {
    cx: { prevValue: 0.5, prevDerivative: 0, prevTime: 0 },
    cy: { prevValue: 0.5, prevDerivative: 0, prevTime: 0 },
    cw: { prevValue: 1, prevDerivative: 0, prevTime: 0 },
    ch: { prevValue: 1, prevDerivative: 0, prevTime: 0 },
  };

  let lastDetectionTime = -1;
  let lastCx = 0.5;
  let lastCy = 0.5;
  let gapStartTime = -1;

  const srcAspect = 16 / 9;
  const dstAspect = targetRatio.w / targetRatio.h;

  const findDetectionAt = (t: number) => {
    for (let i = 0; i < subjectDetections.length - 1; i++) {
      const curr = subjectDetections[i];
      const next = subjectDetections[i + 1];
      if (t >= curr.time && t <= next.time) {
        const frac = (t - curr.time) / Math.max(next.time - curr.time, 0.001);
        const cx = curr.bbox.centerX + (next.bbox.centerX - curr.bbox.centerX) * frac;
        const cy = curr.bbox.centerY + (next.bbox.centerY - curr.bbox.centerY) * frac;
        const cw = curr.bbox.width + (next.bbox.width - curr.bbox.width) * frac;
        const ch = curr.bbox.height + (next.bbox.height - curr.bbox.height) * frac;
        return { cx, cy, cw, ch, confidence: curr.confidence, found: true as const };
      }
    }
    const last = subjectDetections[subjectDetections.length - 1];
    if (last) {
      return { cx: last.bbox.centerX, cy: last.bbox.centerY, cw: last.bbox.width, ch: last.bbox.height, confidence: last.confidence, found: true as const };
    }
    return { cx: 0, cy: 0, cw: 0, ch: 0, confidence: 0, found: false as const };
  };

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const t = frameIdx / fps;

    const detection = findDetectionAt(t);
    const idx = frameIdx * 4;

    if (!detection.found || detection.confidence !== undefined && detection.confidence! < 0.3) {
      if (gapStartTime < 0) gapStartTime = t;
      const gapDuration = t - gapStartTime;

      if (gapDuration * 1000 > cfg.gapDecayMs) {
        const decay = Math.min(gapDuration / (cfg.gapDecayMs / 1000), 1);
        const cx = lastCx + (0.5 - lastCx) * decay;
        const cy = lastCy + (0.5 - lastCy) * decay;
        const cw = Math.min(1, track.detections[0]?.bbox.width ?? 1);
        const ch = cw / dstAspect;

        states.cx.prevValue = cx;
        states.cy.prevValue = cy;
        path[idx] = cx;
        path[idx + 1] = cy;
        path[idx + 2] = cw;
        path[idx + 3] = ch;
      } else {
        path[idx] = states.cx.prevValue;
        path[idx + 1] = states.cy.prevValue;
        path[idx + 2] = states.cw.prevValue;
        path[idx + 3] = states.ch.prevValue;
      }
      continue;
    }

    gapStartTime = -1;

    const timeMs = t * 1000;
    const smoothCx = oneEuroFilter(states.cx, detection.cx, timeMs, cfg.minCutoff, cfg.beta, cfg.dCutoff);
    const smoothCy = oneEuroFilter(states.cy, detection.cy, timeMs, cfg.minCutoff, cfg.beta, cfg.dCutoff);
    const smoothCw = oneEuroFilter(states.cw, detection.cw, timeMs, cfg.minCutoff, cfg.beta, cfg.dCutoff);
    const smoothCh = oneEuroFilter(states.ch, detection.ch, timeMs, cfg.minCutoff, cfg.beta, cfg.dCutoff);

    lastCx = smoothCx;
    lastCy = smoothCy;
    lastDetectionTime = t;

    let cropW: number;
    let cropH: number;
    if (dstAspect > srcAspect) {
      cropW = 1;
      cropH = 1 / dstAspect;
    } else {
      cropH = 1;
      cropW = dstAspect;
    }

    const subjectW = Math.max(smoothCw, 0.3);
    const subjectH = Math.max(smoothCh, subjectW / dstAspect);
    const safeCropW = Math.max(cropW, subjectW);
    const safeCropH = Math.max(cropH, subjectH);

    let cropX = smoothCx - safeCropW / 2;
    let cropY = smoothCy - safeCropH / 2;
    cropX = Math.max(0, Math.min(1 - safeCropW, cropX));
    cropY = Math.max(0, Math.min(1 - safeCropH, cropY));

    path[idx] = cropX;
    path[idx + 1] = cropY;
    path[idx + 2] = safeCropW;
    path[idx + 3] = safeCropH;
  }

  return path;
}

export function resolvePath(path: Float64Array, t: number, fps: number = 30): CropRect | null {
  const totalFrames = path.length / 4;
  if (totalFrames === 0) return null;

  const frameFloat = t * fps;
  const frameIdx = Math.floor(frameFloat);
  const frac = frameFloat - frameIdx;

  if (frameIdx >= totalFrames - 1) {
    const i = (totalFrames - 1) * 4;
    return { x: path[i], y: path[i + 1], width: path[i + 2], height: path[i + 3] };
  }

  const i0 = frameIdx * 4;
  const i1 = (frameIdx + 1) * 4;

  return {
    x: path[i0] + (path[i1] - path[i0]) * frac,
    y: path[i0 + 1] + (path[i1 + 1] - path[i0 + 1]) * frac,
    width: path[i0 + 2] + (path[i1 + 2] - path[i0 + 2]) * frac,
    height: path[i0 + 3] + (path[i1 + 3] - path[i0 + 3]) * frac,
  };
}
