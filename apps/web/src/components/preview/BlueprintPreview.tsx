import React, { useMemo } from "react";
import type { Project } from "@monet/openreel-adapter";

export interface BlueprintPreviewProps {
  project: Project;
  selectedClipId?: string | null;
  onSelectClip?: (clipId: string) => void;
}

interface BlueprintBlock {
  clipId: string;
  trackId: string;
  trackType: string;
  startTime: number;
  duration: number;
  label: string;
  effects: string[];
  colorClassName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getEffects(meta: Record<string, unknown> | undefined): string[] {
  if (!isRecord(meta)) return [];

  const rawEffects = meta.effects;

  if (!Array.isArray(rawEffects)) return [];

  const effects: string[] = [];

  for (const effect of rawEffects) {
    if (!isRecord(effect)) continue;

    if (typeof effect.type === "string") {
      effects.push(effect.type);
    }
  }

  return effects;
}

function getClipLabel(meta: Record<string, unknown> | undefined, mediaId: string): string {
  if (isRecord(meta) && typeof meta.text === "string" && meta.text.trim().length > 0) {
    return meta.text;
  }

  return mediaId;
}

function getTrackColorClassName(trackType: string): string {
  if (trackType === "video") return "bg-blue-500";
  if (trackType === "audio") return "bg-emerald-500";
  if (trackType === "text") return "bg-amber-500";

  return "bg-fuchsia-500";
}

function collectBlocks(project: Project): BlueprintBlock[] {
  const blocks: BlueprintBlock[] = [];

  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      blocks.push({
        clipId: clip.id,
        trackId: track.id,
        trackType: track.type,
        startTime: clip.startTime,
        duration: clip.duration,
        label: getClipLabel(clip.meta, clip.mediaId),
        effects: getEffects(clip.meta),
        colorClassName: getTrackColorClassName(track.type),
      });
    }
  }

  blocks.sort((a, b) => a.startTime - b.startTime || a.clipId.localeCompare(b.clipId));

  return blocks;
}

export function BlueprintPreview({
  project,
  selectedClipId,
  onSelectClip,
}: BlueprintPreviewProps): React.JSX.Element {
  const blocks = useMemo(() => collectBlocks(project), [project]);
  const duration = Math.max(0.001, project.timeline.duration || 1);

  return (
    <section className="flex h-full flex-col gap-3 rounded border bg-background p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold">Blueprint Preview</h2>
          <p className="text-xs text-muted-foreground">
            {blocks.length} blocks · {duration.toFixed(2)}s timeline
          </p>
        </div>

        <div className="rounded border px-2 py-1 text-xs text-muted-foreground">
          Monet EDL
        </div>
      </header>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {project.timeline.tracks.map((track: any) => {
          const trackBlocks = blocks.filter((block) => block.trackId === track.id);

          return (
            <div key={track.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{track.id}</span>
                <span className="text-muted-foreground">{track.type}</span>
              </div>

              <div className="relative h-14 rounded border bg-muted/30">
                {trackBlocks.map((block) => {
                  const left = `${(block.startTime / duration) * 100}%`;
                  const width = `${Math.max(0.75, (block.duration / duration) * 100)}%`;
                  const selected = selectedClipId === block.clipId;

                  return (
                    <button
                      key={block.clipId}
                      type="button"
                      className={[
                        "absolute top-1 h-12 overflow-hidden rounded px-2 text-left text-[10px] text-white shadow-sm transition",
                        block.colorClassName,
                        selected ? "ring-2 ring-white ring-offset-2" : "",
                      ].join(" ")}
                      style={{
                        left,
                        width,
                      }}
                      onClick={() => onSelectClip?.(block.clipId)}
                      title={`${block.label} · ${block.duration.toFixed(2)}s`}
                    >
                      <div className="truncate font-semibold">{block.label}</div>
                      <div className="truncate opacity-80">
                        {block.duration.toFixed(2)}s · {block.effects.length} FX
                      </div>
                      {block.effects.length > 0 ? (
                        <div className="mt-1 flex gap-1 overflow-hidden">
                          {block.effects.slice(0, 3).map((effect) => (
                            <span
                              key={`${block.clipId}-${effect}`}
                              className="rounded bg-black/25 px-1"
                            >
                              {effect}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}