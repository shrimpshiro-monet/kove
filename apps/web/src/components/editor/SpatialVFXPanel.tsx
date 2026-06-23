import React, { useMemo, useState } from "react";
import { runSpatialAnalysisAndAttach } from "../../stores/monet-spatial-adapter";
import { useProjectStore } from "../../stores/project-store";

interface SpatialVFXPanelProps {
  selectedClipId: string | null;
  apiBaseUrl?: string;
}

interface ClipSelection {
  clipId: string;
  mediaId: string;
  filePath: string;
}

interface StatusState {
  kind: "idle" | "working" | "success" | "error";
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findSelectedClip(project: unknown, selectedClipId: string | null): ClipSelection | null {
  if (!selectedClipId || !isRecord(project)) return null;

  const timeline = project.timeline;
  const mediaLibrary = project.mediaLibrary;

  if (!isRecord(timeline) || !Array.isArray(timeline.tracks)) return null;
  if (!isRecord(mediaLibrary) || !Array.isArray(mediaLibrary.items)) return null;

  const mediaPathById = new Map<string, string>();

  for (const item of mediaLibrary.items) {
    if (!isRecord(item)) continue;

    const id = item.id;
    const src = item.src;

    if (typeof id === "string" && typeof src === "string") {
      mediaPathById.set(id, src);
    }
  }

  for (const track of timeline.tracks) {
    if (!isRecord(track) || !Array.isArray(track.clips)) continue;

    for (const clip of track.clips) {
      if (!isRecord(clip)) continue;

      if (clip.id !== selectedClipId) continue;

      const mediaId = clip.mediaId;

      if (typeof mediaId !== "string") return null;

      const filePath = mediaPathById.get(mediaId);

      if (!filePath) return null;

      return {
        clipId: selectedClipId,
        mediaId,
        filePath,
      };
    }
  }

  return null;
}

export function SpatialVFXPanel({
  selectedClipId,
  apiBaseUrl = "http://127.0.0.1:3000",
}: SpatialVFXPanelProps): React.ReactNode {
  const project = useProjectStore((state: any) => state.project);
  const getStore = useProjectStore.getState;
  const setStore = useProjectStore.setState;

  const selection = useMemo(
    () => findSelectedClip(project, selectedClipId),
    [project, selectedClipId]
  );

  const [includeMask, setIncludeMask] = useState(true);
  const [includeDepth, setIncludeDepth] = useState(true);
  const [includePointTracking, setIncludePointTracking] = useState(false);
  const [commercialTrackingVerified, setCommercialTrackingVerified] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    kind: "idle",
    message: "Select a clip to generate spatial VFX data.",
  });

  async function handleAnalyze(): Promise<void> {
    if (!selection) {
      setStatus({
        kind: "error",
        message: "No selected clip with media source found.",
      });
      return;
    }

    setStatus({
      kind: "working",
      message: "Running spatial analysis...",
    });

    const result = await runSpatialAnalysisAndAttach(
      {
        apiBaseUrl,
        filePath: selection.filePath,
        clipId: selection.clipId,
        mediaId: selection.mediaId,
        includeMask,
        includeDepth,
        includePointTracking,
        commercialTrackingVerified,
      },
      getStore,
      setStore
    );

    if (!result.success) {
      setStatus({
        kind: "error",
        message: result.error?.message ?? "Spatial analysis failed",
      });
      return;
    }

    setStatus({
      kind: "success",
      message: `Attached spatial data: ${(result.data?.attached ?? []).join(", ")}`,
    });
  }

  return (
    <aside className="flex w-full max-w-md flex-col gap-4 rounded border bg-background p-4 mt-2">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Spatial VFX</h2>
        <p className="text-xs text-muted-foreground">
          Generate SAM masks, Depth Anything maps, and optional point tracks for the selected clip.
        </p>
      </header>

      {selection ? (
        <div className="rounded border p-2 text-xs">
          <div>
            Clip: <span className="font-mono">{selection.clipId}</span>
          </div>
          <div>
            Media: <span className="font-mono">{selection.mediaId}</span>
          </div>
        </div>
      ) : (
        <div className="rounded border p-2 text-xs text-muted-foreground">
          No clip selected.
        </div>
      )}

      <label className="flex items-center justify-between text-xs">
        <span>SAM subject mask</span>
        <input
          type="checkbox"
          checked={includeMask}
          onChange={(event) => setIncludeMask(event.currentTarget.checked)}
        />
      </label>

      <label className="flex items-center justify-between text-xs">
        <span>Depth Anything map</span>
        <input
          type="checkbox"
          checked={includeDepth}
          onChange={(event) => setIncludeDepth(event.currentTarget.checked)}
        />
      </label>

      <label className="flex items-center justify-between text-xs">
        <span>Point tracking</span>
        <input
          type="checkbox"
          checked={includePointTracking}
          onChange={(event) => setIncludePointTracking(event.currentTarget.checked)}
        />
      </label>

      {includePointTracking ? (
        <label className="flex items-center justify-between text-xs">
          <span>Commercial tracking license verified</span>
          <input
            type="checkbox"
            checked={commercialTrackingVerified}
            onChange={(event) => setCommercialTrackingVerified(event.currentTarget.checked)}
          />
        </label>
      ) : null}

      <button
        className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground"
        type="button"
        disabled={!selection || status.kind === "working"}
        onClick={handleAnalyze}
      >
        Generate Spatial Data
      </button>

      <div
        className={[
          "rounded border px-3 py-2 text-xs",
          status.kind === "error" ? "border-destructive text-destructive" : "",
          status.kind === "success" ? "border-emerald-500 text-emerald-600" : "",
        ].join(" ")}
      >
        {status.message}
      </div>
    </aside>
  );
}
