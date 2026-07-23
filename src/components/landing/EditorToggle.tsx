export type EditorMode = "simple" | "advanced";

interface EditorToggleProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

export function EditorToggle({ mode, onChange }: EditorToggleProps) {
  return (
    <div className="relative inline-flex items-center bg-jalebi-surface rounded-full p-1 border border-jalebi-border mb-12">
      <button
        onClick={() => onChange("simple")}
        className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg ${
          mode === "simple"
            ? "text-jalebi-bg"
            : "text-jalebi-border-strong hover:text-white"
        }`}
      >
        Simple
      </button>
      <button
        onClick={() => onChange("advanced")}
        className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jalebi-accent focus-visible:ring-offset-2 focus-visible:ring-offset-jalebi-bg ${
          mode === "advanced"
            ? "text-jalebi-bg"
            : "text-jalebi-border-strong hover:text-white"
        }`}
      >
        Advanced
      </button>
      {/* Sliding indicator */}
      <div
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-jalebi-accent rounded-full transition-all duration-200 ease-out"
        style={{
          left: mode === "simple" ? "4px" : "calc(50% + 0px)",
        }}
      />
    </div>
  );
}
