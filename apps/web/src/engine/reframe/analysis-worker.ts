import { createDemuxer } from "./demuxer.js";
import { normalizeMediaPipeFace, iou } from "@monet/edl";
import type { SubjectTrack, SubjectTrackFrame, SubjectBBox } from "@monet/edl";

let faceDetector: any = null;

interface WorkerInput {
  type: "analyze";
  clipId: string;
  sourceAssetId: string;
  mediaUrl: string;
  fps: number;
  duration: number;
}

interface ActiveTrack {
  trackId: number;
  lastBbox: SubjectBBox;
  lastTime: number;
  framesSinceMatch: number;
}

function hungarianAssign(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0].length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      let i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) {
      result[p[j] - 1] = j - 1;
    }
  }
  return result;
}

async function loadMediaPipe() {
  if (faceDetector) return;
  // @ts-expect-error — loaded dynamically at runtime via CDN, not an npm dependency
  const { FaceDetector } = await import("@mediapipe/tasks-vision");
  const wasm = await (await fetch("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.wasm")).arrayBuffer();
  faceDetector = await FaceDetector.createFromOptions(null, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      wasmBinary: wasm,
    },
    runningMode: "image",
    minDetectionConfidence: 0.5,
  });
}

function assignTrackIds(
  detections: { bbox: SubjectBBox; confidence: number }[],
  activeTracks: ActiveTrack[],
  frameIndex: number,
): { detections: SubjectTrackFrame[]; tracks: ActiveTrack[] } {
  const nextTrackId = activeTracks.length > 0
    ? Math.max(...activeTracks.map((t) => t.trackId)) + 1
    : 1;

  if (detections.length === 0 || activeTracks.length === 0) {
    if (detections.length === 0 && activeTracks.length > 0) {
      activeTracks.forEach((t) => t.framesSinceMatch++);
    }
    if (detections.length > 0 && activeTracks.length === 0) {
      const newTracks = detections.map((d, i) => ({
        trackId: nextTrackId + i,
        lastBbox: d.bbox,
        lastTime: frameIndex,
        framesSinceMatch: 0,
      }));
      const frames = detections.map((d, i) => ({
        time: frameIndex,
        frame: frameIndex,
        bbox: d.bbox,
        source: "mediapipe",
        confidence: d.confidence,
        trackId: nextTrackId + i,
        label: "face" as const,
      }));
      return { detections: frames, tracks: newTracks };
    }
    return { detections: [], tracks: activeTracks };
  }

  const costMatrix = detections.map((d) =>
    activeTracks.map((t) => {
      const iouVal = iou(d.bbox, t.lastBbox);
      return iouVal > 0.2 ? 1 - iouVal : 1.5;
    }),
  );

  const assignment = hungarianAssign(costMatrix);
  const newTracks: ActiveTrack[] = [];
  const frames: SubjectTrackFrame[] = [];
  const usedDetections = new Set<number>();

  for (let di = 0; di < detections.length; di++) {
    const assignedTrackIdx = assignment[di];
    const d = detections[di];

    if (assignedTrackIdx >= 0 && assignedTrackIdx < activeTracks.length && costMatrix[di][assignedTrackIdx] < 1.0) {
      const track = activeTracks[assignedTrackIdx];
      track.lastBbox = d.bbox;
      track.lastTime = frameIndex;
      track.framesSinceMatch = 0;
      usedDetections.add(di);
      frames.push({
        time: frameIndex,
        frame: frameIndex,
        bbox: d.bbox,
        source: "mediapipe",
        confidence: d.confidence,
        trackId: track.trackId,
        label: "face",
      });
    } else {
      const newTrackId = nextTrackId + newTracks.length;
      newTracks.push({
        trackId: newTrackId,
        lastBbox: d.bbox,
        lastTime: frameIndex,
        framesSinceMatch: 0,
      });
      usedDetections.add(di);
      frames.push({
        time: frameIndex,
        frame: frameIndex,
        bbox: d.bbox,
        source: "mediapipe",
        confidence: d.confidence,
        trackId: newTrackId,
        label: "face",
      });
    }
  }

  const keptTracks = activeTracks.filter((t) => {
    t.framesSinceMatch++;
    return t.framesSinceMatch < 30;
  });

  return { detections: frames, tracks: [...keptTracks, ...newTracks] };
}

const SAMPLE_INTERVAL = 10;
const LOW_CONF_INTERVAL = 3;
const HIGH_CONF_INTERVAL = 15;

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  if (e.data.type !== "analyze") return;

  const { clipId, sourceAssetId, mediaUrl, duration } = e.data;
  const detections: SubjectTrackFrame[] = [];
  let activeTracks: ActiveTrack[] = [];
  let frameCount = 0;
  let currentInterval = SAMPLE_INTERVAL;

  try {
    await loadMediaPipe();
  } catch (err) {
    self.postMessage({ type: "fallback", reason: "Failed to load MediaPipe" });
    return;
  }

  let videoDecoder: VideoDecoder | null = null;
  let resolveDecoder: (() => void) | null = null;
  let decoderDone = new Promise<void>((r) => { resolveDecoder = r; });

  const demuxer = createDemuxer({
    onReady: (config) => {
      if (typeof VideoDecoder === "undefined") {
        self.postMessage({ type: "fallback", reason: "VideoDecoder not available" });
        return;
      }

      videoDecoder = new VideoDecoder({
        output: async (frame: VideoFrame) => {
          frameCount++;

          if (frameCount % 30 === 0) self.postMessage({ type: "progress", percent: Math.round((frameCount / (duration * 30)) * 100) });

          if (frameCount % currentInterval !== 0) {
            frame.close();
            return;
          }

          try {
            const bitmap = await (frame as any).createImageBitmap({ resizeWidth: 640, resizeHeight: 360 });
            const result = await faceDetector.detect(bitmap);
            bitmap.close();

            let bestConfidence = 0;
            for (const face of result.detections) {
              const score = face.categories?.[0]?.score ?? 0;
              bestConfidence = Math.max(bestConfidence, score);
            }

            if (bestConfidence < 0.3 && currentInterval > 1) {
              currentInterval = Math.max(1, currentInterval - 2);
            } else if (bestConfidence > 0.7 && currentInterval < HIGH_CONF_INTERVAL) {
              currentInterval = Math.min(HIGH_CONF_INTERVAL, currentInterval + 1);
            }

            const frameDetections = result.detections.map((face: any) => {
              const rawBbox = face.boundingBox;
              return {
                bbox: {
                  x: (rawBbox?.originX ?? 0) / 640,
                  y: (rawBbox?.originY ?? 0) / 360,
                  width: (rawBbox?.width ?? 0) / 640,
                  height: (rawBbox?.height ?? 0) / 360,
                  centerX: ((rawBbox?.originX ?? 0) + (rawBbox?.width ?? 0) / 2) / 640,
                  centerY: ((rawBbox?.originY ?? 0) + (rawBbox?.height ?? 0) / 2) / 360,
                },
                confidence: face.categories?.[0]?.score ?? 0,
              };
            });

            const result2 = assignTrackIds(frameDetections, activeTracks, frameCount);
            detections.push(...result2.detections);
            activeTracks = result2.tracks;
          } catch (e) {
            console.error("[analysis-worker] frame error:", e);
          }

          frame.close();
        },
        error: (e) => {
          self.postMessage({ type: "error", reason: e.message });
        },
      });

      try {
        videoDecoder.configure({
          codec: config.codec,
          codedWidth: config.codedWidth,
          codedHeight: config.codedHeight,
          description: config.description ?? undefined,
        });
      } catch (e) {
        self.postMessage({ type: "fallback", reason: `Decoder config failed: ${e}` });
        return;
      }
    },
    onSample: (chunk) => {
      videoDecoder?.decode(chunk);
    },
    onError: (e) => {
      self.postMessage({ type: "error", reason: e.message });
    },
  });

  const response = await fetch(mediaUrl);
  if (!response.ok || !response.body) {
    self.postMessage({ type: "error", reason: "Failed to fetch media" });
    return;
  }

  const reader = response.body.getReader();
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    demuxer.appendBuffer(buf, offset);
    offset += value.byteLength;
  }
  demuxer.flush();

  if (videoDecoder) {
    const dec = videoDecoder as unknown as VideoDecoder;
    await dec.flush();
    dec.close();
  }

  const track: SubjectTrack = {
    clipId,
    sourceAssetId,
    model: "mediapipe",
    mediapipeVersion: "1.0",
    createdAt: Date.now(),
    duration,
    fps: 30,
    detections: detections.sort((a, b) => a.time - b.time),
    gapPolicy: "hold-last",
  };

  self.postMessage({ type: "track", track });
};
