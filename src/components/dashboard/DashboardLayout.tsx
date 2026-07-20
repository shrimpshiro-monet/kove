import type { ReactNode } from "react";
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

  return (
    <div className={cn("min-h-screen text-[var(--text-primary)] font-sans relative overflow-hidden")}>
      {/* Ocean tide — subtle wave animation at bottom */}
      <div className="ocean-tide">
        <svg className="wave" viewBox="0 0 1440 120" preserveAspectRatio="none" fill="var(--accent)">
          <path d="M0,60 C240,120 480,0 720,60 C960,120 1200,0 1440,60 L1440,120 L0,120 Z" />
        </svg>
        <svg className="wave" viewBox="0 0 1440 120" preserveAspectRatio="none" fill="var(--accent)">
          <path d="M0,80 C300,20 600,100 900,60 C1200,20 1320,80 1440,60 L1440,120 L0,120 Z" />
        </svg>
        <svg className="wave" viewBox="0 0 1440 120" preserveAspectRatio="none" fill="var(--accent)">
          <path d="M0,40 C180,100 360,20 540,60 C720,100 900,0 1080,40 C1260,80 1350,60 1440,50 L1440,120 L0,120 Z" />
        </svg>
      </div>

      <Sidebar active={activePage} onNavigate={onNavigate} items={navItems} />

      <main className="md:ml-[60px] p-4 md:p-8 min-h-screen animate-fade-in">
        <TopBar isSignedIn={isSignedIn} username={username} />
        <div key={activePage} className="animate-slide-up">
          {children}
        </div>
      </main>
    </div>
  );
}
