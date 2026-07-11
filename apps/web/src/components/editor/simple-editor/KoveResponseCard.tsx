import React, { useState } from "react";
import type { ChatMessage } from "./types";

interface KoveResponseCardProps {
  msg: ChatMessage;
  streaming?: boolean;
}

export function KoveResponseCard({ msg, streaming }: KoveResponseCardProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-[4px] bg-background-secondary/80 border border-border overflow-hidden transition-all duration-300 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-[4px] bg-primary flex items-center justify-center text-[8px] font-black text-primary-foreground">
            K
          </div>
          <span className="text-[10px] font-semibold tracking-[0.05em] uppercase text-text-muted font-mono">
            Kove Director
          </span>
          <span className="text-[10px] text-text-tertiary font-mono">{time}</span>
        </div>
        {streaming && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Message text — mono with "> " prefix */}
        <p className="text-[13px] text-text-primary leading-relaxed font-mono">
          {"> "}{msg.text}
        </p>

        {/* Scope chip */}
        {msg.scope && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-[4px] bg-primary/10 text-primary border border-primary/20 font-mono">
              {"> "}applied to clips {msg.scope.from}–{msg.scope.to}
            </span>
          </div>
        )}

        {/* Reasoning section */}
        {msg.reasoning && msg.reasoning.length > 0 && (
          <div>
            <button
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors font-mono"
            >
              <svg className={`w-3 h-3 transition-transform ${reasoningOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              {"> "}view clip-by-clip reasoning
            </button>
            {reasoningOpen && (
              <div className="mt-2 space-y-0.5">
                {msg.reasoning.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] font-mono text-text-tertiary py-0.5">
                    <span className="text-text-muted shrink-0 w-5 text-right">{String(r.clip).padStart(2, "0")}</span>
                    <span className="text-text-tertiary">·</span>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metrics */}
        {msg.metrics && (
          <div className="flex flex-wrap gap-1.5">
            <MetricChip value={`${msg.metrics.clips} clips`} />
            <MetricChip value={`${msg.metrics.duration.toFixed(1)}s`} />
            <MetricChip value={`${msg.metrics.onBeat}% on beat`} />
            {msg.metrics.slowMo > 0 && <MetricChip value={`${msg.metrics.slowMo} slow-mo`} />}
          </div>
        )}
      </div>

      {/* Actions */}
      {msg.actions && msg.actions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
          {msg.actions.map((action, i) => (
            <button
              key={i}
              className={`text-[11px] px-3 py-1.5 rounded-[4px] font-medium font-mono transition-all ${
                action.variant === "primary"
                  ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                  : "text-text-muted hover:text-text-secondary hover:bg-background-tertiary"
              }`}
            >
              {"> "}{action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricChip({ value }: { value: string }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-[4px] bg-background-tertiary text-text-muted border border-border font-mono">
      {value}
    </span>
  );
}
