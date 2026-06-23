import React from "react";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { Terminal, Trash2, AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { Button } from "./ui/button";
import type { LogEntry, LogLevel } from "../hooks/use-effects-logger";

interface EffectsLogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  className?: string;
}

const LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; icon: React.ReactNode }> = {
  critical: {
    label: "(critical)",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  warning: {
    label: "(warning yet needed checking)",
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  unnecessary: {
    label: "(unnecessary)",
    color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    icon: <Info className="h-3 w-3" />,
  },
  success: {
    label: "(indication it worked)",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    icon: <CheckCircle className="h-3 w-3" />,
  },
};

export function EffectsLogViewer({ logs, onClear, className }: EffectsLogViewerProps) {
  return (
    <div className={`flex flex-col border border-border rounded-lg bg-card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          Execution Logs
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-[10px] text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
      <ScrollArea className="flex-1 p-2 h-[200px]">
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic py-8">
            Waiting for events...
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => {
              const config = LEVEL_CONFIG[log.level];
              return (
                <div key={log.id} className="text-[11px] leading-relaxed border-b border-border/50 pb-1.5 last:border-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-muted-foreground font-mono opacity-50">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <Badge variant="outline" className={`h-4 px-1.5 text-[9px] uppercase font-bold border-none ${config.color} flex items-center gap-1`}>
                      {config.icon}
                      {config.label}
                    </Badge>
                  </div>
                  <div className="pl-2 border-l-2 border-border ml-10">
                    <span className="font-medium">{log.message}</span>
                    {log.context && (
                      <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/50 p-1 rounded overflow-x-auto">
                        {log.context}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
