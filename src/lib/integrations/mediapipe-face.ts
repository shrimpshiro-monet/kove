/**
 * MediaPipe face landmarker — lazy-loaded
 * Detects 478 face landmarks at ~30fps in browser. Used for tracked text/effects.
 */

let _landmarker: any | null = null;
let _loadingPromise: Promise<any> | null = null;

export async function getFaceLandmarker(): Promise<any> {
  if (_landmarker) return _landmarker;
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    );
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: false,
      runningMode: "VIDEO",
      numFaces: 1,
    });
    _landmarker = landmarker;
    return landmarker;
  })();

  return _loadingPromise;
}

export interface FaceTrackPoint {
  timestamp: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

/**
 * Track a face through a video.
 * Returns per-frame face positions (sampled at given interval).
 */
export async function trackFaceInVideo(
  video: HTMLVideoElement,
  options: { intervalMs?: number; maxFrames?: number } = {},
): Promise<FaceTrackPoint[]> {
  const landmarker = await getFaceLandmarker();
  const intervalMs = options.intervalMs ?? 100;
  const maxFrames = options.maxFrames ?? 300;

  const points: FaceTrackPoint[] = [];
  const duration = video.duration;

  for (let t = 0; t < duration && points.length < maxFrames; t += intervalMs / 1000) {
    video.currentTime = t;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    const result = landmarker.detectForVideo(video, t * 1000);
    if (result.faceLandmarks?.length) {
      const lm = result.faceLandmarks[0];
      const xs = lm.map((p: any) => p.x);
      const ys = lm.map((p: any) => p.y);
      const cx = xs.reduce((a: number, b: number) => a + b, 0) / xs.length;
      const cy = ys.reduce((a: number, b: number) => a + b, 0) / ys.length;
      points.push({
        timestamp: t,
        x: cx,
        y: cy,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        confidence: 0.9,
      });
    }
  }

  return points;
}

/**
 * Get the face position at a specific timestamp (interpolates between tracked points).
 */
export function getFaceAt(points: FaceTrackPoint[], timestamp: number): FaceTrackPoint | null {
  if (points.length === 0) return null;
  if (timestamp <= points[0].timestamp) return points[0];
  if (timestamp >= points[points.length - 1].timestamp) return points[points.length - 1];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (timestamp >= a.timestamp && timestamp <= b.timestamp) {
      const t = (timestamp - a.timestamp) / (b.timestamp - a.timestamp);
      return {
        timestamp,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        width: a.width + (b.width - a.width) * t,
        height: a.height + (b.height - a.height) * t,
        confidence: Math.min(a.confidence, b.confidence),
      };
    }
  }
  return null;
}
