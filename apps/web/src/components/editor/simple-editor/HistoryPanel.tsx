import React, { useState } from "react";
import type { HistoryEntry } from "./types";

interface HistoryPanelProps {
  open: boolean;
  onToggle: () => void;
  entries: HistoryEntry[];
  onEntryClick: (entry: HistoryEntry) => void;
}

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function HistoryPanel({ open, onToggle, entries, onEntryClick }: HistoryPanelProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = entries.filter((e) =>
    search ? e.prompt.toLowerCase().includes(search.toLowerCase()) : true
  );

  if (!open) {
    return (
      <aside className="w-[48px] bg-sidebar/90 backdrop-blur-xl border-l border-sidebar-border flex flex-col items-center py-3 shrink-0 animate-slide-in-right">
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          aria-label="Expand history"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        {entries.length > 0 && (
          <span className="mt-2 text-[9px] font-mono text-sidebar-foreground/30 [writing-mode:vertical-lr]">
            History
          </span>
        )}
      </aside>
    );
  }

  return (
    <aside className="w-[280px] bg-sidebar/90 backdrop-blur-xl border-l border-sidebar-border flex flex-col shrink-0 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <span className="text-[13px] font-semibold text-sidebar-foreground">History</span>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <span className="text-[10px] font-mono text-sidebar-foreground/40 px-1.5 py-0.5 rounded bg-sidebar-accent">
              {entries.length} / {entries.length}
            </span>
          )}
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Collapse history"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-sidebar-accent border-none text-[12px] text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-sidebar-ring/50"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-2 py-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <svg className="w-8 h-8 text-sidebar-foreground/15 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[12px] text-sidebar-foreground/30">No prompts yet.</p>
            <p className="text-[10px] text-sidebar-foreground/20 mt-0.5">Every prompt you send appears here.</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((entry) => {
              const isSelected = selected.has(entry.id);
              return (
                <button
                  key={entry.id}
                  onClick={() => onEntryClick(entry)}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left group ${
                    isSelected ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      });
                    }}
                    className="mt-0.5 w-3.5 h-3.5 rounded border-sidebar-border accent-primary shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-sidebar-foreground/70 truncate group-hover:text-sidebar-foreground transition-colors">
                      {entry.summary || entry.prompt.slice(0, 40)}
                    </div>
                    <div className="text-[10px] text-sidebar-foreground/30 truncate mt-0.5">
                      {entry.prompt.slice(0, 60)}
                    </div>
                    <div className="text-[9px] text-sidebar-foreground/20 mt-0.5 font-mono">
                      {formatTime(entry.timestamp)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {entries.length > 0 && (
        <div className="px-3 py-2 border-t border-sidebar-border flex items-center justify-between">
          <button className="text-[11px] text-sidebar-foreground/30 hover:text-sidebar-foreground/50 transition-colors">
            Clear history
          </button>
          <button className="text-[11px] text-sidebar-foreground/30 hover:text-sidebar-foreground/50 transition-colors">
            Export JSON
          </button>
        </div>
      )}
    </aside>
  );
}
