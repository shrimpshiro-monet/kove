import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStudioProjects } from "@/lib/storage";

export const Route = createFileRoute("/studio")({
  component: StudioIndex,
});

function StudioIndex() {
  const navigate = useNavigate();
  const { projects, hydrated, createProject } = useStudioProjects();

  useEffect(() => {
    if (!hydrated) return;
    if (projects.length > 0) {
      navigate({
        to: "/studio/$projectId",
        params: { projectId: projects[0].id },
        replace: true,
      });
    } else {
      const p = createProject();
      navigate({
        to: "/studio/$projectId",
        params: { projectId: p.id },
        replace: true,
      });
    }
  }, [hydrated, projects, navigate, createProject]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">
      <Link to="/" className="hover:text-foreground">← monet</Link>
      <span className="ml-4">Loading studio…</span>
    </div>
  );
}