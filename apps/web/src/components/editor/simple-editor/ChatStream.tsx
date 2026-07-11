import React, { useState } from "react";
import { KoveResponseCard } from "./KoveResponseCard";
import type { ChatMessage, UploadedFile } from "./types";

interface ChatStreamProps {
  messages: ChatMessage[];
  streaming: boolean;
  partial: string;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onSuggestion: (prompt: string) => void;
  hasEdit: boolean;
  uploadedFiles: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  isGenerating: boolean;
}

const SUGGESTION_PROMPTS = [
  "Make it feel like a hype sports highlight.",
  "Match the pacing of my reference.",
  "Add slow-mo on the strongest moment.",
  "Regenerate with cleaner cuts.",
];

function AssetsSection({ files }: { files: UploadedFile[] }) {
  if (files.length === 0) return null;

  const footage = files.filter(f => f.type === "footage");
  const music = files.filter(f => f.type === "music");
  const references = files.filter(f => f.type === "reference");

  return (
    <div className="px-4 py-3 border-b border-border/50 animate-fade-in">
      <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-tertiary mb-2 font-mono">assets</div>
      <div className="space-y-1.5">
        {footage.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-primary/60">video</span>
            {footage.map(f => (
              <span key={f.id} className="text-text-secondary flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500/60" />
                {f.file.name}
              </span>
            ))}
          </div>
        )}
        {music.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-primary/60">audio</span>
            {music.map(f => (
              <span key={f.id} className="text-text-secondary flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500/60" />
                {f.file.name}
              </span>
            ))}
          </div>
        )}
        {references.length > 0 && (
          <div className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-primary/60">reference</span>
            {references.map(f => (
              <span key={f.id} className="text-text-secondary flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500/60" />
                {f.file.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MissionHeader({ prompt }: { prompt: string }) {
  return (
    <div className="px-4 py-3 border-b border-border/50 animate-fade-in">
      <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-text-tertiary mb-1.5 font-mono">mission</div>
      <p className="text-[13px] text-text-primary leading-relaxed">{prompt}</p>
    </div>
  );
}

function EmptyState({ onSuggestion, hasFiles }: { onSuggestion: (p: string) => void; hasFiles: boolean }) {
  if (!hasFiles) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 animate-scale-in">
        <div className="space-y-3 font-mono text-[13px]">
          <p className="text-text-secondary">{"> "}drop footage.</p>
          <p className="text-text-tertiary">{"> "}add a reference. teach kove the style.</p>
          <p className="text-text-tertiary">{"> "}then tell me the vibe.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 animate-scale-in">
      <div className="w-16 h-16 rounded-[4px] bg-primary/10 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2 font-display">What do you want to create?</h2>
      <p className="text-sm text-text-muted max-w-[340px] leading-relaxed mb-8 font-mono">
        {"> "}tell me the vibe. i'll build the edit.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-[420px]">
        {SUGGESTION_PROMPTS.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(suggestion)}
            className="text-[12px] px-4 py-2 rounded-[4px] bg-background-secondary/60 border border-border text-text-muted font-mono hover:text-text-secondary hover:border-border-hover hover:bg-background-secondary transition-all duration-200 hover:scale-[1.02] animate-fade-in"
            style={{ animationDelay: `${0.1 + i * 0.05}s` }}
          >
            {"> "}{suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div id={`msg-${msg.id}`} className="flex justify-end mb-4 animate-slide-up">
      <div className="max-w-[80%] text-text-primary rounded-[4px] rounded-br-sm px-5 py-3 text-[14px] leading-relaxed">
        {msg.text}
      </div>
    </div>
  );
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start mb-4 animate-fade-in">
      <div className="max-w-[85%]">
        <KoveResponseCard
          msg={{ id: "streaming", role: "kove", text, timestamp: Date.now() }}
          streaming
        />
      </div>
    </div>
  );
}

export function ChatStream({ messages, streaming, partial, chatEndRef, onSuggestion, hasEdit, uploadedFiles, onFilesChange, isGenerating }: ChatStreamProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith("video/") || f.type.startsWith("audio/") || f.type.startsWith("image/")
    );
    if (files.length > 0) {
      const added = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        type: (file.type.startsWith("video/") ? "footage" : file.type.startsWith("audio/") ? "music" : "reference") as "footage" | "music" | "reference",
      }));
      onFilesChange(added);
    }
  };

  // Find the first user prompt for the mission header
  const firstUserPrompt = messages.find(m => m.role === "user")?.text;

  if (messages.length === 0 && !streaming) {
    return (
      <div
        className="flex-1 flex flex-col overflow-auto"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragging && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary rounded-[4px] m-4 animate-fade-in">
            <div className="text-center">
              <svg className="w-12 h-12 text-primary mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-foreground font-mono">{"> "}drop footage, music, or references</p>
              <p className="text-xs text-text-muted mt-1 font-mono">{"> "}files upload when you send your first message</p>
            </div>
          </div>
        )}
        {uploadedFiles.length > 0 && <AssetsSection files={uploadedFiles} />}
        <EmptyState onSuggestion={onSuggestion} hasFiles={uploadedFiles.length > 0} />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary rounded-[4px] m-4 animate-fade-in">
          <div className="text-center">
            <svg className="w-12 h-12 text-primary mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-foreground font-mono">{"> "}drop to add more files</p>
          </div>
        </div>
      )}

      {uploadedFiles.length > 0 && !firstUserPrompt && <AssetsSection files={uploadedFiles} />}
      {firstUserPrompt && <MissionHeader prompt={firstUserPrompt} />}

      <div className="flex-1 overflow-auto max-w-[800px] mx-auto px-4 py-6 space-y-1">
        {messages.filter(m => m.role !== "user" || m.text !== firstUserPrompt).map((msg) => {
          if (msg.role === "system") return <SystemMessage key={msg.id} text={msg.text} />;
          if (msg.role === "user") return <UserMessage key={msg.id} msg={msg} />;
          return (
            <div key={msg.id} id={`msg-${msg.id}`} className="flex justify-start mb-4 animate-slide-up">
              <div className="max-w-[85%]">
                <KoveResponseCard msg={msg} />
              </div>
            </div>
          );
        })}
        {streaming && partial && <StreamingBubble text={partial} />}
        <div ref={chatEndRef as React.Ref<HTMLDivElement>} />
      </div>
    </div>
  );
}

function SystemMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-center py-2 animate-fade-in">
      <div className="flex items-center gap-2 text-[12px] text-text-tertiary bg-background-secondary/40 rounded-[4px] px-4 py-1.5 border border-border/50 font-mono">
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
        {text}
      </div>
    </div>
  );
}
