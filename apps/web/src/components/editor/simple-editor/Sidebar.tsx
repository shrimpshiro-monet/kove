import React, { useState, useEffect } from "react";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  onNewCut: () => void;
}

interface RecentProject {
  id: string;
  name: string;
  timestamp: number;
}

const STORAGE_KEY = "kove-dashboard";

function loadRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return (data.projects || []).slice(0, 6).map((p: any) => ({
        id: p.id,
        name: p.name,
        timestamp: p.updatedAt || p.createdAt || Date.now(),
      }));
    }
  } catch {}
  return [
    { id: "1", name: "Steph Curry highlight reel", timestamp: Date.now() - 120000 },
    { id: "2", name: "Gym edit — drop night", timestamp: Date.now() - 3600000 },
    { id: "3", name: "Travel montage Bali", timestamp: Date.now() - 86400000 },
    { id: "4", name: "Product unboxing", timestamp: Date.now() - 172800000 },
  ];
}

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const NAV_ITEMS = [
  {
    label: "New Cut",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
    primary: true,
  },
  {
    label: "All Projects",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    label: "Templates",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    tag: "PRO",
  },
  {
    label: "Statistics",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0116.5 19.875V4.125z" />
      </svg>
    ),
    tag: "PRO",
  },
  {
    label: "Trash",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    ),
  },
];

const THUMBNAIL_COLORS = ["#FF4E00", "#B5B0A6", "#E8C84A", "#E85D4A", "#27C93F", "#9B59B6"];

export function Sidebar({ open, onToggle, onNewCut }: SidebarProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    setRecentProjects(loadRecentProjects());
    const interval = setInterval(() => setRecentProjects(loadRecentProjects()), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside
      className={`flex flex-col h-full bg-sidebar/90 backdrop-blur-xl border-r border-sidebar-border shrink-0 transition-all duration-300 ease-out animate-slide-in-left ${
        open ? "w-[260px]" : "w-[60px]"
      }`}
    >
      {/* Brand block */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        {open ? (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-[4px] bg-primary flex items-center justify-center text-[11px] font-black text-primary-foreground">
                K
              </div>
              <span className="text-sm font-bold tracking-tight text-sidebar-foreground">Kove</span>
            </div>
            <button
              onClick={onToggle}
              className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200 hover:scale-110"
              aria-label="Collapse sidebar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-[4px] bg-primary flex items-center justify-center text-[11px] font-black text-primary-foreground mx-auto transition-all hover:bg-primary-hover"
            aria-label="Expand sidebar"
          >
            K
          </button>
        )}
      </div>

      {/* Primary nav */}
      <nav className="px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map((item, i) => (
          <button
            key={item.label}
            onClick={item.primary ? onNewCut : undefined}
            className={`w-full flex items-center gap-2.5 rounded-lg transition-all duration-200 animate-fade-in ${
              open ? "px-3 py-2" : "px-0 py-2 justify-center"
            } ${
              item.primary
                ? "bg-primary/10 text-primary hover:bg-primary/20 font-medium"
                : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-0.5"
            }`}
            style={{ animationDelay: `${i * 0.05}s` }}
            title={!open ? item.label : undefined}
          >
            {item.icon}
            {open && (
              <>
                <span className="text-[13px] flex-1 text-left">{item.label}</span>
                {item.tag && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/10 text-white/40 border border-white/[0.06]">
                    {item.tag}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      {/* Recent projects */}
      {open && (
        <div className="flex-1 overflow-auto px-3 py-2">
          <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-sidebar-foreground/30 mb-2 px-1">
            Recent
          </div>
          <div className="space-y-0.5">
            {recentProjects.map((p, i) => (
              <button
                key={p.id}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-all duration-200 text-left group animate-fade-in"
                style={{ animationDelay: `${0.15 + i * 0.04}s` }}
              >
                <div
                  className="w-8 h-6 rounded-md shrink-0 flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: `${THUMBNAIL_COLORS[i % THUMBNAIL_COLORS.length]}20` }}
                >
                  <svg
                    className="w-3 h-3"
                    style={{ color: THUMBNAIL_COLORS[i % THUMBNAIL_COLORS.length] }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-sidebar-foreground/70 truncate group-hover:text-sidebar-foreground transition-colors duration-200">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-sidebar-foreground/30">
                    {formatTime(p.timestamp)}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button className="w-full text-[11px] text-sidebar-foreground/30 hover:text-sidebar-foreground/50 mt-2 px-2 py-1 transition-colors text-left">
            View all →
          </button>
        </div>
      )}

      {/* Upgrade card */}
      {open && (
        <div className="px-3 pb-2">
          <div className="rounded-[4px] bg-background-tertiary p-4 border border-border">
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="text-[13px] font-semibold text-white">Pro Plan</span>
            </div>
            <p className="text-[11px] text-white/50 mb-3">Unlimited generations. Advanced control.</p>
            <button className="w-full py-2 rounded-[4px] bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary-hover transition-all duration-200 active:scale-[0.98]">
              Upgrade — $19/mo
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={`border-t border-sidebar-border px-3 py-2.5 ${open ? "" : "flex justify-center"}`}>
        {open ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-[11px] font-semibold text-sidebar-foreground/60 border border-white/[0.06]">
              H
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-sidebar-foreground/70 truncate">Hamza</div>
            </div>
            <button className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/30 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200" aria-label="Settings">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        ) : (
          <button className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-[11px] font-semibold text-sidebar-foreground/60 border border-white/[0.06]" aria-label="User menu">
            H
          </button>
        )}
      </div>
    </aside>
  );
}
