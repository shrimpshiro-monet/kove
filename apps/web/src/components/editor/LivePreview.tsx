// apps/web/src/components/editor/LivePreview.tsx

import React, { useEffect, useRef, useState } from "react";
import { createWebPlayer } from "../../engine/web-player";
import { useProjectStore } from "../../stores/project-store";

export function LivePreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<ReturnType<typeof createWebPlayer> | null>(null);

  const project = useProjectStore((s: any) => s.project);
  const [playing, setPlaying] = useState(false);

  // Safely extract EDL
  const edl = project?.settings?.monet?.edl;

  useEffect(() => {
    if (!canvasRef.current || !edl) return;

    try {
      playerRef.current = createWebPlayer(canvasRef.current, edl);
    } catch (e) {
      console.error("player init failed", e);
    }

    return () => {
      playerRef.current?.dispose();
    };
  }, [edl]);

  function togglePlay() {
    const player = playerRef.current;
    if (!player) return;

    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    playerRef.current?.seek(t);
  }

  if (!edl) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded bg-muted/10 text-muted-foreground text-xs min-h-[120px] gap-1">
        <span className="font-semibold">Live Preview Offline</span>
        <span className="text-[10px] opacity-75">Generate or import a heavy edit to start live playback</span>
      </div>
    );
  }

  const duration = project?.timeline?.duration || 0;

  return (
    <div className="flex flex-col gap-3 rounded border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between border-b pb-1">
        <span className="text-xs font-semibold">Live Preview Engine</span>
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      <canvas
        ref={canvasRef}
        width={1080}
        height={1920}
        className="border rounded w-full max-h-[280px] aspect-[9/16] bg-black mx-auto shadow-inner object-contain"
      />

      <div className="flex gap-2 items-center">
        <button
          onClick={togglePlay}
          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:opacity-90 font-medium transition-colors"
        >
          {playing ? "Pause" : "Play"}
        </button>

        <input
          type="range"
          min="0"
          max={duration}
          step="0.01"
          className="flex-grow accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
          onChange={seek}
        />
      </div>
    </div>
  );
}
