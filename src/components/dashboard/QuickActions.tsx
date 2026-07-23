import { cn } from "@/lib/utils";

export interface QuickAction {
  label: string;
  query: string;
}

interface QuickActionsProps {
  actions?: QuickAction[];
  onAction: (query: string) => void;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "Cinematic edit", query: "Create a cinematic edit with dramatic cuts and color grading" },
  { label: "Travel montage", query: "Smooth travel montage with transitions and warm tones" },
  { label: "Sports highlight", query: "High-energy sports highlight with beat-synced cuts" },
  { label: "Music video", query: "Moody music video style with effects and pacing" },
];

export function QuickActions({ actions = DEFAULT_ACTIONS, onAction }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-10 animate-slide-up stagger-3">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.query)}
          className={cn(
            "text-[11px] px-3.5 py-1.5 rounded-full",
            "bg-white/[0.03] border border-[var(--border)]",
            "text-[var(--text-muted)]",
            "hover:text-[var(--text-secondary)] hover:bg-white/[0.06] hover:border-[var(--border-hover)]",
            "transition-all duration-200"
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
