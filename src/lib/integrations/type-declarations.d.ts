declare module "gsap" {
  export const gsap: {
    parseEase: (ease: string) => (t: number) => number;
    to: any;
    from: any;
    fromTo: any;
    timeline: any;
  };
  export default gsap;
}

declare module "lottie-web" {
  const lottie: {
    loadAnimation: (options: any) => any;
    destroy: () => void;
  };
  export default lottie;
}

declare module "@mediapipe/tasks-vision" {
  export class FilesetResolver {
    static forVisionTasks(wasmPath: string): Promise<any>;
  }
  export class FaceLandmarker {
    static createFromOptions(vision: any, options: any): Promise<FaceLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResult;
  }
  export class ImageSegmenter {
    static createFromOptions(vision: any, options: any): Promise<ImageSegmenter>;
    segmentForVideo(video: HTMLVideoElement | HTMLCanvasElement, timestamp: number): ImageSegmenterResult;
  }
  export interface FaceLandmarkerResult {
    faceLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
  }
  export interface ImageSegmenterResult {
    categoryMask: {
      getAsUint8Array(): Uint8Array;
      close(): void;
    };
  }
}
