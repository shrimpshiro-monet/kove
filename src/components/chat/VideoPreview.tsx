// Video Preview Component - Fixed playback controls
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { MonetEDL, Shot } from "../../server/types/edl";
import type { TimelineAnnotation } from "../../server/types/annotation";
import { MonetRenderer } from "../../lib/renderer/monet-renderer";
import { hashEdl } from "../../lib/renderer/edl-hash";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { CompositionOverlay } from "./CompositionOverlay";

function getShotAtTime(shots: Shot[], time: number): { shot: Shot; index: number } | null {
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (time >= s.timing.startTime && time < s.timing.startTime + s.timing.duration) {
      return { shot: s, index: i };
    }
  }
  return null;
}

interface VideoPreviewProps {
  edl: MonetEDL;
  mediaUrls?: Map<string, string>;
  className?: string;
  onAnnotation?: (annotation: TimelineAnnotation) => void;
  annotations?: TimelineAnnotation[];
  compositionHtml?: string;
  onTimeUpdate?: (timeMs: number) => void;
  seekToMs?: number;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

export function VideoPreview({
  edl, mediaUrls, className, onAnnotation, annotations,
  compositionHtml, onTimeUpdate, seekToMs, playing: externalPlaying,
  onPlayingChange,
}: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MonetRenderer | null>(null);
  const animationRef = useRef<number | null>(null);
  const hasPlayedRef = useRef(false);

  // Use REF for time during animation (avoids React state lag fighting the scrubber)
  const timeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isScrubbingRef = useRef(false);

  const [isPlaying, _setIsPlaying] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAnnotationOverlay, setShowAnnotationOverlay] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const annotationInputRef = useRef<HTMLInputElement>(null);

  // Unified setter that keeps ref + state in sync
  const setIsPlaying = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    _setIsPlaying((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      isPlayingRef.current = next;
      onPlayingChange?.(next);
      return next;
    });
  }, [onPlayingChange]);

  const edlHash = useMemo(() => hashEdl(edl as any), [edl]);

  // Initialize renderer
  useEffect(() => {
    let disposed = false;
    const initRenderer = async () => {
      if (!canvasRef.current) return;
      setIsLoading(true);
      setError(null);
      try {
        const renderer = new MonetRenderer();
        await renderer.initialize(edl, canvasRef.current, mediaUrls);
        if (disposed) { renderer.cleanup(); return; }
        rendererRef.current = renderer;
        setDuration(renderer.getDuration());
        await renderer.renderFrame(timeRef.current);
        if (!disposed) setIsLoading(false);
      } catch (err) {
        if (!disposed) {
          console.error("Failed to initialize renderer:", err);
          setError(err instanceof Error ? err.message : "Failed to load preview");
          setIsLoading(false);
        }
      }
    };
    initRenderer();
    return () => {
      disposed = true;
      rendererRef.current?.cleanup();
      rendererRef.current = null;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [edlHash, mediaUrls]);

  // Playback loop — uses refs, not state
  useEffect(() => {
    if (!isPlaying || !rendererRef.current || duration <= 0) return;

    let lastTimestamp: number | null = null;

    const animate = (timestamp: number) => {
      if (!isPlayingRef.current || !rendererRef.current || isScrubbingRef.current) return;

      if (lastTimestamp === null) lastTimestamp = timestamp;
      const deltaTime = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      const newTime = timeRef.current + deltaTime;

      if (newTime >= duration) {
        timeRef.current = duration;
        setDisplayTime(duration);
        setIsPlaying(false);
        rendererRef.current.renderFrame(duration).catch(() => {});
        onTimeUpdate?.(Math.round(duration * 1000));
        return;
      }

      timeRef.current = newTime;
      setDisplayTime(newTime); // Update UI
      rendererRef.current.renderFrame(newTime).catch(() => {});
      onTimeUpdate?.(Math.round(newTime * 1000));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, duration, onTimeUpdate, setIsPlaying]);

  // Seek handler
  const handleSeek = useCallback(async (time: number) => {
    const clamped = Math.max(0, Math.min(time, duration));
    timeRef.current = clamped;
    setDisplayTime(clamped);
    if (rendererRef.current) {
      try {
        await rendererRef.current.renderFrame(clamped);
        onTimeUpdate?.(Math.round(clamped * 1000));
      } catch (e) {
        console.error("Seek render failed", e);
      }
    }
  }, [duration, onTimeUpdate]);

  // Scrub start/end — pauses animation during drag
  const handleScrubStart = useCallback(() => {
    isScrubbingRef.current = true;
  }, []);

  const handleScrubEnd = useCallback(() => {
    isScrubbingRef.current = false;
  }, []);

  // External seekToMs prop
  const prevSeekRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (seekToMs !== undefined && seekToMs !== prevSeekRef.current) {
      prevSeekRef.current = seekToMs;
      handleSeek(seekToMs / 1000);
    }
  }, [seekToMs, handleSeek]);

  // External playing prop: respond to externalPlaying changes after mount without feedback loops
  useEffect(() => {
    if (externalPlaying !== undefined && externalPlaying !== isPlayingRef.current) {
      _setIsPlaying(externalPlaying);
      isPlayingRef.current = externalPlaying;
    }
  }, [externalPlaying]);

  const handleAnnotationSubmit = () => {
    const text = annotationText.trim();
    setShowAnnotationOverlay(false);
    setAnnotationText("");
    if (!text || !onAnnotation) return;
    const found = getShotAtTime(edl.shots, displayTime);
    onAnnotation({
      id: crypto.randomUUID(),
      timestamp: displayTime,
      shotId: found?.shot.id ?? "",
      shotIndex: found?.index ?? 0,
      text,
      createdAt: Date.now(),
    });
  };

  const togglePlay = () => {
    if (!isPlaying) {
      hasPlayedRef.current = true;
      setShowAnnotationOverlay(false);
      // If at end, restart from beginning
      if (timeRef.current >= duration) {
        timeRef.current = 0;
        setDisplayTime(0);
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      if (hasPlayedRef.current && onAnnotation) {
        setAnnotationText("");
        setShowAnnotationOverlay(true);
        setTimeout(() => annotationInputRef.current?.focus(), 50);
      }
    }
  };

  const skipForward = () => handleSeek(Math.min(displayTime + 5, duration));
  const skipBackward = () => handleSeek(Math.max(displayTime - 5, 0));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className={className}>
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          <p className="font-medium">Failed to load preview</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative bg-black rounded-lg overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <div className="text-white">Loading preview...</div>
          </div>
        )}

        <canvas ref={canvasRef} className="w-full h-auto" style={{ maxHeight: "60vh" }} />

        {compositionHtml && (
          <CompositionOverlay html={compositionHtml} currentTime={displayTime} visible={!isLoading} />
        )}

        {showAnnotationOverlay && !isLoading && (
          <div className="absolute bottom-[72px] left-4 right-4 z-20">
            <div className="bg-black/90 backdrop-blur-sm rounded-lg border border-white/20 p-3 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50 font-mono">
                  {formatTime(displayTime)}
                  {(() => {
                    const found = getShotAtTime(edl.shots, displayTime);
                    return found ? ` · Shot ${found.index + 1}/${edl.shots.length}` : "";
                  })()}
                </span>
                <button onClick={() => setShowAnnotationOverlay(false)} className="text-white/40 hover:text-white transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  ref={annotationInputRef}
                  type="text"
                  value={annotationText}
                  onChange={(e) => setAnnotationText(e.target.value)}
                  placeholder="What do you want here?"
                  className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAnnotationSubmit();
                    if (e.key === "Escape") setShowAnnotationOverlay(false);
                  }}
                />
                <button
                  onClick={handleAnnotationSubmit}
                  disabled={!annotationText.trim()}
                  className="shrink-0 px-3 py-1.5 rounded bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="relative mb-3">
            {annotations && annotations.length > 0 && duration > 0 && (
              <div className="absolute -top-3 left-0 right-0 h-3 pointer-events-none">
                {annotations.map((a) => (
                  <div
                    key={a.id}
                    className="absolute w-2 h-2 rounded-full bg-amber-400 -translate-x-1/2 top-0.5 shadow-sm"
                    style={{ left: `${(a.timestamp / duration) * 100}%` }}
                    title={`${formatTime(a.timestamp)}: ${a.text}`}
                  />
                ))}
              </div>
            )}
            <Slider
              value={[displayTime]}
              min={0}
              max={duration || 1}
              step={0.1}
              onPointerDown={handleScrubStart}
              onPointerUp={handleScrubEnd}
              onValueChange={([value]) => handleSeek(value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={skipBackward} className="text-white hover:bg-white/20">
                <SkipBack className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={togglePlay} className="text-white hover:bg-white/20">
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={skipForward} className="text-white hover:bg-white/20">
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {annotations && annotations.length > 0 && (
                <span className="text-amber-400 text-xs font-medium">
                  {annotations.length} note{annotations.length !== 1 ? "s" : ""}
                </span>
              )}
              <div className="text-white text-sm">
                {formatTime(displayTime)} / {formatTime(duration)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Resolution</div>
          <div className="font-medium">
            {edl.timeline?.resolution?.width ?? 1920}×{edl.timeline?.resolution?.height ?? 1080}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">FPS</div>
          <div className="font-medium">{edl.timeline?.fps ?? 30}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Shots</div>
          <div className="font-medium">{edl.shots.length}</div>
        </div>
      </div>
    </div>
  );
}
