import { useState, useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useDashboardStore } from "@/stores/dashboard-store";
import { ProjectsPage } from "./ProjectsPage";
import { ThemeProvider } from "./ThemeProvider";
import { DashboardLayout } from "./DashboardLayout";
import { GreetingHero } from "./GreetingHero";
import { ActionInput } from "./ActionInput";
import { QuickActions } from "./QuickActions";
import type { NavItem } from "./Sidebar";
import { AffiliatePage } from "../affiliate/AffiliatePage";

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "affiliate", label: "Affiliate" },
];

const COMMIT_HASH = import.meta.env.VITE_COMMIT_HASH || "dev";
const VERSION = "0.1.0-beta";

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function fireEasterEgg(username: string) {
  const alreadyFired = sessionStorage.getItem("kove-easter-egg");
  if (alreadyFired) return;
  sessionStorage.setItem("kove-easter-egg", "1");

  const greetings = [
    `%cwelcome back, ${username}\n%cstill in beta — thanks for testing early. break something for us.`,
    `%c${username} again? nice. the build is ${COMMIT_HASH.slice(0, 7)} if you're curious.`,
    `%cheys ${username}. you're one of the early ones. we'll remember that.`,
    `%c${username}! perfect timing — this build is fresh. ${new Date().toLocaleDateString()}.`,
    `%clook who's back. ${username}. don't check the network tab, it's embarrassing.`,
  ];

  const msg = greetings[Math.floor(Math.random() * greetings.length)];

  console.log(
    msg,
    "color:var(--accent, #4A7A6A); font-weight:bold; font-size:14px;",
    "color:#9A9590; font-size:12px;"
  );

  (window as unknown as Record<string, unknown>).__beta = {
    message: "you found it. we're still building.",
    build: COMMIT_HASH,
    version: VERSION,
  };
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] -mt-16 gap-4">
      <span className="text-4xl animate-spin [animation-duration:2s]">🌀</span>
      <p className="text-[12px] text-[var(--text-tertiary)] font-medium tracking-wide animate-pulse">Frying jalebis...</p>
    </div>
  );
}

function DashboardInner() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const easterEggFired = useRef(false);
  const { state, addProject } = useDashboardStore();
  const projects = state.projects;
  const [page, setPage] = useState<"overview" | "projects" | "affiliate">("overview");

  const displayName = user?.firstName ?? user?.username ?? undefined;

  // Sync URL search param to page state
  const { page: pageParam } = useSearch({ from: "/dashboard" });
  useEffect(() => {
    if (pageParam === "projects") setPage("projects");
    else if (pageParam === "affiliate") setPage("affiliate");
  }, [pageParam]);

  useEffect(() => {
    if (isSignedIn && !easterEggFired.current) {
      easterEggFired.current = true;
      fireEasterEgg(displayName || "creator");
    }
  }, [isSignedIn, displayName]);

  const handleNavigate = (p: string) => {
    if (p === "projects") {
      setPage("projects");
      navigate({ to: "/dashboard", search: { page: "projects" } });
    } else if (p === "affiliate") {
      setPage("affiliate");
      navigate({ to: "/dashboard", search: { page: "affiliate" } });
    } else {
      setPage("overview");
      navigate({ to: "/dashboard" });
    }
  };

  if (!isLoaded) {
    return (
      <DashboardLayout
        activePage={page}
        onNavigate={handleNavigate}
        navItems={NAV_ITEMS}
      >
        <DashboardSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      activePage={page}
      onNavigate={handleNavigate}
      navItems={NAV_ITEMS}
    >
      {page === "overview" ? (
        <div className="flex flex-col items-center min-h-[calc(100vh-120px)] -mt-16">
          <div className="flex flex-col items-center justify-center flex-1 w-full">
            <GreetingHero
              isSignedIn={isSignedIn ?? false}
              username={displayName}
            />
            <ActionInput
              onSubmit={(q) => {
                navigate({ to: "/simple-editor", search: { q } });
              }}
            />
            <QuickActions
              onAction={(q) => {
                navigate({ to: "/simple-editor", search: { q } });
              }}
            />

            {/* Recent projects */}
            {projects.length > 0 && (
              <div className="w-full max-w-[400px] animate-slide-up stagger-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[var(--text-tertiary)] font-medium tracking-wide uppercase">Recent</span>
                  <button
                    onClick={() => handleNavigate("projects")}
                    className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    View all
                  </button>
                </div>
                <div className="space-y-0.5">
                  {projects.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate({ to: "/simple-editor", search: { project: p.id } })}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03] transition-all text-left group"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono shrink-0 ml-3">
                        {formatTimeAgo(p.updatedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Jalebi tide */}
          <div className="w-full overflow-hidden h-20">
            <svg className="w-full h-full" viewBox="0 0 1440 80" preserveAspectRatio="xMidYMax slice" fill="none" stroke="url(#jalebi-page-grad)" strokeWidth="2" opacity="0.06">
              <defs>
                <linearGradient id="jalebi-page-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" />
                  <stop offset="50%" stopColor="#FCD34D" />
                  <stop offset="100%" stopColor="#FEF3C7" />
                </linearGradient>
              </defs>
              <g className="jalebi" style={{ animationDelay: "0s" }} transform="translate(120, 55)">
                <circle cx="0" cy="0" r="18" /><circle cx="0" cy="0" r="10" strokeDasharray="3 3" /><circle cx="0" cy="0" r="4" strokeWidth="1.5" opacity="0.5" />
              </g>
              <g className="jalebi" style={{ animationDelay: "0.8s" }} transform="translate(320, 30)">
                <circle cx="0" cy="0" r="12" /><circle cx="0" cy="0" r="7" strokeDasharray="2 2" /><circle cx="0" cy="0" r="3" strokeWidth="1.5" opacity="0.5" />
              </g>
              <g className="jalebi" style={{ animationDelay: "1.6s" }} transform="translate(540, 60)">
                <circle cx="0" cy="0" r="22" /><circle cx="0" cy="0" r="13" strokeDasharray="4 4" /><circle cx="0" cy="0" r="5" strokeWidth="1.5" opacity="0.5" />
              </g>
              <g className="jalebi" style={{ animationDelay: "0.4s" }} transform="translate(780, 40)">
                <circle cx="0" cy="0" r="15" /><circle cx="0" cy="0" r="9" strokeDasharray="2.5 2.5" /><circle cx="0" cy="0" r="3" strokeWidth="1.5" opacity="0.5" />
              </g>
              <g className="jalebi" style={{ animationDelay: "1.2s" }} transform="translate(1020, 65)">
                <circle cx="0" cy="0" r="20" /><circle cx="0" cy="0" r="12" strokeDasharray="3 3" /><circle cx="0" cy="0" r="4" strokeWidth="1.5" opacity="0.5" />
              </g>
              <g className="jalebi" style={{ animationDelay: "2.0s" }} transform="translate(1280, 35)">
                <circle cx="0" cy="0" r="10" /><circle cx="0" cy="0" r="6" strokeDasharray="2 2" /><circle cx="0" cy="0" r="2" strokeWidth="1.5" opacity="0.5" />
              </g>
            </svg>
          </div>
        </div>
      ) : page === "projects" ? (
        <ProjectsPage
          projects={projects}
          onAdd={addProject}
        />
      ) : (
        <AffiliatePage />
      )}
    </DashboardLayout>
  );
}

export function DashboardPage() {
  return (
    <ThemeProvider>
      <DashboardInner />
    </ThemeProvider>
  );
}
