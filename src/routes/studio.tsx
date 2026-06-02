import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useChatThreads, useStudioProjects } from "@/lib/storage";

export const Route = createFileRoute("/studio")({
  component: StudioIndex,
});

function StudioIndex() {
  const navigate = useNavigate();
  const { projects, hydrated, createProject, updateProject } = useStudioProjects();
  const { threads, hydrated: chatHydrated, updateThread } = useChatThreads();

  useEffect(() => {
    if (!hydrated || !chatHydrated) return;

    const threadId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("threadId")
        : null;

    let targetProjectId: string | null = null;

    if (threadId) {
      const thread = threads.find((t) => t.id === threadId);
      if (thread) {
        // Canonical portable Studio link: use threadId as route id.
        // This lets /studio/{id} resolve via server lookup across browsers/ports.
        targetProjectId = thread.id;

        if (thread.projectId && projects.some((p) => p.id === thread.projectId)) {
          // Keep existing local mapping if present.
          targetProjectId = thread.id;
        } else {
        const project = createProject();
        updateProject(project.id, (p) => ({
          ...p,
          name: thread.title || p.name,
          updatedAt: Date.now(),
          sourceThreadId: thread.id,
          latestEdl: thread.latestEdl,
          latestEdlId: thread.latestEdlId,
        }));
        updateThread(thread.id, (t) => ({
          ...t,
          updatedAt: Date.now(),
          projectId: project.id,
        }));
        }
      }
    }

    if (!targetProjectId) {
      targetProjectId = projects[0]?.id ?? createProject().id;
    }

    navigate({
      to: "/studio/$projectId",
      params: { projectId: targetProjectId },
      replace: true,
    });
  }, [hydrated, chatHydrated, projects, threads, navigate, createProject, updateProject, updateThread]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">
      <Link to="/" className="hover:text-foreground">← monet</Link>
      <span className="ml-4">Loading studio…</span>
    </div>
  );
}