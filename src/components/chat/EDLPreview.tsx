import { Film, Zap, Music } from "lucide-react";
import { cn } from "@/lib/utils";

interface EDLPreviewProps {
  edl: {
    timeline: { duration: number };
    shots: Array<{
      id: string;
      timing: { startTime: number; duration: number };
      source: { clipId: string };
      beatLock?: { beatIndex: number };
      effects?: Array<{ type: string }>;
    }>;
    music?: { bpm: number };
  };
}

export function EDLPreview({ edl }: EDLPreviewProps) {
  const totalDuration = edl.timeline.duration;
  const shots = edl.shots;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Edit Timeline</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {shots.length} shots • {totalDuration}s
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="relative h-16 rounded-md bg-secondary/30 overflow-hidden">
        {shots.map((shot, idx) => {
          const leftPercent = (shot.timing.startTime / totalDuration) * 100;
          const widthPercent = (shot.timing.duration / totalDuration) * 100;

          const hasBeatLock = shot.beatLock !== undefined;
          const hasEffects = shot.effects && shot.effects.length > 0;

          return (
            <div
              key={shot.id}
              className={cn(
                "absolute top-0 bottom-0 border-r border-background",
                hasBeatLock ? "bg-primary/60" : "bg-primary/30",
                "hover:bg-primary/80 transition-colors cursor-pointer group"
              )}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
              title={`Shot ${idx + 1}: ${shot.timing.duration.toFixed(1)}s${hasBeatLock ? " (beat-synced)" : ""}${hasEffects ? ` • ${shot.effects?.length} effect(s)` : ""}`}
            >
              {/* Shot number overlay */}
              <div className="absolute inset-0 flex items-center justify-center text-[8px] font-medium text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {idx + 1}
              </div>

              {/* Beat lock indicator */}
              {hasBeatLock && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
              )}

              {/* Effects indicator */}
              {hasEffects && (
                <div className="absolute right-1 top-1">
                  <Zap className="h-2 w-2 text-primary-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-primary/60" />
          <span>Beat-synced</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-primary/30" />
          <span>Standard</span>
        </div>
        {edl.music && (
          <div className="flex items-center gap-1.5">
            <Music className="h-3 w-3" />
            <span>{edl.music.bpm} BPM</span>
          </div>
        )}
      </div>

      {/* Shot list (first 5) */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">
          First {Math.min(5, shots.length)} shots:
        </div>
        {shots.slice(0, 5).map((shot, idx) => (
          <div
            key={shot.id}
            className="flex items-center gap-2 text-xs rounded px-2 py-1.5 bg-secondary/50"
          >
            <span className="text-muted-foreground w-8">#{idx + 1}</span>
            <span className="flex-1 truncate">{shot.source.clipId}</span>
            <span className="text-muted-foreground">
              {shot.timing.duration.toFixed(1)}s
            </span>
            {shot.beatLock && (
              <Music className="h-3 w-3 text-primary" title="Beat-synced" />
            )}
            {shot.effects && shot.effects.length > 0 && (
              <Zap
                className="h-3 w-3 text-primary"
                title={`${shot.effects.length} effect(s)`}
              />
            )}
          </div>
        ))}
        {shots.length > 5 && (
          <div className="text-xs text-muted-foreground text-center py-1">
            + {shots.length - 5} more shots
          </div>
        )}
      </div>
    </div>
  );
}
