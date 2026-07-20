import { useState, useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useDashboardStore } from "@/stores/dashboard-store";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectsPage } from "./ProjectsPage";
import { ThemeProvider } from "./ThemeProvider";
import { DashboardLayout } from "./DashboardLayout";
import { GreetingHero } from "./GreetingHero";
import { ActionInput } from "./ActionInput";
import { QuickActions } from "./QuickActions";
import type { NavItem } from "./Sidebar";

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
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
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-14 w-full max-w-[640px] mt-6" />
      <div className="flex gap-3 mt-4">
        <Skeleton className="h-12 w-28 rounded-xl" />
        <Skeleton className="h-12 w-28 rounded-xl" />
        <Skeleton className="h-12 w-28 rounded-xl" />
      </div>
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
  const [page, setPage] = useState<"overview" | "projects">("overview");

  const displayName = user?.firstName ?? user?.username ?? undefined;

  // Sync URL search param to page state
  const { page: pageParam } = useSearch({ from: "/dashboard" });
  useEffect(() => {
    if (pageParam === "projects") setPage("projects");
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
        isSignedIn={false}
        username={undefined}
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
      isSignedIn={isSignedIn ?? false}
      username={displayName}
    >
      {page === "overview" ? (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] -mt-16">
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
      ) : (
        <ProjectsPage
          projects={projects}
          onAdd={addProject}
        />
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
