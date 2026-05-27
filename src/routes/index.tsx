import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Film, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-sm font-medium tracking-[0.3em] uppercase">monet</span>
        </div>
        <nav className="text-xs text-muted-foreground tracking-widest uppercase">
          v0.1 · scaffold
        </nav>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col items-start gap-10 px-8 pt-24 pb-16">
        <span className="text-xs text-muted-foreground tracking-[0.25em] uppercase">
          Edit any video, with AI
        </span>
        <h1 className="text-6xl md:text-7xl font-serif leading-[0.95] tracking-tight max-w-3xl">
          A canvas for video.
          <br />
          <span className="text-primary italic">Painted</span> by AI.
        </h1>
        <p className="max-w-xl text-base text-muted-foreground leading-relaxed">
          Drop in anime cuts, sports highlights, fan edits — anything. Tell Monet what you
          want, or take the brushes yourself in the studio.
        </p>

        <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-4 pt-6">
          <EntryCard
            to="/chat"
            icon={<MessageSquare className="h-5 w-5" />}
            kicker="Simple"
            title="Chat"
            desc="Describe the edit. Monet handles the rest. Zero tweaks."
          />
          <EntryCard
            to="/studio"
            icon={<Film className="h-5 w-5" />}
            kicker="Advanced"
            title="Studio"
            desc="Full timeline, inspector, tools — your hands on every frame."
          />
        </div>
      </section>

      <footer className="border-t border-border mt-32 px-8 py-6 text-xs text-muted-foreground tracking-widest uppercase">
        monet · the AI video editor
      </footer>
    </main>
  );
}

function EntryCard({
  to,
  icon,
  kicker,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col gap-4 rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-card/80"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            {kicker}
          </span>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
      </div>
      <div>
        <h3 className="text-3xl font-serif">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </Link>
  );
}
