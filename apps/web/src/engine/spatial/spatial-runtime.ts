import type {
  ActionResult,
  DepthManifest,
  SpatialFrameRef,
  SubjectMaskManifest,
} from "@monet/edl";

export interface LoadedSpatialFrame {
  time: number;
  frame: number;
  image: HTMLImageElement;
  width: number;
  height: number;
}

export interface LoadedMaskTrack {
  manifest: SubjectMaskManifest;
  frames: LoadedSpatialFrame[];
}

export interface LoadedDepthTrack {
  manifest: DepthManifest;
  frames: LoadedSpatialFrame[];
}

async function loadImage(path: string): Promise<ActionResult<HTMLImageElement>> {
  try {
    if (!path || path.trim().length === 0) {
      return {
        success: false,
        error: { code: "IMAGE_PATH_REQUIRED", message: "Image path is required" },
      };
    }

    const image = new Image();
    image.crossOrigin = "anonymous";

    const loaded = new Promise<ActionResult<HTMLImageElement>>((resolve) => {
      image.onload = () => resolve({ success: true, data: image });
      image.onerror = () =>
        resolve({
          success: false,
          error: {
            code: "IMAGE_LOAD_FAILED",
            message: `Failed to load spatial image: ${path}`,
          },
        });
    });

    image.src = path;
    return await loaded;
  } catch (error) {
    console.error("[spatial-runtime] loadImage failed", { error, path });

    return {
      success: false,
      error: {
        code: "IMAGE_LOAD_THROW",
        message: "Failed to load image",
      },
    };
  }
}

async function loadFrames(frames: SpatialFrameRef[]): Promise<ActionResult<LoadedSpatialFrame[]>> {
  try {
    const loadedFrames: LoadedSpatialFrame[] = [];

    for (const frame of frames) {
      const imageResult = await loadImage(frame.path);

      if (!imageResult.success || !imageResult.data) {
        return {
          success: false,
          error: imageResult.error ?? {
            code: "SPATIAL_FRAME_LOAD_FAILED",
            message: `Failed to load spatial frame ${frame.frame}`,
          },
        };
      }

      loadedFrames.push({
        time: frame.time,
        frame: frame.frame,
        image: imageResult.data,
        width: frame.width,
        height: frame.height,
      });
    }

    loadedFrames.sort((a, b) => a.time - b.time);

    return {
      success: true,
      data: loadedFrames,
    };
  } catch (error) {
    console.error("[spatial-runtime] loadFrames failed", { error });

    return {
      success: false,
      error: {
        code: "SPATIAL_FRAMES_LOAD_FAILED",
        message: "Failed to load spatial frames",
      },
    };
  }
}

export async function loadMaskTrack(
  manifest: SubjectMaskManifest
): Promise<ActionResult<LoadedMaskTrack>> {
  const frames = await loadFrames(manifest.frames);

  if (!frames.success || !frames.data) {
    return {
      success: false,
      error: frames.error,
    };
  }

  return {
    success: true,
    data: {
      manifest,
      frames: frames.data,
    },
  };
}

export async function loadDepthTrack(
  manifest: DepthManifest
): Promise<ActionResult<LoadedDepthTrack>> {
  const frames = await loadFrames(manifest.frames);

  if (!frames.success || !frames.data) {
    return {
      success: false,
      error: frames.error,
    };
  }

  return {
    success: true,
    data: {
      manifest,
      frames: frames.data,
    },
  };
}

export function resolveSpatialFrame(
  frames: LoadedSpatialFrame[],
  localTime: number
): LoadedSpatialFrame | null {
  if (frames.length === 0) {
    return null;
  }

  let closest = frames[0];

  if (!closest) {
    return null;
  }

  let closestDistance = Math.abs(closest.time - localTime);

  for (let index = 1; index < frames.length; index += 1) {
    const frame = frames[index];

    if (!frame) {
      return null;
    }

    const distance = Math.abs(frame.time - localTime);

    if (distance < closestDistance) {
      closest = frame;
      closestDistance = distance;
    }
  }

  return closest;
}
