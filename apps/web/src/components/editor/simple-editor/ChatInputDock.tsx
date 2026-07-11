import React, { useRef, useEffect, useState } from "react";
import type { UploadedFile } from "./types";

interface ChatInputDockProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  streaming: boolean;
  hasEdit: boolean;
  scope: { from: number; to: number } | null;
  onClearScope: () => void;
  onTagClick: (tag: string) => void;
  tags: string[];
  disabled: boolean;
  showUpload: boolean;
  uploadedFiles: UploadedFile[];
  onFilesChange?: (files: UploadedFile[]) => void;
}

const PLACEHOLDERS = [
  "> describe the vibe…",
  "> tell me what to change…",
  "> make it feel like…",
  "> direct the cut…",
];

export function ChatInputDock({
  input,
  onInputChange,
  onSend,
  onCancel,
  onKeyDown,
  streaming,
  hasEdit,
  scope,
  onClearScope,
  onTagClick,
  tags,
  disabled,
  showUpload,
  uploadedFiles,
  onFilesChange,
}: ChatInputDockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Rotate placeholder
  useEffect(() => {
    if (input || streaming) return;
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [input, streaming]);

  return (
    <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-[800px] mx-auto px-4 py-4">
        {/* Scope chip */}
        {scope && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] px-2.5 py-1 rounded-[4px] bg-primary/10 text-primary border border-primary/20 font-mono">
              {"> "}applying to clips {scope.from}–{scope.to} [X]
            </span>
            <button onClick={onClearScope} className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors font-mono">
              clear
            </button>
          </div>
        )}

        {/* File chips */}
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {uploadedFiles.map((f) => {
              const isVideo = f.file.type.startsWith("video/");
              const toggleType = () => {
                if (!isVideo || !onFilesChange) return;
                const newType = f.type === "reference" ? "footage" : "reference";
                onFilesChange(uploadedFiles.map((uf) => uf.id === f.id ? { ...uf, type: newType } : uf));
              };
              return (
                <div
                  key={f.id}
                  onClick={isVideo ? toggleType : undefined}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-background-secondary border border-border text-[11px] text-text-muted font-mono ${isVideo ? "cursor-pointer hover:border-primary/50" : ""}`}
                  title={isVideo ? `Click to toggle: ${f.type === "reference" ? "→ footage" : "→ reference"}` : ""}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    f.type === "footage" ? "bg-[#FF4E00]" :
                    f.type === "music" ? "bg-status-info" :
                    "bg-status-warning"
                  }`} />
                  {f.file.name.length > 20 ? f.file.name.slice(0, 20) + "…" : f.file.name}
                  {isVideo && (
                    <span className="text-[9px] opacity-50 ml-0.5">
                      {f.type === "reference" ? "[ref]" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Upload zone — always visible */}
        <label className="flex items-center justify-center gap-2 h-14 mb-2 border border-dashed border-border rounded-[4px] bg-background-secondary/30 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all duration-120">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) {
                const added = files.map((file) => ({
                  id: crypto.randomUUID(),
                  file,
                  type: (file.type.startsWith("video/") ? "footage" : file.type.startsWith("audio/") ? "music" : "reference") as "footage" | "music" | "reference",
                }));
                onFilesChange?.([...uploadedFiles, ...added]);
              }
            }}
          />
          <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-[12px] text-text-tertiary font-mono">
            {uploadedFiles.length > 0
              ? `> ${uploadedFiles.length} file${uploadedFiles.length > 1 ? "s" : ""} attached — drop more`
              : "> drop footage + reference"
            }
          </span>
        </label>

        {/* Input container — flat, mono */}
        <div className="relative flex items-end gap-2 bg-background-secondary/60 border border-border rounded-[4px] px-4 py-3 transition-all duration-120 focus-within:border-primary/50">
          {/* Text input — mono */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            rows={1}
            className="flex-1 resize-none bg-transparent border-none outline-none text-[13px] text-text-primary placeholder:text-text-tertiary min-h-[24px] max-h-[160px] leading-relaxed font-mono"
            disabled={disabled}
          />

          {/* Send / Cancel — orange square */}
          <button
            onClick={streaming ? onCancel : onSend}
            disabled={!streaming && !input.trim() && uploadedFiles.length === 0}
            className={`w-8 h-8 rounded-[4px] flex items-center justify-center shrink-0 transition-all duration-120 mb-0.5 ${
              streaming
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : input.trim() || uploadedFiles.length > 0
                ? "bg-primary text-primary-foreground hover:bg-primary-hover active:scale-95"
                : "bg-background-tertiary text-text-tertiary cursor-not-allowed"
            }`}
            aria-label={streaming ? "Cancel generation" : "Send message"}
          >
            {streaming ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>

        {/* Quick tags — mono, sharp */}
        {!hasEdit && !streaming && uploadedFiles.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto scrollbar-none">
            {tags.slice(0, 5).map((tag, i) => (
              <button
                key={tag}
                onClick={() => onTagClick(tag)}
                className="shrink-0 text-[11px] px-3 py-1 rounded-[4px] bg-background-secondary/60 border border-border/50 text-text-muted font-mono hover:text-text-secondary hover:border-border-hover transition-all duration-120 hover:scale-[1.02] animate-fade-in"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                {"> "}{tag}
              </button>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-text-tertiary/60 mt-2 text-center font-mono">
          Kove may make creative decisions you didn't ask for. Regenerate or tweak if needed.
        </p>
      </div>
    </div>
  );
}
