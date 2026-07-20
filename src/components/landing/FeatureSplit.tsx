import { useScrollReveal } from "./shared/useScrollReveal";
import { FilmstripBorder } from "./shared/FilmstripBorder";

export function FeatureSplit() {
  const ref = useScrollReveal();

  return (
    <section id="features" ref={ref} className="reveal py-32 px-6">
      <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Simple editor */}
        <div className="bg-jalebi-surface rounded-2xl border border-jalebi-border p-12 relative overflow-hidden">
          {/* Decorative squiggle */}
          <svg
            className="absolute top-8 right-8 w-12 h-12 text-jalebi-accent opacity-30"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M8 40 C16 8, 32 40, 40 8" strokeLinecap="round" />
          </svg>

          <h3 className="text-2xl font-bold text-white font-display mb-3">
            Simple editor
          </h3>
          <p className="text-jalebi-border-strong mb-8 leading-relaxed">
            Drag. Drop. Done. — AI handles the rest.
          </p>

          <div className="aspect-video bg-jalebi-surface-2 rounded-xl border border-jalebi-border flex items-center justify-center mb-6">
            <span className="text-sm text-jalebi-border-strong">Simple UI preview</span>
          </div>
          <FilmstripBorder />

          <ul className="mt-6 space-y-2 text-sm text-jalebi-border-strong">
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> One-click edits
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Auto pacing
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> No timeline needed
            </li>
          </ul>
        </div>

        {/* Advanced editor */}
        <div className="bg-jalebi-surface rounded-2xl border border-jalebi-border p-12 relative overflow-hidden"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        >
          <h3 className="text-2xl font-bold text-white font-display mb-3">
            Advanced editor
          </h3>
          <p className="text-jalebi-border-strong mb-8 leading-relaxed">
            Multi-track timeline. Keyframe control. Full color pipeline.
          </p>

          <div className="aspect-video bg-jalebi-surface-2 rounded-xl flex items-center justify-center mb-6 border border-jalebi-border">
            <span className="text-sm text-jalebi-border-strong">Timeline UI preview</span>
          </div>
          <FilmstripBorder />

          <ul className="mt-6 space-y-2 text-sm text-jalebi-border-strong">
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Multi-track timeline
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Keyframe animation
            </li>
            <li className="flex items-center gap-2">
              <span className="text-jalebi-accent">✓</span> Color grading pipeline
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
