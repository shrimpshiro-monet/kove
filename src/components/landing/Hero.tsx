import { useState } from "react";
import { useScrollReveal } from "./shared/useScrollReveal";
import { EditorToggle, type EditorMode } from "./EditorToggle";
import { ScrubbablePreview } from "./ScrubbablePreview";
import { TypewriterReveal } from "./TypewriterReveal";

export function Hero() {
  const [mode, setMode] = useState<EditorMode>("simple");
  const ref = useScrollReveal();

  return (
    <section
      ref={ref}
      className="reveal pt-28 pb-16 px-6 max-w-[1200px] mx-auto"
    >
      <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
        {/* Left — copy */}
        <div className="flex-1 min-w-0 text-left">
          <div className="inline-flex items-center gap-2 bg-jalebi-surface border border-jalebi-border rounded-full px-4 py-1.5 mb-8">
            <span className="text-xs font-medium text-jalebi-border-strong">
              Now in beta — join early
            </span>
          </div>

          <TypewriterReveal />

          <p className="text-lg text-jalebi-border-strong max-w-[480px] leading-relaxed mb-10">
            An AI video director that understands you — upload footage, describe your vision, get a finished cut.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="/sign-up"
              className="px-8 py-3 rounded-full bg-jalebi-accent text-jalebi-bg font-semibold text-sm hover:bg-jalebi-accent-hover transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
            >
              Start editing free
            </a>
            <a
              href="#demo"
              className="px-8 py-3 rounded-full border border-jalebi-border text-white font-medium text-sm hover:border-jalebi-border-strong transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
            >
              Watch demo
            </a>
          </div>
        </div>

        {/* Right — preview */}
        <div className="flex-1 min-w-0 w-full">
          <EditorToggle mode={mode} onChange={setMode} />
          <div className="mt-6">
            <ScrubbablePreview mode={mode} />
          </div>
        </div>
      </div>
    </section>
  );
}
