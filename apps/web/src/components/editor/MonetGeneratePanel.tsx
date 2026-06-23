import React, { useState } from "react";
import { generateHeavyEditAndImport } from "../../stores/monet-generate-adapter";
import { enqueueRender } from "../../stores/monet-render-adapter";
import { useProjectStore } from "../../stores/project-store";
import { RenderStatusPanel } from "./RenderStatusPanel";
import { LivePreview } from "./LivePreview";
import { TimelineEditor } from "./TimelineEditor";
import { ClipInspector } from "./ClipInspector";
import { SpatialVFXPanel } from "./SpatialVFXPanel";

type DirectorStyle =
  | "heavy-tiktok"
  | "cinematic"
  | "sports"
  | "anime"
  | "clean-captions"
  | "auto";

type AspectRatio = "16:9" | "9:16" | "1:1";

interface MonetGeneratePanelProps {
  apiBaseUrl?: string;
}

interface StatusState {
  kind: "idle" | "working" | "success" | "error";
  message: string;
}

function getEmbeddedEDLFromProject(project: unknown): unknown {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return null;
  }

  const settings = (project as { settings?: unknown }).settings;

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }

  const monet = (settings as { monet?: unknown }).monet;

  if (!monet || typeof monet !== "object" || Array.isArray(monet)) {
    return null;
  }

  return (monet as { edl?: unknown }).edl ?? null;
}

function isMonetEDL(value: unknown): value is import("@monet/edl").ProjectEDL {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { version?: unknown }).version === 1
  );
}

export function MonetGeneratePanel({
  apiBaseUrl = "http://127.0.0.1:3000",
}: MonetGeneratePanelProps): React.JSX.Element {
  const getStore = useProjectStore.getState;
  const setStore = useProjectStore.setState;
  const project = useProjectStore((state: any) => state.project);

  const [filePath, setFilePath] = useState("");
  const [mediaId, setMediaId] = useState("source-main");
  const [duration, setDuration] = useState(60);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [targetDuration, setTargetDuration] = useState(28);
  const [style, setStyle] = useState<DirectorStyle>("heavy-tiktok");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [includeSubjectTrack, setIncludeSubjectTrack] = useState(true);
  const [minClipDuration, setMinClipDuration] = useState(0.35);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>({
    kind: "idle",
    message: "Ready",
  });

  async function handleGenerate(): Promise<void> {
    setStatus({
      kind: "working",
      message: "Generating heavy edit...",
    });

    const result = await generateHeavyEditAndImport(
      {
        apiBaseUrl,
        projectId: `monet-${Date.now()}`,
        filePath,
        mediaId,
        duration,
        width,
        height,
        style,
        aspectRatio,
        targetDuration,
        includeTranscript,
        includeSubjectTrack,
        minClipDuration,
      },
      getStore,
      setStore
    );

    if (!result.success) {
      setStatus({
        kind: "error",
        message: result.error?.message ?? "Generation failed",
      });
      return;
    }

    setStatus({
      kind: "success",
      message: `Generated ${result.data?.importedProject.timeline.tracks.length ?? 0} tracks · minimum-duration fixes: ${
        result.data?.changedClipIds.length ?? 0
      }`,
    });
  }

  async function handleRenderPreview(): Promise<void> {
    const edl = getEmbeddedEDLFromProject(project);

    if (!isMonetEDL(edl)) {
      setStatus({
        kind: "error",
        message: "No embedded MonetEDL found. Generate or import an edit first.",
      });
      return;
    }

    setStatus({
      kind: "working",
      message: "Enqueuing preview render...",
    });

    const result = await enqueueRender({
      apiBaseUrl,
      edl,
      mode: "preview",
    });

    if (!result.success) {
      setStatus({
        kind: "error",
        message: result.error?.message ?? "Failed to enqueue render",
      });
      return;
    }

    if (result.data?.jobId) {
      setRenderJobId(result.data.jobId);
    }

    setStatus({
      kind: "success",
      message: `Preview render queued: ${result.data?.jobId}`,
    });
  }

  return (
    <aside className="flex w-full max-w-md flex-col gap-4 rounded border bg-background p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Monet Heavy Edit</h2>
        <p className="text-xs text-muted-foreground">
          Generate beat-cut, captioned, reframed edits from source media.
        </p>
      </header>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">File path</span>
        <input
          className="rounded border bg-background px-2 py-1"
          value={filePath}
          onChange={(event) => setFilePath(event.currentTarget.value)}
          placeholder="./video.mp4"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Media ID</span>
          <input
            className="rounded border bg-background px-2 py-1"
            value={mediaId}
            onChange={(event) => setMediaId(event.currentTarget.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Duration</span>
          <input
            className="rounded border bg-background px-2 py-1"
            type="number"
            min={1}
            step={0.1}
            value={duration}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value) && value > 0) setDuration(value);
            }}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Width</span>
          <input
            className="rounded border bg-background px-2 py-1"
            type="number"
            min={1}
            value={width}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value) && value > 0) setWidth(value);
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Height</span>
          <input
            className="rounded border bg-background px-2 py-1"
            type="number"
            min={1}
            value={height}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value) && value > 0) setHeight(value);
            }}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Style</span>
          <select
            className="rounded border bg-background px-2 py-1"
            value={style}
            onChange={(event) => setStyle(event.currentTarget.value as DirectorStyle)}
          >
            <option value="heavy-tiktok">Heavy TikTok</option>
            <option value="sports">Sports</option>
            <option value="anime">Anime</option>
            <option value="cinematic">Cinematic</option>
            <option value="clean-captions">Clean Captions</option>
            <option value="auto">Auto</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Aspect</span>
          <select
            className="rounded border bg-background px-2 py-1"
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.currentTarget.value as AspectRatio)}
          >
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Target duration</span>
          <input
            className="rounded border bg-background px-2 py-1"
            type="number"
            min={3}
            step={0.5}
            value={targetDuration}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value) && value >= 3) setTargetDuration(value);
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Min clip duration</span>
          <input
            className="rounded border bg-background px-2 py-1"
            type="number"
            min={0.1}
            max={3}
            step={0.05}
            value={minClipDuration}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value) && value >= 0.1 && value <= 3) {
                setMinClipDuration(value);
              }
            }}
          />
        </label>
      </div>

      <label className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Transcript captions</span>
        <input
          type="checkbox"
          checked={includeTranscript}
          onChange={(event) => setIncludeTranscript(event.currentTarget.checked)}
        />
      </label>

      <label className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Subject tracking crop</span>
        <input
          type="checkbox"
          checked={includeSubjectTrack}
          onChange={(event) => setIncludeSubjectTrack(event.currentTarget.checked)}
        />
      </label>

      <div className="flex gap-2">
        <button
          className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground"
          type="button"
          disabled={status.kind === "working"}
          onClick={handleGenerate}
        >
          Generate Edit
        </button>

        <button
          className="rounded border px-3 py-2 text-xs"
          type="button"
          disabled={status.kind === "working"}
          onClick={handleRenderPreview}
        >
          Render Preview
        </button>
      </div>

      <div
        className={[
          "rounded border px-3 py-2 text-xs",
          status.kind === "error" ? "border-destructive text-destructive" : "",
          status.kind === "success" ? "border-emerald-500 text-emerald-600" : "",
        ].join(" ")}
      >
        {status.message}
      </div>

      <LivePreview />

      <TimelineEditor
        selectedClipId={selectedClipId}
        onSelectClip={setSelectedClipId}
      />

      {selectedClipId && (
        <ClipInspector
          selectedClipId={selectedClipId}
          onClose={() => setSelectedClipId(null)}
        />
      )}

      <SpatialVFXPanel
        selectedClipId={selectedClipId}
        apiBaseUrl={apiBaseUrl}
      />

      <RenderStatusPanel
        jobId={renderJobId}
        apiBaseUrl={apiBaseUrl}
      />
    </aside>
  );
}
