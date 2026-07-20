import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "./Icons";
import { Sidebar, type NavItem } from "./Sidebar";

function TopBar() {
  return (
    <header className="flex items-center justify-end py-4 mb-6">
      <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] transition-colors">
        <Icons.search className="w-4 h-4" />
      </button>
    </header>
  );
}

interface DashboardLayoutProps {
  children: ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  navItems: NavItem[];
}

export function DashboardLayout({
  children,
  activePage,
  onNavigate,
  navItems,
}: DashboardLayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div className={cn("min-h-screen text-[var(--text-primary)] font-sans relative overflow-hidden")}>
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
        <TopBar />
        <div key={activePage} className="animate-slide-up">
          {children}
        </div>
      </main>
    </div>
  );
}
