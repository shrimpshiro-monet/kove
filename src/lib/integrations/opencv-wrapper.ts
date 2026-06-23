// OpenCV.js — lazy-loaded computer vision in browser
// Apache 2.0. ~8MB WASM, loaded only when first used.

let _cvPromise: Promise<any> | null = null;

function loadOpenCV(): Promise<any> {
  if (_cvPromise) return _cvPromise;

  _cvPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("OpenCV.js requires browser"));
      return;
    }

    const existingCv = (window as any).cv;
    if (existingCv?.Mat) {
      resolve(existingCv);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.10.0/opencv.js";
    script.async = true;

    script.onload = () => {
      const cv = (window as any).cv;
      if (cv?.onRuntimeInitialized) {
        cv.onRuntimeInitialized = () => resolve(cv);
      } else {
        resolve(cv);
      }
    };

    script.onerror = () => reject(new Error("Failed to load OpenCV.js"));
    document.head.appendChild(script);
  });

  return _cvPromise;
}

export async function detectFaces(
  canvas: HTMLCanvasElement,
): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const cv = await loadOpenCV();
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  try {
    const classifier = new cv.CascadeClassifier();
    const cascadeUrl = "https://docs.opencv.org/4.10.0/haarcascade_frontalface_default.xml";
    const resp = await fetch(cascadeUrl);
    const buf = await resp.arrayBuffer();
    cv.FS_createDataFile("/", "fc.xml", new Uint8Array(buf), true, false, false);
    classifier.load("fc.xml");

    const faces = new cv.RectVector();
    const msize = new cv.Size(30, 30);
    classifier.detectMultiScale(gray, faces, 1.1, 3, 0, msize, msize);

    const results: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let i = 0; i < faces.size(); i++) {
      const f = faces.get(i);
      results.push({ x: f.x, y: f.y, width: f.width, height: f.height });
    }

    faces.delete();
    classifier.delete();
    return results;
  } finally {
    src.delete();
    gray.delete();
  }
}

export async function detectEdges(
  canvas: HTMLCanvasElement,
  lowThreshold: number = 50,
  highThreshold: number = 150,
): Promise<ImageData> {
  const cv = await loadOpenCV();
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const edges = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Canny(gray, edges, lowThreshold, highThreshold);

    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    cv.imshow(out, edges);
    return out.getContext("2d")!.getImageData(0, 0, out.width, out.height);
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
  }
}

export async function computeOpticalFlow(
  prevCanvas: HTMLCanvasElement,
  currCanvas: HTMLCanvasElement,
): Promise<{ avgMotion: number; maxMotion: number }> {
  const cv = await loadOpenCV();
  const prev = cv.imread(prevCanvas);
  const curr = cv.imread(currCanvas);
  const prevGray = new cv.Mat();
  const currGray = new cv.Mat();
  const flow = new cv.Mat();

  try {
    cv.cvtColor(prev, prevGray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(curr, currGray, cv.COLOR_RGBA2GRAY);
    cv.calcOpticalFlowFarneback(
      prevGray, currGray, flow,
      0.5, 3, 15, 3, 5, 1.2, 0,
    );

    let total = 0;
    let max = 0;
    const data = flow.data32F;
    for (let i = 0; i < data.length; i += 2) {
      const mag = Math.sqrt(data[i] * data[i] + data[i + 1] * data[i + 1]);
      total += mag;
      if (mag > max) max = mag;
    }

    return {
      avgMotion: Math.min(1, total / (data.length / 2) / 10),
      maxMotion: Math.min(1, max / 30),
    };
  } finally {
    prev.delete();
    curr.delete();
    prevGray.delete();
    currGray.delete();
    flow.delete();
  }
}

export { loadOpenCV };
