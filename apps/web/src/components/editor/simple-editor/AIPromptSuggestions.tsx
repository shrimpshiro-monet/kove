import React, { useMemo } from "react";
import { useActiveSection, useSuggestions } from "../../../stores/project-store";
import type { EditorSection, AISuggestion } from "../../../stores/project-store";

interface AIPromptSuggestionsProps {
  onSelect: (prompt: string) => void;
}

const DEFAULT_SUGGESTIONS: Record<EditorSection, AISuggestion[]> = {
  chat: [
    { id: "chat-help", label: "What can I do?", prompt: "What can Kove do for me?", section: "chat" },
    { id: "chat-upload", label: "Upload footage", prompt: "I want to upload footage to start a project", section: "chat" },
    { id: "chat-vibe", label: "Show examples", prompt: "Show me what kinds of edits you can make", section: "chat" },
  ],
  "clip-inspector": [
    { id: "clip-trim", label: "Trim clip", prompt: "Trim the selected clip", section: "clip-inspector" },
    { id: "clip-effects", label: "Add effects", prompt: "Add effects to the selected clip", section: "clip-inspector" },
    { id: "clip-speed", label: "Adjust speed", prompt: "Change the speed of the selected clip", section: "clip-inspector" },
  ],
  "effect-inspector": [
    { id: "effect-remove", label: "Remove effect", prompt: "Remove the current effect from this clip", section: "effect-inspector" },
    { id: "effect-tweak", label: "Tweak parameters", prompt: "Adjust the effect parameters on this clip", section: "effect-inspector" },
  ],
  timeline: [
    { id: "timeline-transition", label: "Add transition", prompt: "Add crossfade transitions between clips", section: "timeline" },
    { id: "timeline-pacing", label: "Adjust pacing", prompt: "Make the pacing more dynamic", section: "timeline" },
    { id: "timeline-split", label: "Split at playhead", prompt: "Split the clip at the current playhead", section: "timeline" },
    { id: "timeline-clean", label: "Clean cuts", prompt: "Clean up the cuts between clips", section: "timeline" },
  ],
  history: [
    { id: "history-undo", label: "Undo", prompt: "Undo the last change", section: "history" },
    { id: "history-restore", label: "Restore version", prompt: "Restore a previous version", section: "history" },
  ],
  preview: [
    { id: "preview-range", label: "Set range", prompt: "Set a preview range for this section", section: "preview" },
    { id: "preview-export", label: "Export clip", prompt: "Export the current preview as a clip", section: "preview" },
  ],
  studio: [
    { id: "studio-open", label: "Open Studio", prompt: "Open this project in Studio mode", section: "studio" },
    { id: "studio-sync", label: "Sync edits", prompt: "Sync my changes from Studio", section: "studio" },
  ],
};

export function AIPromptSuggestions({ onSelect }: AIPromptSuggestionsProps) {
  const activeSection = useActiveSection();
  const storeSuggestions = useSuggestions();

  const suggestions = useMemo(() => {
    const sectionSuggestions = storeSuggestions.filter((s) => s.section === activeSection);
    if (sectionSuggestions.length > 0) return sectionSuggestions.slice(0, 4);
    return (DEFAULT_SUGGESTIONS[activeSection] ?? []).slice(0, 4);
  }, [activeSection, storeSuggestions]);

  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-border/30 bg-background-secondary/40">
      <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-tertiary mb-1.5 font-mono">
        Suggestions
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.prompt)}
            className="text-[11px] px-2.5 py-1 rounded-[4px] bg-background-secondary/80 border border-border/50 text-text-muted font-mono hover:text-text-secondary hover:border-border-hover hover:bg-background-tertiary transition-all duration-120 hover:scale-[1.02]"
          >
            {"> "}{s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
