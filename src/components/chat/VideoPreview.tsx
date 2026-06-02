// Video Preview Component
// Displays rendered EDL with playback controls + pause-to-annotate

import { useEffect, useRef, useState } from "react";
import type { MonetEDL, Shot } from "../../server/types/edl";
import type { TimelineAnnotation } from "../../server/types/annotation";
import { MonetRenderer } from "../../lib/renderer/monet-renderer";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { CompositionOverlay } from "./CompositionOverlay";

/** Find which shot is active at a given timeline position */
function getShotAtTime(
  shots: Shot[],
  time: number
): { shot: Shot; index: number } | null {
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
  /** Called when the user saves an annotation after pausing */
  onAnnotation?: (annotation: TimelineAnnotation) => void;
  /** Existing annotations to display as markers on the scrubber */
  annotations?: TimelineAnnotation[];
  /** Optional HyperFrames HTML overlay — synced transparent layer on top of canvas */
  compositionHtml?: string;
  /** Fired every frame during playback with current time in milliseconds */
  onTimeUpdate?: (timeMs: number) => void;
  /** Imperative seek: when this value changes, VideoPreview seeks to it (ms) */
  seekToMs?: number;
}

export function VideoPreview({ edl, mediaUrls, className, onAnnotation, annotations, compositionHtml, onTimeUpdate, seekToMs }: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MonetRenderer | null>(null);
  const animationRef = useRef<number | null>(null);
  /** True once the user has hit play at least once */
  const hasPlayedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Annotation overlay state
  const [showAnnotationOverlay, setShowAnnotationOverlay] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const annotationInputRef = useRef<HTMLInputElement>(null);

  // Initialize renderer
  useEffect(() => {
    let cancelled = false;

    const initRenderer = async () => {
      if (!canvasRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        const renderer = new MonetRenderer();
        await renderer.initialize(edl, canvasRef.current, mediaUrls);

        if (cancelled) {
          renderer.cleanup();
          return;
        }

        rendererRef.current = renderer;
        setDuration(renderer.getDuration());

        // Render first frame
        await renderer.renderFrame(0);
        if (cancelled) {
          return;
        }
        setIsLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error("Failed to initialize renderer:", err);
        setError(err instanceof Error ? err.message : "Failed to load preview");
        setIsLoading(false);
      }
    };

    initRenderer();

    return () => {
      cancelled = true;
      if (rendererRef.current) {
        rendererRef.current.cleanup();
        rendererRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [edl, mediaUrls]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !rendererRef.current) return;

    let startTime = performance.now();
    let lastTime = currentTime;

    const animate = async (timestamp: number) => {
      if (!rendererRef.current || !isPlaying) return;

      const elapsed = (timestamp - startTime) / 1000;
      const newTime = lastTime + elapsed;

      if (newTime >= duration) {
        // End of video
        setIsPlaying(false);
        setCurrentTime(duration);
        return;
      }

      setCurrentTime(newTime);
      await rendererRef.current.renderFrame(newTime);
      onTimeUpdate?.(Math.round(newTime * 1000));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, currentTime, duration]);

  // Seek to specific time
  const handleSeek = async (time: number) => {
    setCurrentTime(time);
    if (rendererRef.current) {
      await rendererRef.current.renderFrame(time);
      onTimeUpdate?.(Math.round(time * 1000));
    }
  };

  // Imperative seekToMs: when the prop changes, seek there.
  // Using a ref to avoid re-running the renderer init effect.
  const prevSeekToMsRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (seekToMs !== undefined && seekToMs !== prevSeekToMsRef.current) {
      prevSeekToMsRef.current = seekToMs;
      handleSeek(seekToMs / 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekToMs]);

  // Submit the current annotation
  const handleAnnotationSubmit = () => {
    const text = annotationText.trim();
    setShowAnnotationOverlay(false);
    setAnnotationText("");
    if (!text || !onAnnotation) return;
    const found = getShotAtTime(edl.shots, currentTime);
    onAnnotation({
      id: crypto.randomUUID(),
      timestamp: currentTime,
      shotId: found?.shot.id ?? "",
      shotIndex: found?.index ?? 0,
      text,
      createdAt: Date.now(),
    });
  };

  // Toggle play/pause — show annotation overlay when user pauses after playing
  const togglePlay = () => {
    if (!isPlaying) {
      // Starting playback
      hasPlayedRef.current = true;
      setShowAnnotationOverlay(false);
    } else {
      // Pausing — show overlay if user has played before
      if (hasPlayedRef.current && onAnnotation) {
        setAnnotationText("");
        setShowAnnotationOverlay(true);
        // Focus input on next paint
        setTimeout(() => annotationInputRef.current?.focus(), 50);
      }
    }
    setIsPlaying((p) => !p);
  };

  // Skip forward/backward
  const skipForward = () => {
    const newTime = Math.min(currentTime + 5, duration);
    handleSeek(newTime);
  };

  const skipBackward = () => {
    const newTime = Math.max(currentTime - 5, 0);
    handleSeek(newTime);
  };

  // Format time as MM:SS
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

        <canvas
          ref={canvasRef}
          className="w-full h-auto"
          style={{ maxHeight: "60vh" }}
        />

        {/* HyperFrames visual treatment overlay */}
        {compositionHtml && (
          <CompositionOverlay
            html={compositionHtml}
            currentTime={currentTime}
            visible={!isLoading}
          />
        )}

        {/* Annotation overlay — appears when user pauses after having played */}
        {showAnnotationOverlay && !isLoading && (
          <div className="absolute bottom-[72px] left-4 right-4 z-20">
            <div className="bg-black/90 backdrop-blur-sm rounded-lg border border-white/20 p-3 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50 font-mono">
                  {formatTime(currentTime)}
                  {(() => {
                    const found = getShotAtTime(edl.shots, currentTime);
                    return found
                      ? ` · Shot ${found.index + 1}/${edl.shots.length}`
                      : "";
                  })()}
                </span>
                <button
                  onClick={() => setShowAnnotationOverlay(false)}
                  className="text-white/40 hover:text-white transition-colors"
                >
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

        {/* Playback Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress bar + annotation markers */}
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
              value={[currentTime]}
              min={0}
              max={duration}
              step={0.1}
              onValueChange={([value]) => handleSeek(value)}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={skipBackward}
                className="text-white hover:bg-white/20"
              >
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={togglePlay}
                className="text-white hover:bg-white/20"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={skipForward}
                className="text-white hover:bg-white/20"
              >
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
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EDL Info */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Resolution</div>
          <div className="font-medium">
            {edl.timeline.resolution.width}×{edl.timeline.resolution.height}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">FPS</div>
          <div className="font-medium">{edl.timeline.fps}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Shots</div>
          <div className="font-medium">{edl.shots.length}</div>
        </div>
      </div>
    </div>
  );
}
