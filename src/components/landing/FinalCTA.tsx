import { useScrollReveal } from "./shared/useScrollReveal";
import { FilmstripBorder } from "./shared/FilmstripBorder";

export function FinalCTA() {
  const ref = useScrollReveal();

  return (
    <section ref={ref} className="reveal py-32 px-6">
      <FilmstripBorder className="max-w-[1100px] mx-auto mb-16" />
      <div className="max-w-[600px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white font-display mb-8">
          Stop editing.<br />Start directing.
        </h2>
        <a
          href="/sign-up"
          className="inline-block px-10 py-4 rounded-full bg-jalebi-accent text-jalebi-bg font-semibold text-base hover:bg-jalebi-accent-hover transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg"
        >
          Get started free
        </a>
      </div>
    </section>
  );
}
