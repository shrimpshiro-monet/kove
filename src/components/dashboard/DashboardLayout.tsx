import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "./Icons";
import { Sidebar, type NavItem } from "./Sidebar";

interface TopBarProps {
  isSignedIn: boolean;
  username?: string;
}

function TopBar({ isSignedIn, username }: TopBarProps) {
  return (
    <header className="flex items-center justify-end py-4 mb-6 gap-3">
      <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] transition-colors">
        <Icons.search className="w-4 h-4" />
      </button>
      {isSignedIn ? (
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-white">
          {username?.[0]?.toUpperCase() || "?"}
        </div>
      ) : (
        <a
          href="/sign-in"
          className="text-xs px-4 py-2 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-all"
        >
          Log in
        </a>
      )}
    </header>
  );
}

interface DashboardLayoutProps {
  children: ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  navItems: NavItem[];
  isSignedIn: boolean;
  username?: string;
}

export function DashboardLayout({
  children,
  activePage,
  onNavigate,
  navItems,
  isSignedIn,
  username,
}: DashboardLayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div className={cn("min-h-screen text-[var(--text-primary)] font-sans relative overflow-hidden")}>
      {/* Ocean tide — jalebis floating */}
      <div className="ocean-tide">
        <svg className="jalebi-tide" viewBox="0 0 1440 160" preserveAspectRatio="xMidYMax slice" fill="none" stroke="url(#jalebi-ocean-grad)" strokeWidth="2" opacity="0.08">
          <defs>
            <linearGradient id="jalebi-ocean-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="50%" stopColor="#FCD34D" />
              <stop offset="100%" stopColor="#FEF3C7" />
            </linearGradient>
          </defs>
          {/* Row 1 — drifting right */}
          <g className="jalebi" style={{ animationDelay: "0s" }} transform="translate(120, 80)">
            <circle cx="0" cy="0" r="20" />
            <circle cx="0" cy="0" r="12" strokeDasharray="3 3" />
            <circle cx="0" cy="0" r="4" strokeWidth="1.5" opacity="0.5" />
          </g>
          <g className="jalebi" style={{ animationDelay: "0.8s" }} transform="translate(320, 50)">
            <circle cx="0" cy="0" r="14" />
            <circle cx="0" cy="0" r="8" strokeDasharray="2.5 2.5" />
            <circle cx="0" cy="0" r="3" strokeWidth="1.5" opacity="0.5" />
          </g>
          <g className="jalebi" style={{ animationDelay: "1.6s" }} transform="translate(520, 90)">
            <circle cx="0" cy="0" r="26" />
            <circle cx="0" cy="0" r="16" strokeDasharray="4 4" />
            <circle cx="0" cy="0" r="6" strokeWidth="1.5" opacity="0.5" />
          </g>
          {/* Row 2 — drifting left */}
          <g className="jalebi" style={{ animationDelay: "0.4s" }} transform="translate(720, 60)">
            <circle cx="0" cy="0" r="18" />
            <circle cx="0" cy="0" r="10" strokeDasharray="3 3" />
            <circle cx="0" cy="0" r="4" strokeWidth="1.5" opacity="0.5" />
          </g>
          <g className="jalebi" style={{ animationDelay: "1.2s" }} transform="translate(920, 100)">
            <circle cx="0" cy="0" r="22" />
            <circle cx="0" cy="0" r="13" strokeDasharray="3.5 3.5" />
            <circle cx="0" cy="0" r="5" strokeWidth="1.5" opacity="0.5" />
          </g>
          <g className="jalebi" style={{ animationDelay: "2.0s" }} transform="translate(1120, 40)">
            <circle cx="0" cy="0" r="12" />
            <circle cx="0" cy="0" r="7" strokeDasharray="2 2" />
            <circle cx="0" cy="0" r="3" strokeWidth="1.5" opacity="0.5" />
          </g>
          {/* Row 3 — scattered */}
          <g className="jalebi" style={{ animationDelay: "0.6s" }} transform="translate(200, 120)">
            <circle cx="0" cy="0" r="16" />
            <circle cx="0" cy="0" r="9" strokeDasharray="2.5 2.5" />
            <circle cx="0" cy="0" r="3" strokeWidth="1.5" opacity="0.5" />
          </g>
          <g className="jalebi" style={{ animationDelay: "1.8s" }} transform="translate(600, 130)">
            <circle cx="0" cy="0" r="24" />
            <circle cx="0" cy="0" r="15" strokeDasharray="3.5 3.5" />
            <circle cx="0" cy="0" r="5" strokeWidth="1.5" opacity="0.5" />
          </g>
          <g className="jalebi" style={{ animationDelay: "2.4s" }} transform="translate(1300, 70)">
            <circle cx="0" cy="0" r="20" />
            <circle cx="0" cy="0" r="12" strokeDasharray="3 3" />
            <circle cx="0" cy="0" r="4" strokeWidth="1.5" opacity="0.5" />
          </g>
        </svg>
      </div>

      <Sidebar
        active={activePage}
        onNavigate={onNavigate}
        items={navItems}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded((e) => !e)}
      />

      <main
        className={cn(
          "p-4 md:p-8 min-h-screen animate-fade-in transition-all duration-200 ease-out",
          sidebarExpanded ? "md:ml-[200px]" : "md:ml-[52px]"
        )}
      >
        <TopBar isSignedIn={isSignedIn} username={username} />
        <div key={activePage} className="animate-slide-up">
          {children}
        </div>
      </main>
    </div>
  );
}
