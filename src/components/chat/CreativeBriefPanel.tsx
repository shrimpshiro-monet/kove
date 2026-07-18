// CreativeBriefPanel.tsx — Shows the AI Creative Director's brief
// Displays section-by-section editing decisions

import { useState } from "react";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditingDecision {
  timeRange: [number, number];
  decision: string;
  reason: string;
  effectDensity: string;
}

interface CreativeBriefData {
  creativeAnalysis?: {
    musicEmotionalArc?: string;
    referenceIntent?: string;
    narrativeStructure?: string;
  };
  editingDecisions?: EditingDecision[];
  cutGuidance?: {
    averageShotDuration?: number;
    cutsPerMinute?: number;
    whenToCut?: string;
    whenToHold?: string;
  };
  effectPlacement?: {
    totalEffectsExpected?: number;
  };
}

interface CreativeBriefPanelProps {
  brief: CreativeBriefData | null;
  className?: string;
}

export function CreativeBriefPanel({ brief, className }: CreativeBriefPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!brief) return null;

  const decisions = brief.editingDecisions ?? [];

  return (
    <div className={cn("rounded-lg border border-border bg-card/50 overflow-hidden", className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">Creative Brief</span>
          {brief.effectPlacement?.totalEffectsExpected !== undefined && (
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
              {brief.effectPlacement.totalEffectsExpected} effects planned
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Creative Analysis */}
          {brief.creativeAnalysis && (
            <div className="space-y-2">
              {brief.creativeAnalysis.musicEmotionalArc && (
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Emotional Arc
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {brief.creativeAnalysis.musicEmotionalArc}
                  </p>
                </div>
              )}
              {brief.creativeAnalysis.referenceIntent && (
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Reference Intent
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {brief.creativeAnalysis.referenceIntent}
                  </p>
                </div>
              )}
              {brief.creativeAnalysis.narrativeStructure && (
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Narrative Structure
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {brief.creativeAnalysis.narrativeStructure}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Editing Decisions Timeline */}
          {decisions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Editing Decisions</div>
              <div className="space-y-1">
                {decisions.map((d, i) => {
                  const densityColor =
                    d.effectDensity === "high" ? "bg-red-500/20 border-red-500/40" :
                    d.effectDensity === "moderate" ? "bg-orange-500/20 border-orange-500/40" :
                    "bg-green-500/20 border-green-500/40";
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground font-mono w-16 shrink-0 pt-0.5">
                        {d.timeRange[0]}-{d.timeRange[1]}s
                      </span>
                      <div className={cn("px-2 py-1 rounded border", densityColor)}>
                        <span className="font-medium">{d.decision}</span>
                        <span className="text-muted-foreground ml-1">— {d.reason}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cut Guidance */}
          {brief.cutGuidance && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Cut Guidance</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {brief.cutGuidance.averageShotDuration && (
                  <div className="bg-muted/30 rounded p-2">
                    <div className="text-muted-foreground">Avg Shot</div>
                    <div className="font-bold">{brief.cutGuidance.averageShotDuration.toFixed(1)}s</div>
                  </div>
                )}
                {brief.cutGuidance.cutsPerMinute && (
                  <div className="bg-muted/30 rounded p-2">
                    <div className="text-muted-foreground">Cuts/Min</div>
                    <div className="font-bold">{brief.cutGuidance.cutsPerMinute}</div>
                  </div>
                )}
              </div>
              {brief.cutGuidance.whenToCut && (
                <p className="text-xs text-muted-foreground mt-2 italic">
                  Cut when: {brief.cutGuidance.whenToCut}
                </p>
              )}
              {brief.cutGuidance.whenToHold && (
                <p className="text-xs text-muted-foreground italic">
                  Hold when: {brief.cutGuidance.whenToHold}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
