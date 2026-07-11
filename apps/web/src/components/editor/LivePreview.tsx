import React, { useEffect, useRef, useState, useCallback } from "react";
import { createWebPlayer, type PlayerControls } from "../../engine/web-player";
import { useEDL, useDuration } from "../../stores/project-store";

function edlHash(edl: any): string {
  if (!edl) return "";
  return `${edl.timeline?.tracks?.length ?? 0}|${edl.timeline?.duration ?? 0}|${edl.timeline?.tracks?.reduce(
    (acc: number, t: any) => acc + (t.clips?.length ?? 0), 0
  ) ?? 0}`;
}

export function LivePreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<PlayerControls | null>(null);
  const edl = useEDL();
  const duration = useDuration();

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeedState] = useState(1);

  const hash = edlHash(edl);

  useEffect(() => {
    if (!canvasRef.current || !edl) return;
    try {
      playerRef.current = createWebPlayer(canvasRef.current, edl as any);
      const unsub = playerRef.current.onTimeUpdate((t) => setCurrentTime(t));
      return () => {
        unsub();
        playerRef.current?.dispose();
        playerRef.current = null;
      };
    } catch (e) {
      console.error("[LivePreview] init failed", e);
    }
  }, [hash]);

  const togglePlay = useCallback(async () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) {
      p.pause();
      setPlaying(false);
    } else {
      await p.play();
      setPlaying(true);
    }
  }, [playing]);

  const stop = useCallback(() => {
    playerRef.current?.stop();
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    playerRef.current?.seek(t);
    setCurrentTime(t);
  }, []);

  const changeSpeed = useCallback((s: number) => {
    playerRef.current?.setSpeed(s);
    setSpeedState(s);
  }, []);

  if (!edl) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded bg-muted/10 text-muted-foreground text-xs min-h-[120px] gap-1">
        <span className="font-semibold">Live Preview Offline</span>
        <span className="text-[10px] opacity-75">Generate or import an edit to start</span>
      </div>
    );
  }

  const aspectRatio = (edl as any).meta?.aspectRatio ?? "9:16";
  const isPortrait = aspectRatio === "9:16";
  const cw = isPortrait ? 1080 : 1920;
  const ch = isPortrait ? 1920 : 1080;

  const fmt = (t: number) =>
    `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

  return (
    <div className="flex flex-col gap-3 rounded border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between border-b pb-1">
        <span className="text-xs font-semibold">Live Preview Engine</span>
        <span
          className={`inline-flex h-2 w-2 rounded-full ${
            playing ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
          }`}
        />
      </div>

      <canvas
        ref={canvasRef}
        width={cw}
        height={ch}
        className="border rounded w-full max-h-[280px] bg-black mx-auto shadow-inner object-contain"
        style={{ aspectRatio: `${cw} / ${ch}` }}
      />

      <div className="flex gap-2 items-center">
        <button
          onClick={togglePlay}
          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:opacity-90 font-medium"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={stop}
          className="px-3 py-1.5 bg-muted text-foreground text-xs rounded hover:opacity-90 font-medium"
        >
          Stop
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step="0.01"
          value={currentTime}
          className="flex-grow accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
          onChange={seek}
        />
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums min-w-[80px] text-right">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <select
          value={speed}
          onChange={(e) => changeSpeed(Number(e.target.value))}
          className="text-[10px] bg-muted border rounded px-1 py-0.5"
        >
          {[0.25, 0.5, 1, 1.5, 2].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
