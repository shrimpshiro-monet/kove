// frontend/src/components/VibeEditor/useProgress.ts
import { useEffect, useState } from "react";

export interface EngineProgress {
  status: "idle" | "running" | "done" | "error";
  outputPath?: string;
  error?: string;
  renderTimeSec?: number;
}

export function useProgress(sid: string | null) {
  const [engines, setEngines] = useState<Record<string, EngineProgress>>({});
  const [timeline, setTimeline] = useState<any>(null);

  useEffect(() => {
    if (!sid) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // We assume backend runs on BASE port 8000, so we can point to local BASE
    const host = import.meta.env.VITE_API_BASE ? import.meta.env.VITE_API_BASE.replace(/^https?:\/\//, "") : location.host;
    const ws = new WebSocket(`${proto}://${host}/api/ws/session/${sid}`);
    
    ws.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.event === "engine.start")
        setEngines(p => ({...p, [e.engine]: { status: "running" }}));
      if (e.event === "engine.done")
        setEngines(p => ({...p, [e.engine]: { status: "done", outputPath: e.outputPath, renderTimeSec: e.renderTimeSec }}));
      if (e.event === "engine.error")
        setEngines(p => ({...p, [e.engine]: { status: "error", error: e.error }}));
      if (e.event === "timeline.built") 
        setTimeline(e);
    };

    const ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 20000);
    return () => { 
      clearInterval(ping); 
      ws.close(); 
    };
  }, [sid]);

  return { engines, timeline };
}
