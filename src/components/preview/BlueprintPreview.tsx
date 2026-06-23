// src/components/preview/BlueprintPreview.tsx
import type { MonetEDL } from "../../server/types/edl";

interface Props {
  edl: MonetEDL;
  clipProxyUrls: Record<string, string>;
}

export function BlueprintPreview({ edl, clipProxyUrls }: Props) {
  const totalDuration = edl.timeline.duration;
  const beatGrid = edl.music?.beatGrid || [];

  return (
    <div className="blueprint-preview bg-[#0A0A0A] rounded-lg border border-white/10 overflow-hidden flex flex-col h-full">
      {/* Header stats */}
      <div className="flex items-center gap-6 p-4 border-b border-white/5 bg-white/[0.02] text-xs font-mono text-white/60">
        <span className="flex items-center gap-1.5"><span className="text-white">🎬</span> {edl.shots.length} shots</span>
        <span className="flex items-center gap-1.5"><span className="text-white">⏱</span> {totalDuration.toFixed(1)}s</span>
        {edl.music && <span className="flex items-center gap-1.5"><span className="text-white">🎵</span> {edl.music.bpm} BPM</span>}
        <span className="flex items-center gap-1.5 capitalize"><span className="text-white">🎨</span> {edl.globalEffects?.colorGrade || "raw"}</span>
      </div>

      {/* Timeline Visualizer */}
      <div className="p-6 overflow-x-auto">
        <div className="relative min-w-[800px]">
          {/* Beat grid ruler */}
          <div className="absolute top-0 left-0 right-0 h-4 border-b border-white/5">
            {beatGrid.map((beat, i) => (
              <div
                key={i}
                className={`absolute top-0 w-px h-2 transition-opacity ${i % 4 === 0 ? "h-3 bg-white/40" : "bg-white/10"}`}
                style={{ left: `${(beat / totalDuration) * 100}%` }}
              />
            ))}
          </div>

          {/* Shot blocks */}
          <div className="relative h-24 mt-6 flex items-center">
            {edl.shots.map((shot, i) => {
              const left = (shot.timing.startTime / totalDuration) * 100;
              const width = (shot.timing.duration / totalDuration) * 100;
              const hasEffects = shot.effects && shot.effects.length > 0;
              const hasBeatLock = !!shot.beatLock;

              return (
                <div
                  key={shot.id}
                  className="absolute h-16 rounded-md border border-white/20 flex flex-col justify-center px-2 overflow-hidden group cursor-help transition-all hover:scale-[1.02] hover:z-10"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.5)}%`,
                    backgroundColor: getShotColor(shot, i),
                  }}
                  title={shot.aiRationale || `Shot ${i + 1}`}
                >
                  <span className="text-[10px] font-bold text-white/90 truncate leading-none">
                    {shot.timing.duration.toFixed(1)}s
                  </span>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {hasBeatLock && <span className="w-3 h-3 bg-white/20 rounded-full flex items-center justify-center text-[8px] text-white">♪</span>}
                    {hasEffects && <span className="px-1 bg-white/20 rounded text-[8px] text-white font-bold leading-none py-0.5">FX</span>}
                    {shot.timing.speed && shot.timing.speed !== 1 && (
                      <span className="px-1 bg-white/20 rounded text-[8px] text-white font-bold leading-none py-0.5 uppercase">
                        {shot.timing.speed < 1 ? "SLO" : "FST"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Shot details list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[300px]">
        <h4 className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-3 px-2">Edit Decision List (Blueprint)</h4>
        {edl.shots.map((shot, i) => (
          <div key={shot.id} className="group flex items-start gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
            <div className="flex-shrink-0 w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/80">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold text-white/90">
                  {shot.timing.startTime.toFixed(2)}s → {(shot.timing.startTime + shot.timing.duration).toFixed(2)}s
                </span>
                <span className="text-[10px] font-mono text-white/30 truncate">
                  {shot.source.clipId.slice(0, 8)}... ({shot.source.inPoint.toFixed(1)}–{shot.source.outPoint.toFixed(1)}s)
                </span>
              </div>
              {shot.aiRationale && (
                <p className="text-[11px] text-white/60 italic leading-relaxed">
                   <span className="not-italic mr-1">🧠</span> {shot.aiRationale}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getShotColor(shot: any, index: number): string {
  // Use a professional, slightly desaturated palette
  const colors = [
    "#E63946", // Red
    "#457B9D", // Blue
    "#2A9D8F", // Teal
    "#F4A261", // Orange
    "#8338EC", // Purple
    "#FF006E", // Pink
    "#3A86FF", // Royal Blue
    "#FB5607", // Vivid Orange
  ];
  return colors[index % colors.length] + "88"; // 88 for 50% opacity
}
