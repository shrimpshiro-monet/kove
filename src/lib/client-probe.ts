/**
 * Client-side media probing using WebCodecs and standard browser APIs.
 * Extracts resolution, duration, FPS, aspect ratio, rotation, and codec info
 * to ensure consistent internal representation regardless of input format.
 */

export interface ClientProbeResult {
  duration: number;
  width: number;
  height: number;
  fps: number;
  mimeType: string;
  aspectRatio: number;
  isVertical: boolean;
  rotation: number;
  codec: string;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function detectRotation(video: HTMLVideoElement): number {
  // Check for stored rotation hint from media-loader orientation probe
  const explicit = (video as any).__monetRotation;
  if (typeof explicit === "number") return explicit;

  // Check if the browser exposes rotation via video transform
  const style = video.style.transform;
  if (style) {
    const match = style.match(/rotate\((\d+)deg\)/);
    if (match) return parseInt(match[1], 10);
  }

  // Detect upside-down from media-loader probe
  if ((video as any).__monetUpsideDown) return 180;

  return 0;
}

function inferCodec(mimeType: string, fileName: string): string {
  const mt = mimeType.toLowerCase();
  if (mt.includes("mp4") || mt.includes("avc")) return "h264";
  if (mt.includes("webm") && mt.includes("vp9")) return "vp9";
  if (mt.includes("webm") && mt.includes("vp09")) return "vp9";
  if (mt.includes("webm")) return "vp8";
  if (mt.includes("quicktime") || mt.includes("mov")) return "h264";
  if (mt.includes("matroska") || mt.includes("mkv")) return "h264";
  if (mt.includes("ogg")) return "theora";

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp4" || ext === "m4v") return "h264";
  if (ext === "webm") return "vp8";
  if (ext === "mov") return "h264";
  if (ext === "mkv") return "h264";

  return "h264";
}

/**
 * Attempt to detect FPS by sampling video frames over a short interval.
 * Falls back to common broadcast values if the browser doesn't expose enough data.
 */
async function detectFps(file: File): Promise<number> {
  // Try WebCodecs VideoDecoder approach first (most accurate)
  if (typeof VideoDecoder !== "undefined" && typeof VideoFrame !== "undefined") {
    try {
      return await detectFpsViaWebCodecs(file);
    } catch {
      // Fall through to heuristic detection
    }
  }

  // Heuristic: sample frames via video element + requestVideoFrameCallback
  try {
    return await detectFpsViaSampling(file);
  } catch {
    // Fall through to common defaults
  }

  return 30;
}

async function detectFpsViaWebCodecs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebCodecs FPS detection timeout")), 5000);
    const url = URL.createObjectURL(file);

    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    let frameCount = 0;
    let startTime = 0;

    video.onloadeddata = () => {
      startTime = performance.now();
      video.play().catch(() => {});
    };

    // Use requestVideoFrameCallback if available (Chromium)
    const onFrame = (_now: number, metadata: any) => {
      frameCount++;
      const elapsed = (performance.now() - startTime) / 1000;

      if (frameCount >= 30 || elapsed >= 1.0) {
        const fps = frameCount / elapsed;
        clearTimeout(timeout);
        video.pause();
        URL.revokeObjectURL(url);

        // Snap to common broadcast values
        resolve(snapToFps(fps));
      } else {
        video.requestVideoFrameCallback?.(onFrame);
      }
    };

    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(onFrame);
    } else {
      // No requestVideoFrameCallback — use time-based estimate
      video.ontimeupdate = () => {
        frameCount++;
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed >= 1.0) {
          const fps = frameCount / elapsed;
          clearTimeout(timeout);
          video.pause();
          URL.revokeObjectURL(url);
          video.ontimeupdate = null;
          resolve(snapToFps(fps));
        }
      };
    }

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error("Video load failed for FPS detection"));
    };

    video.src = url;
  });
}

async function detectFpsViaSampling(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("FPS sampling timeout")), 5000);
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    let lastTime = 0;
    let deltas: number[] = [];

    const onTimeUpdate = () => {
      const now = performance.now();
      if (lastTime > 0 && deltas.length < 60) {
        deltas.push(now - lastTime);
      }
      lastTime = now;

      if (deltas.length >= 30) {
        clearTimeout(timeout);
        video.pause();
        video.removeEventListener("timeupdate", onTimeUpdate);
        URL.revokeObjectURL(url);

        // Median delta → FPS
        deltas.sort((a, b) => a - b);
        const medianDelta = deltas[Math.floor(deltas.length / 2)];
        const fps = 1000 / medianDelta;
        resolve(snapToFps(fps));
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error("Video load failed for FPS sampling"));
    };

    video.src = url;
    video.play().catch(() => {});
  });
}

/**
 * Snap a measured FPS value to the nearest common broadcast标准.
 * This prevents 29.97 becoming 30.0001 or 23.976 becoming 24.0001.
 */
function snapToFps(measured: number): number {
  const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
  let best = 30;
  let bestDist = Infinity;
  for (const fps of common) {
    const dist = Math.abs(measured - fps);
    if (dist < bestDist) {
      bestDist = dist;
      best = fps;
    }
  }
  // Only snap if reasonably close (within 15%)
  return bestDist / measured < 0.15 ? best : Math.round(measured);
}

/**
 * Probes a video file using HTMLVideoElement and Web APIs.
 * Returns comprehensive metadata for input normalization.
 */
export async function probeVideoClientSide(file: File): Promise<ClientProbeResult> {
  // Detect FPS in parallel with metadata probe
  const fpsPromise = detectFps(file);

  const metadata = await new Promise<ClientProbeResult>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      try {
        const fps = await fpsPromise;
        const rotation = detectRotation(video);

        // After rotation, swap dimensions if needed
        let width = video.videoWidth;
        let height = video.videoHeight;
        if (rotation === 90 || rotation === 270) {
          [width, height] = [height, width];
        }

        const aspectRatio = width > 0 && height > 0 ? width / height : 16 / 9;
        const isVertical = height > width;
        const codec = inferCodec(file.type, file.name);

        cleanup();

        if (isNaN(video.duration) || !width || !height) {
          reject(new Error("Invalid video metadata detected."));
        } else {
          resolve({
            duration: video.duration,
            width,
            height,
            fps: fps || 30,
            mimeType: file.type,
            aspectRatio,
            isVertical,
            rotation,
            codec,
          });
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video metadata."));
    };

    video.src = url;
  });

  return metadata;
}
