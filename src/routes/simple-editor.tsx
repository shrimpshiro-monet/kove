import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { useChatThreads, type ChatMessage, type ChatThread } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/simple-editor")({
  component: SimpleEditor,
});

// ─── Typewriter Boot Sequence ───────────────────────────────────────────────────
const BOOT_LINES = [
  "print('______________________________________________')",
  "print('kove ai director v0.1.0')",
  "print('initializing pipeline...')",
  "print('loading reference analyzer...')",
  "print('connecting to render workers...')",
  "print('ready.')",
  "",
];

function useBootSequence() {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const lineIdx = useRef(0);
  const charIdx = useRef(0);
  const currentLine = useRef("");

  useEffect(() => {
    if (done) return;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const full = BOOT_LINES[lineIdx.current];
      if (full === undefined) {
        setDone(true);
        return;
      }

      // empty line = instant
      if (full === "") {
        setLines((prev) => [...prev, ""]);
        lineIdx.current++;
        charIdx.current = 0;
        timer = setTimeout(tick, 200);
        return;
      }

      charIdx.current++;
      currentLine.current = full.slice(0, charIdx.current);
      setLines((prev) => {
        const next = [...prev];
        next[next.length - 1] = currentLine.current;
        return next;
      });

      if (charIdx.current >= full.length) {
        lineIdx.current++;
        charIdx.current = 0;
        currentLine.current = "";
        timer = setTimeout(tick, 400);
      } else {
        timer = setTimeout(tick, 18 + Math.random() * 12);
      }
    };

    // seed first line
    setLines([""]);
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [done]);

  return { lines, done };
}

// ─── Kanban Columns ──────────────────────────────────────────────────────────────
type Stage = "footage" | "analysis" | "edit" | "export";

interface KanbanCard {
  id: string;
  title: string;
  desc: string;
  tags: string[];
  stage: Stage;
}

const STAGE_CONFIG: Record<Stage, { label: string; color: string; icon: string }> = {
  footage:   { label: "Footage",   color: "#3b82f6", icon: "🎬" },
  analysis:  { label: "Analysis",  color: "#a855f7", icon: "🔍" },
  edit:      { label: "Edit",      color: "#FF4E00", icon: "✂️" },
  export:    { label: "Export",    color: "#22c55e", icon: "📦" },
};

const DEMO_CARDS: KanbanCard[] = [
  { id: "1", title: "Raw clip — intro",   desc: "15s establishing shot, handheld",      tags: ["raw"],         stage: "footage" },
  { id: "2", title: "Raw clip — action",  desc: "32s action sequence, 4K 60fps",        tags: ["raw"],         stage: "footage" },
  { id: "3", title: "Scene detection",    desc: "8 cuts identified, beat-synced",       tags: ["auto"],        stage: "analysis" },
  { id: "4", title: "Energy mapping",     desc: "Motion + brightness curves generated", tags: ["auto"],        stage: "analysis" },
  { id: "5", title: "Beat-sync EDL",      desc: "12 shots, 87% beat alignment",         tags: ["generated"],   stage: "edit" },
  { id: "6", title: "Color grade",        desc: "Warm tones, lifted shadows",           tags: ["effect"],      stage: "edit" },
  { id: "7", title: "Final render",       desc: "1080p MP4, H.264",                     tags: ["queued"],      stage: "export" },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────────
const WORKSPACES = [
  { id: "default", name: "My First Edit", icon: "📁" },
  { id: "sports",  name: "Sports Highlights", icon: "⚡" },
  { id: "music",   name: "Music Video", icon: "🎵" },
];

function Sidebar({ activeWorkspace, onSelect }: { activeWorkspace: string; onSelect: (id: string) => void }) {
  return (
    <aside className="w-[220px] h-full bg-[#fafafa] border-r border-black/[0.06] flex flex-col text-[13px] shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2 border-b border-black/[0.06]">
        <div className="w-7 h-7 rounded-lg bg-[#FF4E00] flex items-center justify-center text-white text-xs font-bold">k</div>
        <span className="font-semibold text-black tracking-tight">kove</span>
        <span className="ml-auto text-[10px] text-black/30 font-mono">v0.1</span>
      </div>

      {/* Nav */}
      <div className="px-3 py-3 flex flex-col gap-0.5">
        <SidebarItem icon="📥" label="Inbox" active={false} />
        <SidebarItem icon="💬" label="Chat" active={false} />
      </div>

      <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/30">Workspaces</div>
      <div className="px-3 flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {WORKSPACES.map((ws) => (
          <SidebarItem
            key={ws.id}
            icon={ws.icon}
            label={ws.name}
            active={activeWorkspace === ws.id}
            onClick={() => onSelect(ws.id)}
          />
        ))}
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-md text-black/30 hover:text-black/60 hover:bg-black/[0.03] transition-colors text-left">
          <span className="w-5 text-center text-xs">+</span>
          <span>Add a workspace</span>
        </button>
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-black/[0.06] flex flex-col gap-0.5">
        <SidebarItem icon="🎨" label="Brand" active={false} />
        <SidebarItem icon="❓" label="Help & Support" active={false} />
      </div>
    </aside>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors w-full",
        active
          ? "bg-[#FF4E00]/10 text-[#FF4E00] font-medium"
          : "text-black/60 hover:bg-black/[0.04] hover:text-black"
      )}
    >
      <span className="w-5 text-center text-xs">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Kanban Board ────────────────────────────────────────────────────────────────
function KanbanBoard({ cards }: { cards: KanbanCard[] }) {
  const stages: Stage[] = ["footage", "analysis", "edit", "export"];

  return (
    <div className="flex-1 h-full overflow-x-auto overflow-y-hidden">
      <div className="flex gap-4 p-5 h-full min-w-max">
        {stages.map((stage) => {
          const config = STAGE_CONFIG[stage];
          const stageCards = cards.filter((c) => c.stage === stage);

          return (
            <div key={stage} className="w-[260px] flex flex-col h-full shrink-0">
              {/* Column Header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-sm">{config.icon}</span>
                <span className="text-[13px] font-semibold text-black">{config.label}</span>
                <span className="text-[11px] text-black/30 font-mono ml-1">{stageCards.length}</span>
                <button className="ml-auto text-black/20 hover:text-black/50 transition-colors text-lg leading-none">+</button>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {stageCards.map((card) => (
                  <KanbanCardItem key={card.id} card={card} />
                ))}
                {stageCards.length === 0 && (
                  <div className="border border-dashed border-black/10 rounded-xl p-6 text-center text-[11px] text-black/25">
                    Drop files here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCardItem({ card }: { card: KanbanCard }) {
  const config = STAGE_CONFIG[card.stage];
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 hover:shadow-md hover:border-black/[0.1] transition-all cursor-pointer group">
      <h4 className="text-[13px] font-semibold text-black mb-1.5 leading-snug">{card.title}</h4>
      <p className="text-[11px] text-black/40 leading-relaxed mb-3">{card.desc}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {card.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/[0.04] text-black/40"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Chat Panel ──────────────────────────────────────────────────────────────────
function ChatPanel({ thread, onSend }: { thread: ChatThread | undefined; onSend: (msg: string) => void }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = thread?.messages ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    onSend(msg);
    setInput("");
  }, [input, onSend]);

  return (
    <div className="w-[380px] h-full flex flex-col bg-[#fafafa] border-l border-black/[0.06] shrink-0">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-black">Director</span>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
        <button className="text-[11px] text-black/30 hover:text-black/60 transition-colors font-medium">
          Clear Chat
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#FF4E00]/10 flex items-center justify-center mb-3 text-lg">🎬</div>
            <p className="text-[13px] font-medium text-black/60 mb-1">Start editing</p>
            <p className="text-[11px] text-black/30 max-w-[220px]">
              Drop footage or describe what you want to create. The AI director will handle the rest.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3">
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                msg.role === "user"
                  ? "bg-[#FF4E00] text-white"
                  : "bg-black/5 text-black/40"
              )}
            >
              {msg.role === "user" ? "JS" : "k"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-black/50 mb-1">
                {msg.role === "user" ? "You" : "kove"}
              </div>
              <div className="text-[13px] text-black/70 leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Typing indicator area */}
      <div className="px-4 h-6 flex items-center">
        <span className="text-[11px] text-black/25 font-mono animate-pulse">thinking...</span>
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex items-center bg-white rounded-xl border border-black/[0.08] px-3 py-2 focus-within:border-[#FF4E00]/40 focus-within:shadow-[0_0_0_3px_rgba(255,78,0,0.06)] transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Send a message to the director..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-black placeholder:text-black/25"
          />
          <button
            onClick={handleSend}
            className="w-7 h-7 rounded-lg bg-[#FF4E00] text-white flex items-center justify-center shrink-0 ml-2 hover:bg-[#e64500] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────────
function SimpleEditor() {
  const { isSignedIn } = useAuth();
  const { threads, createThread } = useChatThreads();
  const { lines, done } = useBootSequence();
  const [activeWorkspace, setActiveWorkspace] = useState("default");
  const [showUI, setShowUI] = useState(false);

  useEffect(() => {
    if (isSignedIn === false) {
      window.location.href = "/sign-in";
    }
  }, [isSignedIn]);

  // Delay UI reveal after boot
  useEffect(() => {
    if (done) {
      const t = setTimeout(() => setShowUI(true), 300);
      return () => clearTimeout(t);
    }
  }, [done]);

  const handleSend = useCallback((msg: string) => {
    // stub — wire to real pipeline later
    console.log("[simple-editor] send:", msg);
  }, []);

  if (isSignedIn === false) return null;

  return (
    <div className="h-screen flex bg-[#fafafa] text-black overflow-hidden font-sans">
      {/* Sidebar */}
      <Sidebar activeWorkspace={activeWorkspace} onSelect={setActiveWorkspace} />

      {/* Center content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header — typewriter then real */}
        <header className="h-12 border-b border-black/[0.06] flex items-center px-5 gap-3 bg-white/60 backdrop-blur-sm shrink-0">
          {!showUI ? (
            <div className="flex-1 font-mono text-[12px] text-black/50 overflow-hidden">
              {lines.map((line, i) => (
                <div key={i} className="leading-6 whitespace-pre">
                  <span className="text-green-600/60">&gt; </span>
                  {line}
                  {i === lines.length - 1 && <span className="animate-pulse">▊</span>}
                </div>
              ))}
            </div>
          ) : (
            <>
              <h1 className="text-[14px] font-semibold text-black">
                {WORKSPACES.find((w) => w.id === activeWorkspace)?.name ?? "My First Edit"}
              </h1>
              <div className="flex items-center gap-1.5 ml-3">
                <div className="w-5 h-5 rounded-full bg-[#FF4E00] flex items-center justify-center text-[8px] font-bold text-white">JS</div>
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[8px] font-bold text-white">AI</div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <HeaderBtn icon="☰" />
                <HeaderBtn icon="⊞" />
                <HeaderBtn icon="◫" />
                <HeaderBtn icon="⋯" />
              </div>
            </>
          )}
        </header>

        {/* Kanban */}
        {showUI && <KanbanBoard cards={DEMO_CARDS} />}
      </div>

      {/* Right chat */}
      {showUI && <ChatPanel thread={threads[0]} onSend={handleSend} />}
    </div>
  );
}

function HeaderBtn({ icon }: { icon: string }) {
  return (
    <button className="w-7 h-7 rounded-md flex items-center justify-center text-black/30 hover:text-black/60 hover:bg-black/[0.04] transition-colors text-sm">
      {icon}
    </button>
  );
}
