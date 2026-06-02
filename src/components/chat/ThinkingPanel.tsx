import { Loader2, CheckCircle2, AlertCircle, Brain, Film, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThinkingStage =
  | "idle"
  | "intent"
  | "analysis"
  | "edl"
  | "complete"
  | "error";

interface ThinkingPanelProps {
  stage: ThinkingStage;
  intentConfidence?: number;
  analysisProgress?: string;
  edlShots?: number;
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  usedFallback?: boolean;
  error?: string;
}

export function ThinkingPanel({
  stage,
  intentConfidence,
  analysisProgress,
  edlShots,
  scores,
  usedFallback,
  error,
}: ThinkingPanelProps) {
  if (stage === "idle") return null;

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2 text-xs tracking-widest uppercase text-muted-foreground">
        <Brain className="h-3 w-3" />
        AI Director Thinking
      </div>

      <div className="space-y-2">
        {/* Stage 1: Intent Extraction */}
        <StageRow
          icon={<Brain className="h-4 w-4" />}
          label="Understanding your vision"
          status={stage === "intent" ? "loading" : stage === "error" ? "error" : "complete"}
          detail={
            intentConfidence !== undefined
              ? `${Math.round(intentConfidence * 100)}% confidence`
              : undefined
          }
        />

        {/* Stage 2: Analysis */}
        <StageRow
          icon={<Film className="h-4 w-4" />}
          label="Analyzing footage & music"
          status={
            stage === "analysis"
              ? "loading"
              : stage === "intent"
              ? "pending"
              : stage === "error"
              ? "error"
              : "complete"
          }
          detail={analysisProgress}
        />

        {/* Stage 3: EDL Generation */}
        <StageRow
          icon={<Clapperboard className="h-4 w-4" />}
          label="Planning the edit"
          status={
            stage === "edl"
              ? "loading"
              : stage === "complete"
              ? "complete"
              : stage === "error"
              ? "error"
              : "pending"
          }
          detail={
            edlShots !== undefined
              ? `${edlShots} shots, ${edlShots > 0 ? (30 / edlShots).toFixed(1) + "s avg" : ""}`
              : undefined
          }
        />
      </div>

      {/* Error state */}
      {stage === "error" && error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Quality scores */}
      {stage === "complete" && scores && (
        <div className="pt-2 border-t border-border space-y-1.5">
          <div className="text-xs text-muted-foreground">Quality Scores:</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <ScoreChip
              label="Beat Sync"
              value={scores.beatSyncScore}
              tooltip="How well cuts align to beats"
            />
            <ScoreChip
              label="Pacing"
              value={scores.pacingVariance}
              tooltip="Shot duration variety"
            />
            <ScoreChip
              label="Confidence"
              value={scores.overallConfidence}
              tooltip="Overall edit quality"
            />
          </div>
          {usedFallback && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <AlertCircle className="h-3 w-3" />
              Generated with deterministic fallback (LLM unavailable)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StageRow({
  icon,
  label,
  status,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  status: "pending" | "loading" | "complete" | "error";
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          status === "loading" && "bg-primary/10 text-primary",
          status === "complete" && "bg-green-500/10 text-green-600",
          status === "error" && "bg-destructive/10 text-destructive",
          status === "pending" && "bg-secondary text-muted-foreground"
        )}
      >
        {status === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : status === "complete" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : status === "error" ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm",
            status === "complete"
              ? "text-foreground"
              : status === "loading"
              ? "text-foreground font-medium"
              : "text-muted-foreground"
          )}
        >
          {label}
        </div>
        {detail && (
          <div className="text-xs text-muted-foreground truncate">{detail}</div>
        )}
      </div>
    </div>
  );
}

function ScoreChip({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number;
  tooltip?: string;
}) {
  const percentage = Math.round(value * 100);
  const color =
    percentage >= 80
      ? "text-green-600 bg-green-500/10"
      : percentage >= 60
      ? "text-yellow-600 bg-yellow-500/10"
      : "text-muted-foreground bg-secondary";

  return (
    <div
      className={cn("rounded-md px-2 py-1.5", color)}
      title={tooltip}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="text-sm font-medium">{percentage}%</div>
    </div>
  );
}
