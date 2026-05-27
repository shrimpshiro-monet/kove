import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Sparkles,
  Film,
  Type,
  Music,
  Wand2,
  Image as ImageIcon,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Lock,
  Unlock,
  X,
  Send,
  Scissors,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useStudioProjects, type Clip } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/$projectId")({
  component: StudioPage,
});

type PanelKey = "media" | "effects" | "text" | "audio" | "ai" | null;

function StudioPage() {
  const { projectId } = useParams({ from: "/studio/$projectId" });
  const { projects, updateProject } = useStudioProjects();
  const project = projects.find((p) => p.id === projectId);

  const [panel, setPanel] = useState<PanelKey>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [locked, setLocked] = useState(true);
  const [query, setQuery] = useState("");

  const totalDuration = useMemo(() => {
    if (!project) return 30;
    const end = project.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    return Math.max(end, 20);
  }, [project]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPlayhead((p) => (p >= totalDuration ? 0 : p + 0.05));
    }, 50);
    return () => clearInterval(id);
  }, [playing, totalDuration]);

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const selectedClip = project.clips.find((c) => c.id === selectedClipId) ?? null;

  const updateClip = (id: string, patch: Partial<Clip>) => {
    updateProject(projectId, (p) => ({
      ...p,
      updatedAt: Date.now(),
      clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  return (
    <div className="grid h-screen grid-rows-[auto_1fr_auto] bg-background text-foreground">
      {/* Toolbar */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border bg-sidebar px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs font-medium tracking-[0.3em] uppercase">monet</span>
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            {project.name}
          </span>
          <div className="flex items-center gap-0.5 ml-2">
            <ToolBtn icon={<Undo2 className="h-3.5 w-3.5" />} label="Undo" />
            <ToolBtn icon={<Redo2 className="h-3.5 w-3.5" />} label="Redo" />
            <ToolBtn icon={<Scissors className="h-3.5 w-3.5" />} label="Split" />
          </div>
        </div>

        <div className="relative w-[420px] max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions, effects, clips — or ask Monet…"
            className="h-9 pl-9 pr-20 bg-card border-border focus-visible:border-primary/50"
          />
          <button
            onClick={() => setChatOpen(true)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-md bg-primary/15 text-primary px-2 py-1 text-[10px] tracking-widest uppercase hover:bg-primary/25 transition-colors"
          >
            <Sparkles className="h-3 w-3" /> Ask
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setLocked((l) => !l)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors"
            title={locked ? "Layout locked" : "Layout unlocked"}
          >
            {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {locked ? "Template" : "Rearrange"}
          </button>
          <Link
            to="/chat"
            className="text-xs text-muted-foreground hover:text-primary tracking-widest uppercase px-2"
          >
            Simple
          </Link>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
            Render
          </Button>
        </div>
      </header>

      {/* Middle: rail + preview + inspector */}
      <div className="grid grid-cols-[56px_1fr_320px] min-h-0">
        {/* Icon rail */}
        <div className="flex flex-col items-center gap-1 border-r border-border bg-sidebar py-3 relative">
          <RailBtn active={panel === "media"} onClick={() => togglePanel("media")} icon={<ImageIcon className="h-4 w-4" />} label="Media" />
          <RailBtn active={panel === "effects"} onClick={() => togglePanel("effects")} icon={<Wand2 className="h-4 w-4" />} label="Effects" />
          <RailBtn active={panel === "text"} onClick={() => togglePanel("text")} icon={<Type className="h-4 w-4" />} label="Text" />
          <RailBtn active={panel === "audio"} onClick={() => togglePanel("audio")} icon={<Music className="h-4 w-4" />} label="Audio" />
          <div className="flex-1" />
          <RailBtn active={panel === "ai"} onClick={() => togglePanel("ai")} icon={<Sparkles className="h-4 w-4" />} label="AI" highlight />
        </div>

        {/* Preview */}
        <div className="relative flex flex-col min-h-0 bg-background">
          <div className="flex-1 flex items-center justify-center p-6 min-h-0">
            <div className="relative aspect-video w-full max-w-4xl rounded-md border border-border bg-black overflow-hidden shadow-2xl">
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Film className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs tracking-widest uppercase opacity-60">Preview</p>
                  <p className="text-[10px] mt-1 opacity-40">
                    {playhead.toFixed(2)}s / {totalDuration.toFixed(2)}s
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 pb-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPlayhead(0)}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-9 w-9 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPlayhead(totalDuration)}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Overlay panel (anchored over preview, doesn't push) */}
          {panel && (
            <OverlayPanel kind={panel} onClose={() => setPanel(null)} />
          )}
        </div>

        {/* Inspector */}
        <aside className="border-l border-border bg-sidebar flex flex-col min-h-0">
          <div className="border-b border-sidebar-border px-4 py-3">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
              Inspector
            </div>
            <div className="text-sm font-medium truncate">
              {selectedClip ? selectedClip.name : "No selection"}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selectedClip ? (
              <ClipInspector
                clip={selectedClip}
                onChange={(patch) => updateClip(selectedClip.id, patch)}
              />
            ) : (
              <EmptyInspector />
            )}
          </div>
        </aside>
      </div>

      {/* Timeline */}
      <Timeline
        clips={project.clips}
        playhead={playhead}
        totalDuration={totalDuration}
        selectedId={selectedClipId}
        onSelect={setSelectedClipId}
        onScrub={setPlayhead}
      />

      {/* Chat side panel */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  );

  function togglePanel(p: PanelKey) {
    setPanel((cur) => (cur === p ? null : p));
  }
}

function ToolBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      title={label}
      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
    >
      {icon}
    </button>
  );
}

function RailBtn({
  icon,
  label,
  active,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={cn(
        "group relative h-10 w-10 rounded-md flex items-center justify-center transition-colors",
        active
          ? "bg-secondary text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
        highlight && !active && "text-primary/80",
      )}
    >
      {icon}
      {active && (
        <span className="absolute -left-px top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary" />
      )}
    </button>
  );
}

function OverlayPanel({ kind, onClose }: { kind: Exclude<PanelKey, null>; onClose: () => void }) {
  const titles: Record<Exclude<PanelKey, null>, string> = {
    media: "Media",
    effects: "Effects",
    text: "Text",
    audio: "Audio",
    ai: "AI tools",
  };
  const items: Record<Exclude<PanelKey, null>, string[]> = {
    media: ["Upload clip", "Stock footage", "Recent imports", "Screen recordings"],
    effects: ["Color grade", "Blur", "Glitch", "Zoom", "Shake", "Film grain"],
    text: ["Title card", "Lower third", "Subtitles", "Kinetic typography"],
    audio: ["Music library", "Sound FX", "Voiceover", "Auto-ducking"],
    ai: ["Cut to beat", "Auto highlights", "Remove silence", "Translate captions", "Style transfer"],
  };
  return (
    <div className="absolute left-3 top-3 bottom-3 z-20 w-72 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-2xl flex flex-col animate-in slide-in-from-left-2 fade-in duration-200">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground">
          {titles[kind]}
        </div>
        <button
          onClick={onClose}
          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {items[kind].map((it) => (
          <button
            key={it}
            className="w-full text-left rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-secondary hover:text-foreground transition-colors"
          >
            {it}
          </button>
        ))}
      </div>
    </div>
  );
}

function Timeline({
  clips,
  playhead,
  totalDuration,
  selectedId,
  onSelect,
  onScrub,
}: {
  clips: Clip[];
  playhead: number;
  totalDuration: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onScrub: (t: number) => void;
}) {
  const tracks = useMemo(() => {
    const max = clips.reduce((m, c) => Math.max(m, c.track), 0);
    return Array.from({ length: max + 1 }, (_, i) => i);
  }, [clips]);

  const trackRef = useRef<HTMLDivElement>(null);

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    onScrub(Math.max(0, Math.min(totalDuration, ratio * totalDuration)));
  };

  return (
    <div className="border-t border-border bg-sidebar">
      <div className="flex items-center justify-between px-4 py-2 border-b border-sidebar-border">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
          Timeline
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {fmt(playhead)} / {fmt(totalDuration)}
        </div>
      </div>
      <div className="px-4 py-3">
        {/* Ruler */}
        <div
          ref={trackRef}
          onClick={handleScrub}
          className="relative h-5 cursor-pointer select-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          {Array.from({ length: Math.floor(totalDuration) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/60"
              style={{ left: `${(i / totalDuration) * 100}%` }}
            >
              <div className="h-2 w-px bg-border mb-0.5" />
              {i}s
            </div>
          ))}
          <div
            className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
            style={{ left: `${(playhead / totalDuration) * 100}%` }}
          >
            <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
          </div>
        </div>

        {/* Tracks */}
        <div className="mt-3 space-y-1.5">
          {tracks.map((t) => (
            <div
              key={t}
              className="relative h-10 rounded bg-background/50 border border-border/50"
            >
              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] tracking-widest uppercase text-muted-foreground/50 pointer-events-none">
                V{t + 1}
              </div>
              {clips
                .filter((c) => c.track === t)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "absolute top-1 bottom-1 rounded-sm px-2 text-[10px] font-medium text-left truncate transition-all",
                      selectedId === c.id
                        ? "ring-2 ring-primary ring-offset-1 ring-offset-sidebar"
                        : "ring-1 ring-border/50 hover:ring-foreground/30",
                    )}
                    style={{
                      left: `${(c.start / totalDuration) * 100}%`,
                      width: `${(c.duration / totalDuration) * 100}%`,
                      backgroundColor: c.color + "40",
                      borderLeft: `3px solid ${c.color}`,
                      color: "#fff",
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              {/* Playhead overlay */}
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/60 pointer-events-none"
                style={{ left: `${(playhead / totalDuration) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClipInspector({
  clip,
  onChange,
}: {
  clip: Clip;
  onChange: (patch: Partial<Clip>) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Name">
        <Input
          value={clip.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-8 bg-background border-border"
        />
      </Field>
      <Field label={`Start · ${clip.start.toFixed(2)}s`}>
        <Slider
          value={[clip.start]}
          min={0}
          max={30}
          step={0.1}
          onValueChange={([v]) => onChange({ start: v })}
        />
      </Field>
      <Field label={`Duration · ${clip.duration.toFixed(2)}s`}>
        <Slider
          value={[clip.duration]}
          min={0.1}
          max={20}
          step={0.1}
          onValueChange={([v]) => onChange({ duration: v })}
        />
      </Field>
      <Field label="Color">
        <div className="flex gap-1.5">
          {["#d4a574", "#a3c4a8", "#b89ec9", "#7aa8c4", "#c47a7a"].map((c) => (
            <button
              key={c}
              onClick={() => onChange({ color: c })}
              className={cn(
                "h-6 w-6 rounded-full border-2",
                clip.color === c ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Field>
      <div className="pt-4 border-t border-sidebar-border">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
          AI actions
        </div>
        <div className="space-y-1.5">
          {["Enhance", "Auto-cut to beat", "Stabilize", "Remove background"].map((a) => (
            <button
              key={a}
              className="w-full text-left rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-between"
            >
              <span>{a}</span>
              <Sparkles className="h-3 w-3 text-primary/60" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="text-center pt-12 text-xs text-muted-foreground leading-relaxed">
      <div className="mx-auto h-10 w-10 rounded-full border border-dashed border-border flex items-center justify-center mb-3">
        <Film className="h-4 w-4 opacity-40" />
      </div>
      Select a clip on the timeline to inspect and tweak it.
    </div>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const [msg, setMsg] = useState("");
  return (
    <div className="fixed right-0 top-0 h-screen w-[380px] z-40 bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs tracking-[0.25em] uppercase">Ask Monet</span>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 text-sm text-muted-foreground leading-relaxed">
        Ask Monet to edit the current project — cut to beat, color-grade, add captions. Replies
        will appear here.
      </div>
      <div className="border-t border-border p-3">
        <div className="relative">
          <Textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Tell Monet what to do…"
            className="min-h-[70px] resize-none bg-background border-border pr-12"
          />
          <Button
            size="icon"
            className="absolute right-2 bottom-2 h-7 w-7 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!msg.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
}