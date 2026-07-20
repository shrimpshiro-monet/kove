import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useDashboardStore } from "../stores/dashboard-store";
import type { Project, ReferralLink, Transaction, Referral, DashboardSettings } from "../stores/dashboard-store";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn === false) {
      window.location.href = "/sign-in";
    }
  }, [isSignedIn]);

  if (isSignedIn === false) return null;

  return <DashboardContent />;
}

function DashboardContent() {

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

type Page = "overview" | "projects" | "affiliate" | "kontracts" | "referrals" | "settings";

// ════════════════════════════════════════════════════════════════
// SVG ICONS
// ════════════════════════════════════════════════════════════════

const Icons = {
  logo: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#FF4E00" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="800" fontFamily="Inter">k</text>
    </svg>
  ),
  overview: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  projects: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  affiliate: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  earnings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  referrals: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  settings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  chevronUp: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="18 15 12 9 6 15"/></svg>,
  chevronDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="6 9 12 15 18 9"/></svg>,
  copy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>,
  plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  edit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  moreH: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  x: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════════════════

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#141414]/80 backdrop-blur-sm rounded-2xl border border-white/[0.04] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-panel-lg hover:border-white/[0.06] ${className}`}>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-[#FF4E00]/15 text-[#FF4E00]",
    paused: "bg-white/5 text-white/40",
    archived: "bg-white/5 text-white/30",
    paid: "bg-[#FF4E00]/15 text-[#FF4E00]",
    pending: "bg-[#E8C84A]/15 text-[#E8C84A]",
    processing: "bg-white/5 text-white/40",
    failed: "bg-[#E85D4A]/15 text-[#E85D4A]",
    refunded: "bg-[#E85D4A]/15 text-[#E85D4A]",
    inactive: "bg-white/5 text-white/30",
  };
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors[status] || colors.active}`}>
      {status}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/40 hover:text-white/70" title="Copy">
      {copied ? <Icons.check /> : <Icons.copy />}
    </button>
  );
}

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex bg-white/[0.04] rounded-full p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
            value === opt ? "bg-[#FF4E00] text-white" : "text-white/40 hover:text-white/60"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4 text-white/20">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-white mb-1">{title}</h3>
      <p className="text-xs text-white/25 max-w-[260px]">{desc}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════

const NAV_ITEMS: { id: Page; icon: React.FC; label: string }[] = [
  { id: "overview", icon: Icons.overview, label: "Overview" },
  { id: "projects", icon: Icons.projects, label: "Projects" },
  { id: "affiliate", icon: Icons.affiliate, label: "Affiliate" },
  { id: "kontracts", icon: Icons.earnings, label: "Kontracts" },
  { id: "referrals", icon: Icons.referrals, label: "Referrals" },
];

function Sidebar({ active, onChange }: { active: Page; onChange: (p: Page) => void }) {
  return (
    <aside className="hidden md:flex flex-col items-center w-[68px] bg-[#111111]/90 backdrop-blur-xl rounded-2xl py-4 px-2 gap-1 fixed left-4 top-4 bottom-4 z-50 shadow-float animate-slide-in-left border border-white/[0.04]">
      <div className="mb-4 p-2">
        <Icons.logo />
      </div>
      <div className="w-8 h-px bg-white/[0.06] mb-2" />
      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ id, icon: Icon, label }, i) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={label}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 animate-fade-in stagger-${Math.min(i + 1, 6)} ${
              active === id
                ? "bg-[#FF4E00] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(29,59,106,0.4)]"
                : "text-white/35 hover:text-white/70 hover:bg-white/[0.06] hover:scale-105"
            }`}
          >
            <Icon />
          </button>
        ))}
      </nav>
      <div className="w-8 h-px bg-white/[0.06] my-2" />
      <button
        onClick={() => onChange("settings")}
        title="Settings"
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
          active === "settings"
            ? "bg-[#FF4E00] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_rgba(29,59,106,0.4)]"
            : "text-white/35 hover:text-white/70 hover:bg-white/[0.06] hover:scale-105"
        }`}
      >
        <Icons.settings />
      </button>
    </aside>
  );
}

// ════════════════════════════════════════════════════════════════
// TOP BAR
// ════════════════════════════════════════════════════════════════

function TopBar({ page }: { page: Page }) {
  const titles: Record<Page, string> = {
    overview: "Overview",
    projects: "Projects",
    affiliate: "Affiliate",
    kontracts: "Kontracts",
    referrals: "Referrals",
    settings: "Settings",
  };

  return (
    <header className="flex items-center justify-between py-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">{titles[page]}</h1>
        <p className="text-xs text-white/25 mt-0.5">kove / {titles[page].toLowerCase()}</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/[0.04] transition-colors">
          <Icons.search />
        </button>
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/[0.04] transition-colors relative">
          <Icons.bell />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF4E00]" />
        </button>
        <div className="w-8 h-8 rounded-full bg-[#FF4E00] flex items-center justify-center text-xs font-bold text-white">
          H
        </div>
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════
// OVERVIEW PAGE (Post-login landing)
// ════════════════════════════════════════════════════════════════

function OverviewPage({ projects, onNavigate }: { projects: Project[]; onNavigate: (p: Page) => void }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] -mt-16">
      {/* Hero */}
      <div className="text-center mb-10 max-w-[600px]">
        <div className="inline-flex items-center gap-2 bg-[#FF4E00]/[0.08] border border-[#FF4E00]/[0.15] rounded-full px-4 py-1.5 text-[10px] font-medium text-[#FF4E00] tracking-[0.05em] uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF4E00]/60" />
          What are you creating?
        </div>
        <h1 className="text-[clamp(28px,4vw,44px)] font-bold text-white tracking-[-0.02em] leading-[1.1] mb-4">
          kreate something{" "}
          <span className="text-[#FF4E00]">unique</span>
        </h1>
        <p className="text-sm text-white/30 max-w-[420px] mx-auto leading-relaxed">
          Drop your raw footage. Tell the AI what you want. Get a beat-synced,
          color-graded, effects-laden edit — automatically.
        </p>
      </div>

      {/* Chat Input */}
      <div className="w-full max-w-[640px] mb-8">
        <div
          className={`relative h-14 rounded-2xl flex items-center px-5 overflow-hidden transition-all duration-300 ${
            focused
              ? "bg-[#141414] shadow-[0_0_0_2px_#FF4E00,0_0_30px_rgba(29,59,106,0.15)]"
              : "bg-[#111111] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.3)]"
          }`}
        >
          <svg className="w-4 h-4 mr-3 opacity-25 shrink-0" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                window.location.href = "/simple-editor";
              }
            }}
            placeholder="Describe the vibe…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-white placeholder:text-white/20"
          />
          <button
            onClick={() => { if (query.trim()) window.location.href = "/simple-editor"; }}
            className="w-8 h-8 rounded-xl bg-[#FF4E00] border-none cursor-pointer flex items-center justify-center ml-3 shrink-0 transition-colors hover:bg-[#FF4E00]"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="white">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {["Cinematic sports edit", "Smooth travel montage", "High-energy gym edit", "Moody music video"].map((s) => (
            <button
              key={s}
              onClick={() => { setQuery(s); window.location.href = "/simple-editor"; }}
              className="text-[11px] px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-white/25 hover:text-white/50 hover:bg-white/[0.06] transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Projects */}
      <div className="w-full max-w-[640px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white/30 tracking-wide">Recent projects</h3>
          <button onClick={() => onNavigate("projects")} className="text-[11px] text-white/20 hover:text-white/40 transition-colors">View all</button>
        </div>
        <div className="space-y-1">
          {projects.slice(0, 3).map((p) => (
            <button
              key={p.id}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all text-left group"
            >
              <div className="w-10 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${p.thumbnailColor || "#FF4E00"}20` }}>
                <svg className="w-3.5 h-3.5" style={{ color: p.thumbnailColor || "#FF4E00" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/60 truncate group-hover:text-white/80 transition-colors">{p.name}</div>
                <div className="text-[10px] text-white/20">{p.clips} clips · {p.duration}</div>
              </div>
              <div className="text-[10px] text-white/15 font-mono">
                {formatRelativeTime(p.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PROJECTS PAGE
// ════════════════════════════════════════════════════════════════

function ProjectsPage({ projects, onAdd, onDelete, onRename }: {
  projects: Project[];
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("All");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const filtered = projects.filter((p) => {
    if (filter === "All") return true;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-bold text-white tracking-tight">Projects</h2>
          <p className="text-sm text-white/30 mt-1">{projects.length} project{projects.length !== 1 ? "s" : ""} in your workspace.</p>
        </div>
        <button
          onClick={() => navigate({ to: "/simple-editor" })}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-[4px] text-sm font-semibold transition-all hover:bg-primary-hover shrink-0 font-mono"
        >
          <Icons.plus /> NEW PROJECT
        </button>
      </div>

      {showNew && (
        <Panel className="p-4">
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  onAdd(newName.trim());
                  setNewName("");
                  setShowNew(false);
                }
                if (e.key === "Escape") setShowNew(false);
              }}
              placeholder="Project name…"
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF4E00]"
            />
            <button
              onClick={() => { if (newName.trim()) { onAdd(newName.trim()); setNewName(""); setShowNew(false); } }}
              className="px-4 py-2.5 rounded-xl bg-[#FF4E00] text-white text-sm font-medium hover:bg-[#FF4E00] transition-colors"
            >
              Create
            </button>
            <button onClick={() => setShowNew(false)} className="text-white/30 hover:text-white/60 transition-colors">
              <Icons.x />
            </button>
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-sm font-bold text-white">All projects</h3>
          <Segmented options={["All", "Recent", "Oldest"]} value={filter} onChange={setFilter} />
        </div>
        {projects.length === 0 ? (
          <EmptyState
            icon={<Icons.projects />}
            title="No projects yet"
            desc="Create your first project from the overview or by typing a prompt."
          />
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-6">Project</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Clips</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Duration</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Updated</th>
                  <th className="pb-3 px-4 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-6">
                      {editingId === p.id ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => { if (draft.trim()) onRename(p.id, draft.trim()); setEditingId(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { if (draft.trim()) onRename(p.id, draft.trim()); setEditingId(null); }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="bg-white/[0.04] border border-[#FF4E00] rounded-lg px-3 py-1 text-sm text-white focus:outline-none w-full max-w-[300px]"
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-6 rounded flex items-center justify-center" style={{ backgroundColor: `${p.thumbnailColor || "#FF4E00"}20` }}>
                            <svg className="w-3 h-3" style={{ color: p.thumbnailColor || "#FF4E00" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                            </svg>
                          </div>
                          <span className="text-white/70 font-medium">{p.name}</span>
                        </div>
                      )}
                    </td>
                    <td className="text-right py-3 px-4 text-white/50 tabular-nums">{p.clips}</td>
                    <td className="text-right py-3 px-4 text-white/50 tabular-nums">{p.duration}</td>
                    <td className="text-right py-3 px-4 text-white/30 text-xs font-mono">{formatRelativeTime(p.updatedAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditingId(p.id); setDraft(p.name); }}
                          className="p-1 rounded hover:bg-white/5 text-white/20 hover:text-white/50 transition-colors"
                          title="Rename"
                        >
                          <Icons.edit />
                        </button>
                        <button
                          onClick={() => onDelete(p.id)}
                          className="p-1 rounded hover:bg-white/5 text-white/20 hover:text-[#E85D4A] transition-colors"
                          title="Delete"
                        >
                          <Icons.trash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// AFFILIATE PAGE
// ════════════════════════════════════════════════════════════════

function AffiliatePage({ links, onAdd, onUpdateStatus, onDelete }: {
  links: ReferralLink[];
  onAdd: (name: string, slug: string) => void;
  onUpdateStatus: (id: string, status: ReferralLink["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const [linkFilter, setLinkFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const totalClicks = links.reduce((s, l) => s + l.clicks, 0);
  const totalSignups = links.reduce((s, l) => s + l.signups, 0);
  const conv = totalClicks > 0 ? ((totalSignups / totalClicks) * 100).toFixed(1) + "%" : "0%";
  const totalCommission = links.reduce((s, l) => s + parseFloat(l.commission.replace(/[^0-9.]/g, "")), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-bold text-white tracking-tight">Affiliate</h2>
          <p className="text-sm text-white/30 mt-1">Track your referral performance and manage links.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-[#FF4E00] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-[#FF4E00] hover:-translate-y-0.5 shrink-0"
        >
          <Icons.plus /> Create link
        </button>
      </div>

      {showNew && (
        <Panel className="p-4">
          <div className="flex items-center gap-3">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Link name…" className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF4E00]" />
            <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="kove.to/your-slug" className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF4E00] font-mono" />
            <button onClick={() => { if (newName.trim() && newSlug.trim()) { onAdd(newName.trim(), newSlug.trim()); setNewName(""); setNewSlug(""); setShowNew(false); } }} className="px-4 py-2.5 rounded-xl bg-[#FF4E00] text-white text-sm font-medium hover:bg-[#FF4E00] transition-colors">Create</button>
            <button onClick={() => setShowNew(false)} className="text-white/30 hover:text-white/60 transition-colors"><Icons.x /></button>
          </div>
        </Panel>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "TOTAL CLICKS", value: totalClicks.toLocaleString() },
          { label: "SIGNUPS", value: totalSignups.toString() },
          { label: "CONVERSION", value: conv },
          { label: "TOTAL COMMISSION", value: `$${totalCommission.toLocaleString()}` },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[#141414] rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-white/30 mb-2">{kpi.label}</div>
            <div className="text-[28px] font-bold tracking-[-0.02em] text-white tabular-nums">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Links Table */}
      <Panel>
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-sm font-bold text-white">Your links</h3>
          <Segmented options={["All", "Active", "Archived"]} value={linkFilter} onChange={setLinkFilter} />
        </div>
        {links.length === 0 ? (
          <EmptyState icon={<Icons.affiliate />} title="No referral links" desc="Create your first link to start earning commissions." />
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-6">Link</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Clicks</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Signups</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Conv.</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Earned</th>
                  <th className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Status</th>
                  <th className="pb-3 px-4 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {links.filter((l) => linkFilter === "All" || l.status === linkFilter.toLowerCase()).map((link) => (
                  <tr key={link.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-6">
                      <div className="font-medium text-white/70">{link.name}</div>
                      <div className="text-xs text-white/25 font-mono flex items-center gap-1.5 mt-0.5">
                        {link.slug} <CopyButton text={link.slug} />
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 text-white/50 tabular-nums">{link.clicks.toLocaleString()}</td>
                    <td className="text-right py-3 px-4 text-white/50 tabular-nums">{link.signups}</td>
                    <td className="text-right py-3 px-4 text-white/50 tabular-nums">{link.conversion}</td>
                    <td className="text-right py-3 px-4 text-white/60 font-semibold tabular-nums">{link.commission}</td>
                    <td className="text-center py-3 px-4"><StatusPill status={link.status} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onUpdateStatus(link.id, link.status === "active" ? "paused" : "active")}
                          className="p-1 rounded hover:bg-white/5 text-white/20 hover:text-white/50 transition-colors"
                          title={link.status === "active" ? "Pause" : "Activate"}
                        >
                          {link.status === "active" ? "⏸" : "▶"}
                        </button>
                        <button onClick={() => onDelete(link.id)} className="p-1 rounded hover:bg-white/5 text-white/20 hover:text-[#E85D4A] transition-colors" title="Delete">
                          <Icons.trash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// KONTRACTS PAGE
// ════════════════════════════════════════════════════════════════

type KontractsTab = "commissions" | "payouts";

function KontractsPage({ store }: { store: ReturnType<typeof useDashboardStore> }) {
  const [tab, setTab] = useState<KontractsTab>("commissions");
  const [txFilter, setTxFilter] = useState("All");
  const { state, totalEarnedThisMonth, pendingBalance, lifetimeEarnings, totalPaidOut } = store;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-bold text-white tracking-tight">Kontracts</h2>
          <p className="text-sm text-white/30 mt-1">Your earnings, payouts, and financial history.</p>
        </div>
        <button className="flex items-center gap-2 bg-[#FF4E00] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-[#FF4E00] hover:-translate-y-0.5 shrink-0">
          Request payout
        </button>
      </div>

      <div className="flex bg-white/[0.04] rounded-full p-0.5 w-fit">
        {(["commissions", "payouts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 capitalize ${tab === t ? "bg-[#FF4E00] text-white" : "text-white/40 hover:text-white/60"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "commissions" ? (
        <>
          {/* Monthly Summary */}
          <Panel className="p-6">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mb-1">Earned this month</div>
                <div className="text-[40px] font-bold text-white tracking-tight tabular-nums leading-none">${totalEarnedThisMonth.toFixed(2)}</div>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="flex items-center gap-1 text-xs font-medium text-[#FF4E00]">
                    <Icons.chevronUp /> +12.4%
                  </span>
                  <span className="text-xs text-white/20">vs last month</span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-6 border-l border-white/[0.04] pl-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/25 mb-0.5">Referrals</div>
                  <div className="text-lg font-bold text-white tabular-nums">{state.referrals.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/25 mb-0.5">Pending</div>
                  <div className="text-lg font-bold text-[#E8C84A] tabular-nums">${pendingBalance.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </Panel>

          {/* Balance Hero */}
          <Panel className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.04]">
              <div className="flex flex-col gap-2 py-4 md:py-0 md:px-6 first:md:pl-0 last:md:pr-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">Available</div>
                <div className="text-[32px] font-bold text-white tracking-tight tabular-nums">${lifetimeEarnings.toFixed(2)}</div>
                <div className="text-xs text-white/20">Total earned</div>
              </div>
              <div className="flex flex-col gap-2 py-4 md:py-0 md:px-6">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">Paid out</div>
                <div className="text-[32px] font-bold text-white tracking-tight tabular-nums">${totalPaidOut.toFixed(2)}</div>
                <div className="text-xs text-white/20">{state.payouts.length} payouts</div>
              </div>
              <div className="flex flex-col gap-2 py-4 md:py-0 md:px-6">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">Pending</div>
                <div className="text-[32px] font-bold text-[#E8C84A] tracking-tight tabular-nums">${pendingBalance.toFixed(2)}</div>
                <div className="text-xs text-white/20">Clears soon</div>
              </div>
            </div>
          </Panel>

          {/* Transactions */}
          <Panel>
            <div className="flex items-center justify-between p-6 pb-0">
              <h3 className="text-sm font-bold text-white">Transactions</h3>
              <div className="flex items-center gap-3">
                <Segmented options={["All", "Earned", "Paid", "Pending"]} value={txFilter} onChange={setTxFilter} />
                <button className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
                  <Icons.download /> Export CSV
                </button>
              </div>
            </div>
            {state.transactions.length === 0 ? (
              <EmptyState icon={<Icons.earnings />} title="No transactions yet" desc="Commissions will appear here as referrals convert." />
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-6">Date</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Source</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Type</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Amount</th>
                      <th className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Status</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.transactions.filter((t) => txFilter === "All" || t.status === txFilter.toLowerCase()).map((tx) => (
                      <tr key={tx.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer">
                        <td className="py-3 px-6 text-white/40 font-mono text-xs">{tx.date}</td>
                        <td className="py-3 px-4 text-white/60">{tx.source}</td>
                        <td className="py-3 px-4 text-white/40">{tx.type}</td>
                        <td className={`text-right py-3 px-4 font-semibold tabular-nums ${tx.amount.startsWith("+") ? "text-[#FF4E00]" : "text-white/50"}`}>
                          {tx.amount}
                        </td>
                        <td className="text-center py-3 px-4"><StatusPill status={tx.status} /></td>
                        <td className="py-3 px-4 text-white/20 font-mono text-xs">{tx.refId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : (
        <>
          {/* Payout History */}
          <Panel>
            <div className="flex items-center justify-between p-6 pb-0">
              <h3 className="text-sm font-bold text-white">Payout history</h3>
              <button className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
                <Icons.download /> Export CSV
              </button>
            </div>
            {state.payouts.length === 0 ? (
              <EmptyState icon={<Icons.earnings />} title="No payouts yet" desc="Payouts will appear here once you reach the minimum threshold." />
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-6">Date</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Batch</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Amount</th>
                      <th className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Status</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payouts.map((p) => (
                      <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer">
                        <td className="py-3 px-6 text-white/40 font-mono text-xs">{p.date}</td>
                        <td className="py-3 px-4 text-white/60">{p.batch}</td>
                        <td className="text-right py-3 px-4 font-semibold text-[#FF4E00] tabular-nums">{p.amount}</td>
                        <td className="text-center py-3 px-4"><StatusPill status={p.status} /></td>
                        <td className="py-3 px-4 text-white/40 font-mono text-xs">{p.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Payout Method */}
          <Panel className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Payout method</h3>
              <button className="text-xs text-white/30 hover:text-white/60 transition-colors">Edit</button>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-xs font-bold text-white/30">S</div>
                <div>
                  <div className="text-sm text-white/60">{state.settings.payoutMethod}</div>
                  <div className="text-xs text-white/25 font-mono">•••• {state.settings.payoutLast4}</div>
                </div>
              </div>
              <StatusPill status="active" />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-xs text-white/25">Payout frequency</div>
                <div className="text-sm text-white/60">{state.settings.payoutFrequency}</div>
              </div>
              <button className="text-xs text-white/30 hover:text-white/60 transition-colors">Manage settings</button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// REFERRALS PAGE
// ════════════════════════════════════════════════════════════════

function ReferralsPage({ referrals, onDelete }: { referrals: Referral[]; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState("All");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-bold text-white tracking-tight">Referrals</h2>
          <p className="text-sm text-white/30 mt-1">{referrals.length} referred user{referrals.length !== 1 ? "s" : ""} in your network.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "ACTIVE", value: referrals.filter((r) => r.status === "active").length.toString() },
          { label: "INACTIVE", value: referrals.filter((r) => r.status === "inactive").length.toString() },
          { label: "TOTAL COMMISSION", value: `$${referrals.reduce((s, r) => s + parseFloat(r.totalCommission.replace(/[^0-9.]/g, "")), 0).toLocaleString()}` },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[#141414] rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-white/30 mb-2">{kpi.label}</div>
            <div className="text-[28px] font-bold tracking-[-0.02em] text-white tabular-nums">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <Panel>
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-sm font-bold text-white">All referrals</h3>
          <Segmented options={["All", "Active", "Inactive"]} value={filter} onChange={setFilter} />
        </div>
        {referrals.length === 0 ? (
          <EmptyState icon={<Icons.referrals />} title="No referrals yet" desc="Share your affiliate link to start referring users." />
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-6">User</th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Joined</th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Commission</th>
                  <th className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/25 pb-3 px-4">Status</th>
                  <th className="pb-3 px-4 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {referrals.filter((r) => filter === "All" || r.status === filter.toLowerCase()).map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] font-bold text-white/30">
                          {r.name[1]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="font-medium text-white/70">{r.name}</div>
                          <div className="text-xs text-white/25 font-mono">{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-white/40 text-xs font-mono">{formatRelativeTime(r.joinedAt)}</td>
                    <td className="text-right py-3 px-4 text-white/60 font-semibold tabular-nums">{r.totalCommission}</td>
                    <td className="text-center py-3 px-4"><StatusPill status={r.status} /></td>
                    <td className="py-3 px-4">
                      <button onClick={() => onDelete(r.id)} className="p-1 rounded hover:bg-white/5 text-white/20 hover:text-[#E85D4A] transition-colors" title="Remove">
                        <Icons.trash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ════════════════════════════════════════════════════════════════

function SettingsPage({ settings, onUpdate }: { settings: DashboardSettings; onUpdate: (p: Partial<DashboardSettings>) => void }) {
  const [draft, setDraft] = useState(settings);

  const handleSave = () => {
    onUpdate(draft);
  };

  return (
    <div className="flex flex-col gap-6 max-w-[640px]">
      <div>
        <h2 className="text-[28px] font-bold text-white tracking-tight">Settings</h2>
        <p className="text-sm text-white/30 mt-1">Manage your account and preferences.</p>
      </div>

      {/* Profile */}
      <Panel className="p-6">
        <h3 className="text-sm font-bold text-white mb-4">Profile</h3>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-1.5 block">Username</label>
            <input
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF4E00]"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-1.5 block">Email</label>
            <input
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF4E00]"
            />
          </div>
        </div>
      </Panel>

      {/* Editor Preference */}
      <Panel className="p-6">
        <h3 className="text-sm font-bold text-white mb-4">Editor preference</h3>
        <p className="text-xs text-white/25 mb-4">Choose which editor opens by default when you start a new project.</p>
        <div className="flex gap-3">
          {(["simple", "studio"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setDraft({ ...draft, defaultEditor: mode })}
              className={`flex-1 py-4 rounded-xl border text-sm font-medium transition-all ${
                draft.defaultEditor === mode
                  ? "bg-[#FF4E00]/20 border-[#FF4E00] text-white"
                  : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/[0.12]"
              }`}
            >
              <div className="text-lg font-bold capitalize mb-1">{mode}</div>
              <div className="text-[11px] text-white/30">
                {mode === "simple" ? "AI-directed, chat-first" : "Manual NLE, full control"}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {/* Danger Zone */}
      <Panel className="p-6 border border-[#E85D4A]/20">
        <h3 className="text-sm font-bold text-[#E85D4A] mb-2">Danger zone</h3>
        <p className="text-xs text-white/25 mb-4">Permanently delete your account and all data. This cannot be undone.</p>
        <button className="px-4 py-2 rounded-xl border border-[#E85D4A]/30 text-[#E85D4A] text-xs font-medium hover:bg-[#E85D4A]/10 transition-colors">
          Delete account
        </button>
      </Panel>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-[#FF4E00] text-white text-sm font-semibold hover:bg-[#FF4E00] transition-colors"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════════

function DashboardContent() {
  const [page, setPage] = useState<Page>("overview");
  const store = useDashboardStore();

  const renderPage = () => {
    switch (page) {
      case "overview": return <OverviewPage projects={store.state.projects} onNavigate={setPage} />;
      case "projects": return <ProjectsPage projects={store.state.projects} onAdd={store.addProject} onDelete={store.deleteProject} onRename={store.renameProject} />;
      case "affiliate": return <AffiliatePage links={store.state.referralLinks} onAdd={store.addReferralLink} onUpdateStatus={store.updateLinkStatus} onDelete={store.deleteReferralLink} />;
      case "kontracts": return <KontractsPage store={store} />;
      case "referrals": return <ReferralsPage referrals={store.state.referrals} onDelete={store.deleteReferral} />;
      case "settings": return <SettingsPage settings={store.state.settings} onUpdate={store.updateSettings} />;
      default: return <OverviewPage projects={store.state.projects} onNavigate={setPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans relative overflow-hidden">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#FF4E00]/[0.04] rounded-full blur-[120px] pointer-events-none" />

      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[100] opacity-[0.012]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundSize: "256px 256px",
        }}
      />

      <Sidebar active={page} onChange={setPage} />

      <main className="md:ml-[84px] p-4 md:p-6 lg:p-8 min-h-screen animate-fade-in">
        <TopBar page={page} />
        <div key={page} className="animate-slide-up">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
