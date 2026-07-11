import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import type { MonetEDL } from "../server/types/edl";
import { MonetRenderer } from "../lib/renderer/monet-renderer";
import { drawSimplePreviewFallback } from "../lib/renderer/simple-preview-fallback";

export interface SimpleEditorPreviewProps {
  edl: MonetEDL;
  mediaUrls?: Map<string, string> | Record<string, string>;
  currentTime?: number;
  playing?: boolean;
  width?: number;
  height?: number;
  className?: string;
  onError?: (error: { code: string; message: string }) => void;
}

interface PreviewStatus {
  state: "idle" | "loading" | "ready" | "fallback" | "error";
  message?: string;
}

function mapFromMediaUrls(
  input: Map<string, string> | Record<string, string> | undefined
): Map<string, string> {
  if (!input) return new Map<string, string>();
  if (input instanceof Map) return new Map(input);

  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim().length > 0) {
      out.set(key, value);
    }
  }
  return out;
}

function getTimelineDuration(edl: MonetEDL | undefined): number {
  if (!edl || !edl.shots || !edl.timeline) return 0.1;
  const shotMax = edl.shots.reduce(
    (max, shot) => Math.max(max, shot.timing?.startTime + shot.timing?.duration || 0),
    0
  );

  return Math.max(edl.timeline.duration || 0, shotMax, 0.1);
}

function drawInitialStructure(
  canvas: HTMLCanvasElement,
  edl: MonetEDL | undefined,
  reason: string,
  currentTime: number
): void {
  if (!edl) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  drawSimplePreviewFallback(ctx, edl, {
    reason,
    currentTime,
    width: canvas.width,
    height: canvas.height,
  });
}

export const SimpleEditorPreview: React.FC<SimpleEditorPreviewProps> = ({
  edl,
  mediaUrls,
  currentTime = 0,
  playing = false,
  width,
  height,
  className,
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MonetRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const latestTimeRef = useRef(currentTime);
  const lastEdlHashRef = useRef<string>("");

  const [status, setStatus] = useState<PreviewStatus>({
    state: "idle",
  });

  const previewWidth = width ?? edl?.timeline?.resolution?.width ?? 1280;
  const previewHeight = height ?? edl?.timeline?.resolution?.height ?? 720;

  const stableMediaUrls = useMemo(() => {
    const mapped = mapFromMediaUrls(mediaUrls);

    if (!edl || !edl.shots) {
      return mapped;
    }

    /*
     * Critical fallback:
     * If caller did not provide mediaUrls, renderer will use /api/media/<clipId>.
     * If caller provided partial mediaUrls, fill missing clipIds with /api/media/<clipId>.
     */
    for (const shot of edl.shots) {
      const clipId = shot.source.clipId;
      if (!mapped.has(clipId)) {
        mapped.set(clipId, `/api/media/${encodeURIComponent(clipId)}`);
      }
    }

    return mapped;
  }, [mediaUrls, edl?.shots]);

  const stopLoop = useCallback((): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const renderAtTime = useCallback(
    async (time: number): Promise<void> => {
      const renderer = rendererRef.current;

      if (!edl) return;

      if (!renderer) {
        const canvas = canvasRef.current;
        if (canvas) {
          drawInitialStructure(
            canvas,
            edl,
            "Renderer not ready — showing edit structure",
            time
          );
        }
        return;
      }

      try {
        await renderer.renderFrame(time);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Preview render failed";

        console.error("[SimpleEditorPreview] renderFrame failed", {
          error,
          time,
          shotCount: edl.shots?.length ?? 0,
        });

        renderer.renderStructureFallback(message, time);

        setStatus({
          state: "fallback",
          message,
        });
      }
    },
    [edl]
  );

  useEffect(() => {
    latestTimeRef.current = currentTime;

    if (!playing) {
      void renderAtTime(currentTime);
    }
  }, [currentTime, playing, renderAtTime]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    // Skip re-initialization if EDL content hasn't changed
    const edlHash = edl ? `${edl.shots?.length ?? 0}-${edl.timeline?.duration ?? 0}-${JSON.stringify(edl.shots?.[0]?.source ?? {})}` : "";
    if (edlHash && edlHash === lastEdlHashRef.current) {
      return;
    }
    lastEdlHashRef.current = edlHash;

    const activeCanvas = canvas;
    mountedRef.current = true;

    activeCanvas.width = previewWidth;
    activeCanvas.height = previewHeight;

    drawInitialStructure(
      activeCanvas,
      edl,
      "Initializing preview — showing edit structure",
      latestTimeRef.current
    );

    let disposed = false;
    const renderer = new MonetRenderer();
    rendererRef.current = renderer;

    async function initialize(): Promise<void> {
      if (!edl) {
        return;
      }

      setStatus({
        state: "loading",
        message: "Loading preview media…",
      });

      try {
        await renderer.initialize(edl, activeCanvas, stableMediaUrls);

        if (disposed || !mountedRef.current) {
          renderer.cleanup();
          return;
        }

        setStatus({
          state: "ready",
        });

        await renderer.renderFrame(latestTimeRef.current);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Preview initialization failed";

        console.error("[SimpleEditorPreview] Renderer initialization failed", {
          error,
          shotCount: edl.shots?.length ?? 0,
          mediaUrlCount: stableMediaUrls.size,
        });

        if (!disposed && mountedRef.current) {
          drawInitialStructure(
            activeCanvas,
            edl,
            message,
            latestTimeRef.current
          );

          setStatus({
            state: "fallback",
            message,
          });

          onError?.({
            code: "PREVIEW_INIT_FAILED",
            message,
          });
        }
      }
    }

    void initialize();

    return () => {
      disposed = true;
      mountedRef.current = false;
      stopLoop();

      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }

      renderer.cleanup();
    };
  }, [
    edl,
    previewWidth,
    previewHeight,
    stableMediaUrls,
    onError,
    stopLoop,
  ]);

  useEffect(() => {
    stopLoop();

    if (!playing) {
      return;
    }

    const startWallTime = performance.now();
    const startTimelineTime = latestTimeRef.current;
    const duration = getTimelineDuration(edl);

    const tick = (): void => {
      if (!mountedRef.current) {
        return;
      }

      const elapsed = (performance.now() - startWallTime) / 1000;
      const nextTime = (startTimelineTime + elapsed) % duration;
      latestTimeRef.current = nextTime;

      void renderAtTime(nextTime);

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      stopLoop();
    };
  }, [playing, edl, renderAtTime, stopLoop]);

  return (
    <div className={className ?? "simple-editor-preview"}>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${previewWidth} / ${previewHeight}`,
          background: "#050505",
          overflow: "hidden",
          borderRadius: 12,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            background: "#050505",
          }}
        />

        {status.state !== "ready" && (
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              maxWidth: "calc(100% - 24px)",
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.58)",
              color: "rgba(255,255,255,0.86)",
              font: "500 12px system-ui, sans-serif",
              pointerEvents: "none",
            }}
          >
            {status.message ?? "Preview initializing…"}
          </div>
        )}
      </div>
    </div>
  );
};
