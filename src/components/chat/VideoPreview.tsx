// Video Preview Component
// Displays rendered EDL with playback controls

import { useEffect, useRef, useState } from "react";
import type { MonetEDL } from "../../server/types/edl";
import { MonetRenderer } from "../../lib/renderer/monet-renderer";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface VideoPreviewProps {
  edl: MonetEDL;
  mediaUrls?: Map<string, string>; // Optional map of clipId -> local file URL
  className?: string;
}

export function VideoPreview({ edl, mediaUrls, className }: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MonetRenderer | null>(null);
  const animationRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize renderer
  useEffect(() => {
    const initRenderer = async () => {
      if (!canvasRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        const renderer = new MonetRenderer();
        await renderer.initialize(edl, canvasRef.current, mediaUrls);

        rendererRef.current = renderer;
        setDuration(renderer.getDuration());

        // Render first frame
        await renderer.renderFrame(0);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to initialize renderer:", err);
        setError(err instanceof Error ? err.message : "Failed to load preview");
        setIsLoading(false);
      }
    };

    initRenderer();

    return () => {
      if (rendererRef.current) {
        rendererRef.current.cleanup();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [edl]);

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
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
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

        {/* Playback Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <Slider
            value={[currentTime]}
            min={0}
            max={duration}
            step={0.1}
            onValueChange={([value]) => handleSeek(value)}
            className="mb-3"
          />

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

            <div className="text-white text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
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
