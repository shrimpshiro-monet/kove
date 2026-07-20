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
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full blur-[120px] pointer-events-none opacity-[0.04]"
        style={{ backgroundColor: "var(--accent)" }}
      />

      {/* Grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[100] opacity-[0.012]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundSize: "256px 256px",
        }}
      />

      <Sidebar active={activePage} onNavigate={onNavigate} items={navItems} />

      <main className="md:ml-[84px] p-4 md:p-6 lg:p-8 min-h-screen animate-fade-in">
        <TopBar isSignedIn={isSignedIn} username={username} />
        <div key={activePage} className="animate-slide-up">
          {children}
        </div>
      </main>
    </div>
  );
}
