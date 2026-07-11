import React, { useState, useRef, useEffect } from "react";
import type { EditorStage } from "./types";

interface ProjectHeaderProps {
  projectName: string;
  onNameChange: (name: string) => void;
  stage: EditorStage;
  mode: "simple" | "studio";
  onModeChange: (mode: "simple" | "studio") => void;
}

export function ProjectHeader({ projectName, onNameChange, stage, mode, onModeChange }: ProjectHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim()) onNameChange(draft.trim());
    else setDraft(projectName);
  };

  return (
    <header className="flex items-center gap-3 px-3 py-2 border-b border-border bg-background/80 backdrop-blur-xl shrink-0 animate-slide-down">
      {/* Back button */}
      <a
        href="/dashboard"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-background-tertiary transition-all duration-200 shrink-0"
        aria-label="Back to dashboard"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
      </a>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Project name */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(projectName);
              setEditing(false);
            }
          }}
          className="text-sm font-medium bg-transparent border-none outline-none p-0 text-foreground flex-1 min-w-0"
        />
      ) : (
        <button
          onClick={() => {
            setDraft(projectName);
            setEditing(true);
          }}
          className="text-sm font-medium text-foreground hover:text-text-secondary transition-colors text-left truncate flex-1 min-w-0"
        >
          {projectName}
        </button>
      )}

      {/* Stage indicator */}
      {stage !== "idle" && stage !== "ready" && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${
            stage === "error" ? "bg-destructive" :
            "bg-primary animate-pulse"
          }`} />
          <span className="text-[10px] text-text-tertiary font-mono">
            {stage === "error" ? "error" :
             stage === "regenerating" ? "updating…" :
             "processing…"}
          </span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex bg-background-secondary rounded-[4px] p-0.5 border border-border ml-auto shrink-0">
        <button
          onClick={() => onModeChange("simple")}
          className={`px-3 py-1 rounded-[4px] text-[11px] font-medium transition-all duration-200 ${
            mode === "simple"
              ? "bg-primary text-primary-foreground"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Director
        </button>
        <button
          onClick={() => onModeChange("studio")}
          className={`px-3 py-1 rounded-[4px] text-[11px] font-medium transition-all duration-200 ${
            mode === "studio"
              ? "bg-primary text-primary-foreground"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Studio
        </button>
      </div>
    </header>
  );
}
