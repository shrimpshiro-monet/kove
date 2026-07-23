import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Icons } from "./Icons";
import type { Project } from "@/stores/dashboard-store";

interface ProjectsPageProps {
  projects: Project[];
  onAdd: (name: string) => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function ProjectsPage({ projects, onAdd }: ProjectsPageProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-display font-bold text-[var(--text-primary)] tracking-tight">
            Projects
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {projects.length} project{projects.length !== 1 ? "s" : ""} in your workspace.
          </p>
        </div>
        <button
          onClick={() => {
            onAdd("Untitled Project");
            navigate({ to: "/simple-editor" });
          }}
          className="flex items-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:-translate-y-0.5 shrink-0"
        >
          <Icons.plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {/* Project Grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4 text-[var(--text-tertiary)]">
            <Icons.folder className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">No projects yet</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-[260px]">
            Create your first project from the overview or by typing a prompt.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p, i) => (
            <button
              key={p.id}
              onClick={() => navigate({ to: "/simple-editor", search: { project: p.id } })}
              className={cn(
                "group flex flex-col rounded-2xl border border-[var(--border)]",
                "bg-[var(--background-secondary)] p-4 text-left",
                "transition-all duration-200",
                "hover:-translate-y-0.5 hover:shadow-panel-lg hover:border-[var(--border-hover)]",
                `animate-fade-in stagger-${Math.min(i + 1, 6)}`
              )}
            >
              {/* Thumbnail */}
              <div
                className="w-full h-24 rounded-xl mb-3 flex items-center justify-center"
                style={{ backgroundColor: `${p.thumbnailColor || "var(--accent)"}20` }}
              >
                <Icons.play
                  className="w-5 h-5 opacity-40 group-hover:opacity-70 transition-opacity"
                  style={{ color: p.thumbnailColor || "var(--accent)" }}
                />
              </div>

              {/* Info */}
              <h3 className="text-sm font-medium text-[var(--text-primary)] truncate mb-1">
                {p.name}
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {p.clips} clips · {p.duration}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                  {formatRelativeTime(p.updatedAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
