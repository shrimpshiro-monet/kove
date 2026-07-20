import { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useDashboardStore } from "@/stores/dashboard-store";
import { ProjectsPage } from "./ProjectsPage";
import { ThemeProvider } from "./ThemeProvider";
import { DashboardLayout } from "./DashboardLayout";
import { GreetingHero } from "./GreetingHero";
import { ActionInput } from "./ActionInput";
import { QuickActions } from "./QuickActions";
import { Icons } from "./Icons";
import type { NavItem } from "./Sidebar";

const NAV_ITEMS: NavItem[] = [
  { id: "overview", icon: Icons.grid, label: "Overview" },
  { id: "projects", icon: Icons.folder, label: "Projects" },
];

const COMMIT_HASH = import.meta.env.VITE_COMMIT_HASH || "dev";
const VERSION = "0.1.0-beta";

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

function DashboardInner() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const easterEggFired = useRef(false);
  const { state, addProject } = useDashboardStore();
  const projects = state.projects;
  const [page, setPage] = useState<"overview" | "projects">("overview");

  // Sync URL search param to page state
  const { page: pageParam } = useSearch({ from: "/dashboard" });
  useEffect(() => {
    if (pageParam === "projects") setPage("projects");
  }, [pageParam]);

  useEffect(() => {
    if (isSignedIn && !easterEggFired.current) {
      easterEggFired.current = true;
      fireEasterEgg("creator");
    }
  }, [isSignedIn]);

  const handleNavigate = (p: string) => {
    if (p === "projects") {
      setPage("projects");
      navigate({ to: "/dashboard", search: { page: "projects" } });
    } else {
      setPage("overview");
      navigate({ to: "/dashboard" });
    }
  };

  return (
    <DashboardLayout
      activePage={page}
      onNavigate={handleNavigate}
      navItems={NAV_ITEMS}
      isSignedIn={isSignedIn ?? false}
      username={isSignedIn ? "creator" : undefined}
    >
      {page === "overview" ? (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] -mt-16">
          <GreetingHero
            isSignedIn={isSignedIn ?? false}
            username={isSignedIn ? "creator" : undefined}
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
