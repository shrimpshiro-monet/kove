// apps/web/src/components/editor/TimelineEditor.tsx

import React, { useMemo, useRef } from "react";
import { useProjectStore } from "../../stores/project-store";

interface TimelineEditorProps {
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
}

export function TimelineEditor({ selectedClipId, onSelectClip }: TimelineEditorProps) {
  const project = useProjectStore((s: any) => s.project);
  const setStore = useProjectStore.setState;

  const timelineRef = useRef<HTMLDivElement | null>(null);

  const edl = project?.settings?.monet?.edl;
  const duration = useMemo(() => project?.timeline?.duration || 10, [project]);

  // Extract beat markers
  const beatMarkers = useMemo(() => {
    return edl?.timeline?.markers?.filter((m: any) => m.type === "beat" || m.type === "impact") || [];
  }, [edl]);

  if (!project) return null;

  function updateClipStartTime(clipId: string, trackType: string, newStart: number) {
    const updatedProject = structuredClone(project);

    // Apply snap to beat markers (0.2s threshold)
    let snappedStart = newStart;
    for (const marker of beatMarkers) {
      if (Math.abs(marker.time - newStart) < 0.2) {
        snappedStart = marker.time;
        break;
      }
    }

    snappedStart = Math.max(0, snappedStart);

    // Find and update clip in standard tracks
    for (const track of updatedProject.timeline.tracks) {
      if (track.type === trackType) {
        for (const clip of track.clips) {
          if (clip.id === clipId) {
            clip.startTime = snappedStart;
            break;
          }
        }
      }
    }

    // Sync EDL
    const edlObj = updatedProject.settings?.monet?.edl;
    if (edlObj) {
      for (const track of edlObj.timeline.tracks) {
        if (track.type === trackType) {
          for (const clip of track.clips) {
            if (clip.id === clipId || clip.mediaId === clipId) {
              clip.startTime = snappedStart;
              break;
            }
          }
        }
      }
    }

    setStore({ project: updatedProject });
  }

  // Mouse drag handler for sliding clips
  function handleMouseDown(e: React.MouseEvent, clip: any, trackType: string) {
    e.stopPropagation();
    onSelectClip(clip.id);

    const startX = e.clientX;
    const initialStart = clip.startTime;
    const timelineWidth = timelineRef.current?.getBoundingClientRect().width || 1;

    function handleMouseMove(moveEvent: MouseEvent) {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = (deltaX / timelineWidth) * duration;
      const computedStart = initialStart + deltaTime;
      updateClipStartTime(clip.id, trackType, computedStart);
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function getTrackColor(type: string, isSelected: boolean) {
    if (isSelected) return "bg-primary border border-white shadow-lg scale-[1.01]";
    
    if (type === "video") return "bg-blue-600/80 hover:bg-blue-500 border border-blue-400/45";
    if (type === "audio") return "bg-emerald-600/80 hover:bg-emerald-500 border border-emerald-400/45";
    if (type === "text") return "bg-amber-600/80 hover:bg-amber-500 border border-amber-400/45";
    return "bg-fuchsia-600/80 hover:bg-fuchsia-500 border border-fuchsia-400/45";
  }

  return (
    <div className="flex flex-col gap-3 rounded border bg-card p-3 shadow-sm text-xs">
      <div className="flex items-center justify-between border-b pb-1">
        <div className="flex flex-col">
          <span className="font-semibold text-primary">Interactive Timeline Editor</span>
          <span className="text-[10px] text-muted-foreground">Drag blocks to slide timing · Snaps to active beat-grid</span>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-semibold">
            ⚡ Beats Snap Active
          </span>
        </div>
      </div>

      {/* Grid Ruler / Markers */}
      <div ref={timelineRef} className="relative w-full bg-muted/20 border rounded p-1 select-none min-h-[160px] flex flex-col gap-2.5 overflow-hidden">
        
        {/* Beat grid vertical lines */}
        {beatMarkers.map((marker: any) => {
          const leftPercent = `${(marker.time / duration) * 100}%`;
          return (
            <div
              key={marker.id}
              className="absolute top-0 bottom-0 border-l border-amber-500/25 z-0 pointer-events-none"
              style={{ left: leftPercent }}
              title={`Beat: ${marker.time.toFixed(2)}s`}
            />
          );
        })}

        {/* Tracks rendering */}
        {project.timeline.tracks.map((track: any) => (
          <div key={track.id} className="relative h-9 flex items-center bg-muted/10 rounded border border-muted-foreground/10 px-2">
            <span className="text-[9px] font-mono capitalize text-muted-foreground font-semibold absolute left-1 top-0.5 bg-background/50 px-1 rounded z-20">
              {track.type}
            </span>

            <div className="w-full h-full relative">
              {track.clips.map((clip: any) => {
                const leftPercent = `${(clip.startTime / duration) * 100}%`;
                const widthPercent = `${(clip.duration / duration) * 100}%`;
                const isSelected = selectedClipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => handleMouseDown(e, clip, track.type)}
                    className={[
                      "absolute top-1 bottom-1 flex flex-col justify-center rounded px-2 cursor-col-resize select-none overflow-hidden transition-shadow shadow-sm font-medium text-white text-[9px] z-10",
                      getTrackColor(track.type, isSelected)
                    ].join(" ")}
                    style={{
                      left: leftPercent,
                      width: widthPercent,
                    }}
                  >
                    <div className="truncate font-semibold uppercase tracking-wider leading-none">
                      {clip.mediaId}
                    </div>
                    <div className="truncate opacity-80 text-[8px] mt-0.5">
                      {clip.startTime.toFixed(2)}s · {clip.duration.toFixed(2)}s {clip.speed && clip.speed !== 1 ? `(${clip.speed}x)` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Ruler tick indicators */}
        <div className="flex justify-between text-[8px] text-muted-foreground font-mono px-1 border-t pt-1 border-muted-foreground/10 mt-auto z-10">
          <span>0.00s</span>
          <span>{(duration * 0.25).toFixed(2)}s</span>
          <span>{(duration * 0.5).toFixed(2)}s</span>
          <span>{(duration * 0.75).toFixed(2)}s</span>
          <span>{duration.toFixed(2)}s</span>
        </div>
      </div>
    </div>
  );
}
