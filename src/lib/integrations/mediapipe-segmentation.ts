// MediaPipe Selfie Segmentation — browser-side subject isolation fallback.
// Apache 2.0. Lazy-loaded. Runs at ~30fps. ~80% of SAM 2 quality but free forever.

let _segmenterPromise: Promise<any> | null = null;

async function loadSegmenter() {
  if (_segmenterPromise) return _segmenterPromise;

  _segmenterPromise = (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    );
    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
        delegate: "GPU",
      },
      outputCategoryMask: true,
      outputConfidenceMasks: false,
      runningMode: "VIDEO",
    });
    return segmenter;
  })();

  return _segmenterPromise;
}

/**
 * Segment subject from background in a single canvas frame.
 * Returns an alpha mask (0-255 per pixel, white = subject, black = background).
 */
export async function segmentSubject(
  sourceCanvas: HTMLCanvasElement,
): Promise<ImageData> {
  const segmenter = await loadSegmenter();
  const result = segmenter.segmentForVideo(sourceCanvas, performance.now());

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const mask = result.categoryMask;
  const maskData = mask.getAsUint8Array();

  const out = new ImageData(w, h);
  for (let i = 0; i < maskData.length; i++) {
    const isSubject = maskData[i] === 0 ? 255 : 0;
    out.data[i * 4] = 255;
    out.data[i * 4 + 1] = 255;
    out.data[i * 4 + 2] = 255;
    out.data[i * 4 + 3] = isSubject;
  }

  mask.close();
  return out;
}

/**
 * Composite a "subject pop" effect using MediaPipe browser segmentation.
 * Renders dimmed/blurred background + sharp subject directly to ctx.
 */
export async function browserSubjectPop(
  ctx: CanvasRenderingContext2D,
  sourceVideo: HTMLVideoElement,
  intensity: number,
  mode: "blur" | "dim",
  width: number,
  height: number,
): Promise<void> {
  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;
  const wCtx = work.getContext("2d")!;
  wCtx.drawImage(sourceVideo, 0, 0, width, height);

  const mask = await segmentSubject(work);

  if (mode === "blur") {
    ctx.filter = `blur(${10 * intensity}px) brightness(${1 - 0.3 * intensity})`;
    ctx.drawImage(sourceVideo, 0, 0, width, height);
    ctx.filter = "none";
  } else {
    ctx.drawImage(sourceVideo, 0, 0, width, height);
    ctx.fillStyle = `rgba(0,0,0,${0.55 * intensity})`;
    ctx.fillRect(0, 0, width, height);
  }

  const subjectCanvas = document.createElement("canvas");
  subjectCanvas.width = width;
  subjectCanvas.height = height;
  const sCtx = subjectCanvas.getContext("2d")!;
  sCtx.drawImage(sourceVideo, 0, 0, width, height);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  maskCanvas.getContext("2d")!.putImageData(mask, 0, 0);
  sCtx.globalCompositeOperation = "destination-in";
  sCtx.drawImage(maskCanvas, 0, 0);

  ctx.drawImage(subjectCanvas, 0, 0, width, height);
}
