import { FilmstripBorder } from "./shared/FilmstripBorder";

const CLIPS = [
  { user: "@sarah.creates", label: "Travel vlog" },
  { user: "@devfilms", label: "Short film" },
  { user: "@alexwang", label: "Product demo" },
  { user: "@mariaedits", label: "Wedding highlight" },
  { user: "@jakeprod", label: "Music video" },
  { user: "@linvisuals", label: "Documentary" },
];

// Duplicate for seamless loop
const DUPLICATED = [...CLIPS, ...CLIPS];

export function SocialProofMarquee() {
  return (
    <section className="py-24 overflow-hidden">
      <div className="marquee-track">
        {DUPLICATED.map((clip, i) => (
          <div
            key={`${clip.user}-${i}`}
            className="flex-shrink-0 w-[280px] mx-3"
          >
            <div className="bg-jalebi-surface rounded-xl border border-jalebi-border p-4">
              <div className="aspect-video bg-jalebi-surface-2 rounded-lg mb-3 flex items-center justify-center text-jalebi-border-strong text-xs">
                {clip.label}
              </div>
              <FilmstripBorder />
              <p className="text-xs text-jalebi-border-strong mt-2">{clip.user}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
