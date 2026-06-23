import { useMemo } from "react";
import {
  Activity,
  Film,
  Music,
  Sparkles,
  Target,
  Zap,
  Waves,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EffectLike = {
  id?: string;
  type?: string;
  params?: Record<string, unknown>;
};

type ShotLike = {
  id: string;
  timing: {
    startTime: number;
    duration: number;
  };
  source: {
    clipId: string;
  };
  beatLock?: { beatIndex: number } | boolean;
  effects?: EffectLike[];
  meta?: {
    visualRole?: string;
    styleEnhanced?: boolean;
    styleMode?: string;
    [key: string]: unknown;
  };
};

type CreativeDensity = {
  passed?: boolean;
  effectsPer10Sec?: number;
  motionEventsPer10Sec?: number;
  beatLockedPercent?: number;
  failures?: string[];
};

type ReferenceSimilarity = {
  overall?: number;
  avgShotDurationSimilarity?: number;
  eventSequenceSimilarity?: number;
  energyCurveSimilarity?: number;
  effectDensitySimilarity?: number;
  failures?: string[];
};

export type BlueprintPreviewProps = {
  edl: {
    timeline: {
      duration: number;
    };
    shots: ShotLike[];
    music?: {
      bpm?: number;
    };
    globalEffects?: {
      colorGrade?: string;
    };
    meta?: Record<string, unknown>;
  };
  creativeDensity?: CreativeDensity;
  referenceSimilarity?: ReferenceSimilarity;
  className?: string;
};

function getEffectType(effect: EffectLike | string): string {
  if (typeof effect === "string") return effect;
  return effect.type ?? effect.id ?? "unknown";
}

function isMotionEffect(type: string): boolean {
  return [
    "push_in",
    "auto_push_in",
    "context_shake",
    "shake",
    "speed_ramp",
    "whip_transition",
    "color_pulse",
  ].includes(type);
}

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  if (value <= 1) return `${Math.round(value * 100)}%`;
  return `${Math.round(value)}%`;
}

function formatNumber(value?: number, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildEnergyPoints(shots: ShotLike[], duration: number) {
  if (!shots.length || duration <= 0) return "";

  const width = 100;
  const height = 30;

  return shots
    .map((shot) => {
      const x = clamp01(shot.timing.startTime / duration) * width;
      const effectCount = shot.effects?.length ?? 0;
      const hasMotion = shot.effects?.some((fx) => isMotionEffect(getEffectType(fx))) ?? false;
      const beat = !!shot.beatLock;

      const energy = clamp01(
        0.25 +
          effectCount * 0.09 +
          (hasMotion ? 0.22 : 0) +
          (beat ? 0.12 : 0)
      );

      const y = height - energy * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function summarizeEffects(shots: ShotLike[]) {
  const counts: Record<string, number> = {};

  for (const shot of shots) {
    for (const fx of shot.effects ?? []) {
      const type = getEffectType(fx);
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function calculateStats(edl: BlueprintPreviewProps["edl"]) {
  const duration = Math.max(0.001, edl.timeline.duration || 0);
  const shots = edl.shots ?? [];

  const effectsCount = shots.reduce((sum, shot) => sum + (shot.effects?.length ?? 0), 0);

  const motionEvents = shots.filter((shot) =>
    shot.effects?.some((fx) => isMotionEffect(getEffectType(fx)))
  ).length;

  const beatLocked = shots.filter((shot) => !!shot.beatLock).length;

  const avgShotDuration =
    shots.length > 0
      ? shots.reduce((sum, shot) => sum + shot.timing.duration, 0) / shots.length
      : 0;

  return {
    shotsCount: shots.length,
    duration,
    avgShotDuration,
    effectsCount,
    motionEvents,
    beatLocked,
    beatLockedPercent: shots.length > 0 ? (beatLocked / shots.length) * 100 : 0,
    effectsPer10Sec: (effectsCount / duration) * 10,
    motionEventsPer10Sec: (motionEvents / duration) * 10,
    effectSummary: summarizeEffects(shots),
    energyPoints: buildEnergyPoints(shots, duration),
  };
}

function scoreColor(score?: number): string {
  if (score === undefined) return "text-muted-foreground";
  if (score >= 0.75) return "text-emerald-500";
  if (score >= 0.5) return "text-amber-500";
  return "text-red-500";
}

export function BlueprintPreview({
  edl,
  creativeDensity,
  referenceSimilarity,
  className,
}: BlueprintPreviewProps) {
  const stats = useMemo(() => calculateStats(edl), [edl]);

  const warnings = [
    ...(creativeDensity?.failures ?? []),
    ...(referenceSimilarity?.failures ?? []),
  ];

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 space-y-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Film className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Blueprint Preview</div>
            <div className="text-xs text-muted-foreground">
              AI edit plan · {stats.shotsCount} shots · {stats.duration.toFixed(1)}s
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {edl.music?.bpm && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
              <Music className="h-3 w-3" />
              {edl.music.bpm} BPM
            </span>
          )}

          {edl.globalEffects?.colorGrade && (
            <span className="rounded-full border border-border px-2 py-1 capitalize">
              {edl.globalEffects.colorGrade}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Avg shot"
          value={`${stats.avgShotDuration.toFixed(2)}s`}
        />
        <MetricCard
          icon={<Zap className="h-3.5 w-3.5" />}
          label="FX / 10s"
          value={formatNumber(creativeDensity?.effectsPer10Sec ?? stats.effectsPer10Sec)}
          tone={
            (creativeDensity?.effectsPer10Sec ?? stats.effectsPer10Sec) >= 5
              ? "good"
              : "warn"
          }
        />
        <MetricCard
          icon={<Waves className="h-3.5 w-3.5" />}
          label="Motion / 10s"
          value={formatNumber(creativeDensity?.motionEventsPer10Sec ?? stats.motionEventsPer10Sec)}
          tone={
            (creativeDensity?.motionEventsPer10Sec ?? stats.motionEventsPer10Sec) >= 4
              ? "good"
              : "warn"
          }
        />
        <MetricCard
          icon={<Music className="h-3.5 w-3.5" />}
          label="Beat lock"
          value={formatPercent(creativeDensity?.beatLockedPercent ?? stats.beatLockedPercent)}
          tone={
            (creativeDensity?.beatLockedPercent ?? stats.beatLockedPercent) >= 70
              ? "good"
              : "warn"
          }
        />
      </div>

      <div className="rounded-lg border border-border bg-background/50 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Timeline</span>
          {referenceSimilarity?.overall !== undefined && (
            <span className={cn("inline-flex items-center gap-1 font-medium", scoreColor(referenceSimilarity.overall))}>
              <Target className="h-3 w-3" />
              Ref match {formatPercent(referenceSimilarity.overall)}
            </span>
          )}
        </div>

        <div className="relative h-16 overflow-hidden rounded-md bg-secondary/40">
          {edl.shots.map((shot, idx) => {
            const leftPercent = (shot.timing.startTime / stats.duration) * 100;
            const widthPercent = Math.max(0.5, (shot.timing.duration / stats.duration) * 100);
            const effectTypes = shot.effects?.map(getEffectType) ?? [];
            const hasMotion = effectTypes.some(isMotionEffect);
            const hasBeatLock = !!shot.beatLock;

            return (
              <div
                key={shot.id ? `${shot.id}-${idx}` : idx}
                className={cn(
                  "absolute top-0 bottom-0 border-r border-background/80 group cursor-pointer transition-colors",
                  hasMotion
                    ? "bg-fuchsia-500/55 hover:bg-fuchsia-500/80"
                    : hasBeatLock
                      ? "bg-primary/55 hover:bg-primary/80"
                      : "bg-primary/25 hover:bg-primary/60"
                )}
                style={{
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                }}
                title={[
                  `Shot ${idx + 1}`,
                  `${shot.timing.duration.toFixed(2)}s`,
                  hasBeatLock ? "beat synced" : "not beat synced",
                  effectTypes.length ? `${effectTypes.join(", ")}` : "no effects",
                ].join(" · ")}
              >
                {hasBeatLock && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white/70" />}
                {effectTypes.length > 0 && (
                  <div className="absolute right-1 top-1">
                    <Zap className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white opacity-0 group-hover:opacity-100">
                  {idx + 1}
                </div>
              </div>
            );
          })}
        </div>

        <svg
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          className="mt-3 h-10 w-full overflow-visible"
        >
          <polyline
            points={stats.energyPoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="text-primary"
          />
        </svg>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">First shots</div>

          {edl.shots.slice(0, 6).map((shot, idx) => {
            const effectTypes = shot.effects?.map(getEffectType) ?? [];

            return (
              <div
                key={shot.id ? `${shot.id}-row-${idx}` : `row-${idx}`}
                className="flex items-center gap-2 rounded-md bg-secondary/45 px-2 py-1.5 text-xs"
              >
                <span className="w-8 text-muted-foreground">#{idx + 1}</span>
                <span className="min-w-0 flex-1 truncate">{shot.source.clipId}</span>
                <span className="text-muted-foreground tabular-nums">
                  {shot.timing.duration.toFixed(2)}s
                </span>
                {shot.beatLock && <Music className="h-3 w-3 text-primary" />}
                {effectTypes.length > 0 && (
                  <span className="inline-flex max-w-[120px] items-center gap-1 truncate rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <Zap className="h-2.5 w-2.5" />
                    {effectTypes.slice(0, 2).join(", ")}
                    {effectTypes.length > 2 ? ` +${effectTypes.length - 2}` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Effect Stack
          </div>

          <div className="space-y-1.5">
            {stats.effectSummary.length === 0 ? (
              <div className="text-xs text-muted-foreground">No effects detected</div>
            ) : (
              stats.effectSummary.slice(0, 7).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{type}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Director warnings
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {warnings.slice(0, 3).map((warning, idx) => (
              <li key={idx}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-500",
          tone === "warn" && "text-amber-500",
          tone === "bad" && "text-red-500"
        )}
      >
        {value}
      </div>
    </div>
  );
}
