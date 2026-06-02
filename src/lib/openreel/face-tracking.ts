import type { MonetEDL, MotionTrack, TextOverlay } from "@/server/types/edl";

type FaceDetectionResult = {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type FaceDetectorLike = {
  detect: (input: HTMLVideoElement) => Promise<FaceDetectionResult[]>;
};

type FaceDetectorCtor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => FaceDetectorLike;

type WindowWithFaceDetector = Window & {
  FaceDetector?: FaceDetectorCtor;
};

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.max(0, time);
  });
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to load video for face tracking."));
    };

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
  });
}

function fallbackTrack(edl: MonetEDL, clipId: string): MotionTrack {
  const firstShot = edl.shots[0];
  const sourceStart = firstShot?.source.inPoint ?? 0;
  const duration = Math.max(2, Math.min(8, firstShot?.timing.duration ?? edl.timeline.duration));
  return {
    id: `face-track-${clipId}-${Date.now()}`,
    clipId,
    method: "face",
    keyframes: [
      { time: sourceStart, x: -0.06, y: -0.2, confidence: 0.45 },
      { time: sourceStart + duration * 0.5, x: 0.03, y: -0.17, confidence: 0.45 },
      { time: sourceStart + duration, x: 0.12, y: -0.14, confidence: 0.45 },
    ],
  };
}

export async function addAutoFaceTrack(
  edl: MonetEDL,
  mediaUrls?: Map<string, string>
): Promise<MonetEDL> {
  const firstShot = edl.shots[0];
  if (!firstShot) {
    return edl;
  }

  const clipId = firstShot.source.clipId;
  const url = mediaUrls?.get(clipId);
  if (!url) {
    const track = fallbackTrack(edl, clipId);
    return withOverlay(edl, track);
  }

  const detectorCtor = (window as WindowWithFaceDetector).FaceDetector;
  if (!detectorCtor) {
    const track = fallbackTrack(edl, clipId);
    return withOverlay(edl, track);
  }

  const video = document.createElement("video");
  if (isRemoteUrl(url)) {
    video.crossOrigin = "anonymous";
  }
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await waitForMetadata(video);

    const detector = new detectorCtor({
      fastMode: true,
      maxDetectedFaces: 1,
    });

    const maxTrackDuration = Math.min(firstShot.timing.duration, 8);
    const sampleStep = 0.5;
    const keyframes: MotionTrack["keyframes"] = [];

    for (let t = 0; t <= maxTrackDuration; t += sampleStep) {
      const sourceTime = firstShot.source.inPoint + t;
      await seek(video, sourceTime);
      const faces = await detector.detect(video);
      const face = faces[0];
      if (!face) continue;

      const centerX = face.boundingBox.x + face.boundingBox.width / 2;
      const centerY = face.boundingBox.y + face.boundingBox.height / 2;
      const normX = (centerX / Math.max(1, video.videoWidth) - 0.5) * 2;
      const normY = (centerY / Math.max(1, video.videoHeight) - 0.5) * 2;

      keyframes.push({
        time: sourceTime,
        x: normX,
        y: normY,
        confidence: 0.85,
      });
    }

    const track: MotionTrack =
      keyframes.length > 0
        ? {
            id: `face-track-${clipId}-${Date.now()}`,
            clipId,
            method: "face",
            keyframes,
          }
        : fallbackTrack(edl, clipId);

    return withOverlay(edl, track);
  } catch (error) {
    console.warn("Auto face tracking failed, using fallback track:", error);
    const track = fallbackTrack(edl, clipId);
    return withOverlay(edl, track);
  } finally {
    video.pause();
    video.src = "";
    video.load();
  }
}

function withOverlay(edl: MonetEDL, track: MotionTrack): MonetEDL {
  const firstShot = edl.shots[0];
  const overlayStart = firstShot?.timing.startTime ?? 0;
  const overlayDuration = Math.min(8, firstShot?.timing.duration ?? edl.timeline.duration);

  const overlay: TextOverlay = {
    id: `face-overlay-${Date.now()}`,
    text: "FACE LOCK",
    startTime: overlayStart,
    endTime: Math.min(edl.timeline.duration, overlayStart + overlayDuration),
    offset: { x: 0, y: -0.2 },
    style: {
      fontSize: 30,
      color: "#22d3ee",
      weight: "800",
      shadow: true,
    },
    tracking: {
      trackId: track.id,
      mode: "follow",
    },
  };

  return {
    ...edl,
    motionTracks: [...(edl.motionTracks ?? []), track],
    textOverlays: [...(edl.textOverlays ?? []), overlay],
  };
}