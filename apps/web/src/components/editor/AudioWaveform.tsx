import React, { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  duration: number;
  height?: number;
}

export function AudioWaveform({ src, duration, height = 48 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AC();
        const audioBuf = await ctx.decodeAudioData(buf);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const cctx = canvas.getContext("2d")!;
        const w = canvas.width = canvas.clientWidth * devicePixelRatio;
        const h = canvas.height = height * devicePixelRatio;
        cctx.clearRect(0, 0, w, h);

        const channel = audioBuf.getChannelData(0);
        const samplesPerPx = Math.max(1, Math.floor(channel.length / w));
        cctx.fillStyle = "rgba(16,185,129,0.7)";
        for (let x = 0; x < w; x++) {
          let min = 1, max = -1;
          const start = x * samplesPerPx;
          const end = Math.min(channel.length, start + samplesPerPx);
          for (let i = start; i < end; i++) {
            const v = channel[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          const y1 = ((1 + min) * h) / 2;
          const y2 = ((1 + max) * h) / 2;
          cctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
        }
        setLoaded(true);
        ctx.close();
      } catch (e) {
        console.error("[Waveform] decode failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [src, height]);

  return (
    <div className="w-full bg-muted/10 border rounded relative" style={{ height }}>
      <canvas ref={canvasRef} className="w-full h-full" />
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          decoding waveform…
        </span>
      )}
    </div>
  );
}
