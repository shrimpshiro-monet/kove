// AnalysisPanel.tsx — Shows BeatSync audio analysis results
// Displays energy waves, sections, rhythm bands, and beat markers

import { useState } from "react";
import { ChevronDown, ChevronUp, Music, Waves, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalysisData {
  bpm?: number;
  beatCount?: number;
  duration?: number;
  sections?: Array<{
    type: string;
    start: number;
    end: number;
    avg_energy: number;
  }>;
  features?: {
    energy?: number[];
    impact_score?: number[];
    kick?: number[];
    bass?: number[];
    clap?: number[];
    hihat?: number[];
    energy_levels?: string[];
  };
}

interface AnalysisPanelProps {
  analysis: AnalysisData | null;
  className?: string;
}

export function AnalysisPanel({ analysis, className }: AnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!analysis) return null;

  const sections = analysis.sections ?? [];
  const energy = analysis.features?.energy ?? [];
  const impact = analysis.features?.impact_score ?? [];

  return (
    <div className={cn("rounded-lg border border-border bg-card/50 overflow-hidden", className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium">Music Analysis</span>
          {analysis.bpm && (
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
              {Math.round(analysis.bpm)} BPM
            </span>
          )}
          {analysis.beatCount && (
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
              {analysis.beatCount} beats
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Energy Wave Visualization */}
          {energy.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Waves className="h-3 w-3 text-blue-400" />
                <span className="text-xs font-medium text-muted-foreground">Energy Wave</span>
              </div>
              <div className="flex items-end gap-px h-16 bg-muted/20 rounded p-2">
                {energy.map((e, i) => {
                  const level = analysis.features?.energy_levels?.[i] ?? "medium";
                  const color =
                    level === "peak" ? "bg-red-500" :
                    level === "high" ? "bg-orange-500" :
                    level === "medium" ? "bg-yellow-500" :
                    "bg-blue-500";
                  return (
                    <div
                      key={i}
                      className={cn("flex-1 rounded-t-sm transition-all", color)}
                      style={{ height: `${Math.max(4, e * 100)}%`, opacity: 0.8 }}
                      title={`Beat ${i + 1}: ${(e * 100).toFixed(0)}% [${level}]`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0s</span>
                <span>{analysis.duration?.toFixed(1)}s</span>
              </div>
            </div>
          )}

          {/* Impact Score */}
          {impact.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-3 w-3 text-orange-400" />
                <span className="text-xs font-medium text-muted-foreground">Impact Score</span>
              </div>
              <div className="flex items-end gap-px h-12 bg-muted/20 rounded p-2">
                {impact.map((imp, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 rounded-t-sm transition-all",
                      imp > 0.7 ? "bg-red-500" : imp > 0.4 ? "bg-orange-400" : "bg-gray-500"
                    )}
                    style={{ height: `${Math.max(4, imp * 100)}%`, opacity: 0.8 }}
                    title={`Beat ${i + 1}: impact ${(imp * 100).toFixed(0)}%`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Musical Sections */}
          {sections.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Sections</div>
              <div className="space-y-1">
                {sections.map((s, i) => {
                  const width = ((s.end - s.start) / (analysis.duration ?? 1)) * 100;
                  const color =
                    s.type === "chorus" ? "bg-orange-500/20 border-orange-500/40" :
                    s.type === "drop" ? "bg-red-500/20 border-red-500/40" :
                    s.type === "verse" ? "bg-blue-500/20 border-blue-500/40" :
                    s.type === "intro" ? "bg-green-500/20 border-green-500/40" :
                    s.type === "outro" ? "bg-purple-500/20 border-purple-500/40" :
                    "bg-gray-500/20 border-gray-500/40";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-12 text-right">
                        {s.start.toFixed(1)}s
                      </span>
                      <div
                        className={cn("h-6 rounded border text-[10px] flex items-center justify-center font-medium", color)}
                        style={{ width: `${Math.max(width, 8)}%` }}
                      >
                        {s.type}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        E:{(s.avg_energy * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rhythm Bands */}
          {analysis.features?.kick && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Rhythm</div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Kick", data: analysis.features.kick, color: "text-red-400" },
                  { label: "Bass", data: analysis.features.bass, color: "text-blue-400" },
                  { label: "Clap", data: analysis.features.clap, color: "text-yellow-400" },
                  { label: "Hi-hat", data: analysis.features.hihat, color: "text-green-400" },
                ].map(({ label, data, color }) => (
                  <div key={label} className="text-center">
                    <div className={cn("text-[10px] font-medium", color)}>{label}</div>
                    <div className="text-lg font-bold">
                      {data ? (data.reduce((a, b) => a + b, 0) / data.length * 100).toFixed(0) : "0"}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
