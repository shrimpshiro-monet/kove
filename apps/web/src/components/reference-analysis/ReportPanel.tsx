import { useMemo } from "react"
import type { ReferenceStyleProfile, SegmentStyle } from "./types"

interface ReportPanelProps {
  profile: ReferenceStyleProfile
}

function fmt(t: number): string {
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`
}

function effectIntensity(seg: SegmentStyle): number {
  return seg.blur + seg.vignette + seg.grain + seg.glow + seg.shake + seg.rgb_split
}

function energyColor(v: number): string {
  if (v < 0.33) return "bg-emerald-500"
  if (v < 0.66) return "bg-yellow-500"
  return "bg-red-500"
}

export function ReportPanel({ profile }: ReportPanelProps) {
  const effectCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const fields: (keyof SegmentStyle)[] = ["blur", "vignette", "grain", "glow", "shake", "rgb_split"]
    for (const seg of profile.segments) {
      for (const field of fields) {
        if (seg[field] > 0) {
          counts[field] = (counts[field] ?? 0) + 1
        }
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [profile.segments])

  const motionEntries = useMemo(() => {
    return Object.entries(profile.camera_motion_distribution).sort((a, b) => b[1] - a[1])
  }, [profile.camera_motion_distribution])

  const energyBars = useMemo(() => {
    const curve = profile.energy_curve
    if (curve.length === 0) return []
    const step = Math.max(1, Math.floor(curve.length / 40))
    const sampled: number[] = []
    for (let i = 0; i < curve.length; i += step) {
      const bucket = curve.slice(i, Math.min(i + step, curve.length))
      sampled.push(Math.max(...bucket))
    }
    return sampled
  }, [profile.energy_curve])

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto font-mono text-[11px]">
      {/* Summary */}
      <div className="rounded border border-border bg-background-secondary p-3 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Summary</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-text-secondary">
          <span>duration</span><span className="text-text-primary text-right">{profile.duration.toFixed(1)}s</span>
          <span>resolution</span><span className="text-text-primary text-right">{profile.resolution[0]}×{profile.resolution[1]}</span>
          <span>total cuts</span><span className="text-text-primary text-right">{profile.total_cuts}</span>
          <span>avg shot</span><span className="text-text-primary text-right">{profile.avg_shot_duration.toFixed(2)}s</span>
          <span>BPM</span><span className="text-text-primary text-right">{profile.bpm}</span>
          <span>pacing</span><span className="text-text-primary text-right">{profile.pacing_type}</span>
          <span>cut alignment</span><span className="text-text-primary text-right">{profile.cut_alignment}</span>
          <span>climax at</span><span className="text-text-primary text-right">{fmt(profile.climax_position)}</span>
          <span>avg speed</span><span className="text-text-primary text-right">{profile.avg_speed.toFixed(2)}x</span>
        </div>
      </div>

      {/* Per-shot timeline */}
      <div className="rounded border border-border bg-background-secondary p-3 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          Shots ({profile.segments.length})
        </div>
        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
          {profile.segments.map((seg, i) => {
            const intensity = effectIntensity(seg)
            const hue = Math.max(0, Math.min(240, 240 - intensity * 240))
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded px-2 py-1 text-[10px] transition-colors"
                style={{ backgroundColor: `oklch(0.15 0.02 ${hue} / ${0.3 + intensity * 0.4})` }}
              >
                <span className="text-text-muted w-6 shrink-0">#{i + 1}</span>
                <span className="text-text-secondary w-16 shrink-0">{fmt(seg.start)}</span>
                <span className="text-text-primary w-14 shrink-0">{seg.duration.toFixed(1)}s</span>
                <span className="text-text-muted w-8 shrink-0">{seg.camera_motion.slice(0, 4)}</span>
                <span className="text-text-muted w-10 shrink-0">
                  {seg.transition_type === "cut" ? "cu" : seg.transition_type === "crossfade" ? "cf" : seg.transition_type === "flash" ? "fl" : "wi"}
                </span>
                <div className="flex gap-0.5 ml-auto">
                  {seg.blur > 0 && <span className="text-[8px] text-text-tertiary">bl</span>}
                  {seg.vignette > 0 && <span className="text-[8px] text-text-tertiary">vg</span>}
                  {seg.grain > 0 && <span className="text-[8px] text-text-tertiary">gr</span>}
                  {seg.glow > 0 && <span className="text-[8px] text-text-tertiary">gw</span>}
                  {seg.shake > 0 && <span className="text-[8px] text-text-tertiary">sh</span>}
                  {seg.rgb_split > 0 && <span className="text-[8px] text-text-tertiary">rs</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Color grade */}
      <div className="rounded border border-border bg-background-secondary p-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Color Grade</div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] capitalize text-text-primary">{profile.color_signature.style}</span>
          <span className="ml-auto text-text-muted text-[10px]">{profile.color_signature.brightness.toFixed(2)}</span>
        </div>
        <LabeledBar label="brightness" value={profile.color_signature.brightness} />
        <LabeledBar label="contrast" value={profile.color_signature.contrast} />
        <LabeledBar label="saturation" value={profile.color_signature.saturation} />
      </div>

      {/* Camera motion */}
      <div className="rounded border border-border bg-background-secondary p-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Camera Motion</div>
        {motionEntries.map(([name, value]) => (
          <LabeledBar key={name} label={name} value={value / 100} display={`${value.toFixed(0)}%`} />
        ))}
      </div>

      {/* Effects vocabulary */}
      <div className="rounded border border-border bg-background-secondary p-3 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Effects</div>
        <div className="flex flex-wrap gap-1">
          {effectCounts.map(([name, count]) => (
            <span
              key={name}
              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
            >
              {name} <span className="text-text-muted">×{count}</span>
            </span>
          ))}
        </div>
        {profile.effect_vocabulary.length > 0 && (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted pt-1">Vocabulary</div>
            <div className="flex flex-wrap gap-1">
              {profile.effect_vocabulary.map((e) => (
                <span key={e} className="rounded bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary">
                  {e}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Transition vocabulary */}
      {profile.transition_vocabulary.length > 0 && (
        <div className="rounded border border-border bg-background-secondary p-3 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Transitions</div>
          <div className="flex flex-wrap gap-1">
            {profile.transition_vocabulary.map((t) => (
              <span key={t} className="rounded bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Energy curve */}
      <div className="rounded border border-border bg-background-secondary p-3 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Energy Curve</div>
        <div className="flex items-end gap-[2px] h-8">
          {energyBars.map((v, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${energyColor(v)}`}
              style={{ height: `${Math.max(8, v * 100)}%`, opacity: 0.5 + v * 0.5 }}
              title={`${(v * 100).toFixed(0)}%`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LabeledBar({ label, value, display }: { label: string; value: number; display?: string }) {
  const pctVal = Math.round(value * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted text-[10px] w-16 shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-background-tertiary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60 transition-all"
          style={{ width: `${Math.min(100, pctVal)}%` }}
        />
      </div>
      <span className="text-text-secondary text-[10px] w-8 text-right tabular-nums">{display ?? `${pctVal}%`}</span>
    </div>
  )
}
