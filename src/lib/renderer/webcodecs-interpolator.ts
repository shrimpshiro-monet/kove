export class WebCodecsInterpolator {
  private decoder: VideoDecoder | null = null;
  private frameBuffer: VideoFrame[] = [];
  private maxBuffer = 10;

  async init(codec: string = "avc1.64001E") {
    if (typeof VideoDecoder === "undefined") {
      console.warn("[WebCodecsInterpolator] VideoDecoder not available");
      return;
    }

    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        this.frameBuffer.push(frame);
        if (this.frameBuffer.length > this.maxBuffer) {
          const old = this.frameBuffer.shift();
          old?.close();
        }
      },
      error: (e) => console.error("[WebCodecsInterpolator] Decoder error:", e),
    });

    this.decoder.configure({
      codec,
      codedWidth: 1920,
      codedHeight: 1080,
    });
  }

  blendFrames(
    ctx: CanvasRenderingContext2D,
    frameA: VideoFrame,
    frameB: VideoFrame,
    alpha: number,
    width: number,
    height: number
  ) {
    ctx.globalAlpha = 1 - alpha;
    ctx.drawImage(frameA, 0, 0, width, height);
    ctx.globalAlpha = alpha;
    ctx.drawImage(frameB, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  dispose() {
    this.decoder?.close();
    this.frameBuffer.forEach(f => f.close());
    this.frameBuffer = [];
  }
}
