// frontend/src/components/Studio/Studio.tsx
import { useEffect, useRef, useState } from "react";
import { sessionApi, SessionState } from "./api";
import { ChatPane } from "./ChatPane";
import { TimelineEditor } from "./TimelineEditor";
import { PreviewPlayer } from "./PreviewPlayer";
import { AssetDropZone } from "./AssetDropZone";
import "./studio.css";

// Get base URL for WebSocket
const BASE = import.meta.env.VITE_API_BASE || "";

export function Studio() {
  const [sid, setSid] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    sessionApi.create().then((r) => setSid(r.sessionId));
  }, []);

  useEffect(() => {
    if (!sid) return;
    
    // Dynamically resolve WebSocket host/protocol
    const baseHost = BASE ? BASE.replace(/^https?:\/\//, "") : location.host;
    const isSecure = BASE ? BASE.startsWith("https") : location.protocol === "https:";
    const proto = isSecure ? "wss" : "ws";
    
    const ws = new WebSocket(`${proto}://${baseHost}/api/session/${sid}/ws`);
    wsRef.current = ws;
    
    ws.onmessage = (m) => {
      if (m.data === "pong") return;
      try {
        const e = JSON.parse(m.data);
        handleEvent(e);
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };
    
    const keepalive = setInterval(() => {
      if (ws.readyState === 1) {
        ws.send("ping");
      }
    }, 25000);
    
    return () => {
      clearInterval(keepalive);
      ws.close();
    };
  }, [sid]);

  const handleEvent = (e: any) => {
    setState((prev) => {
      const next = { ...(prev || {}) } as any;
      switch (e.event) {
        case "snapshot":
          return { ...e };
        case "chat.user":
          next.chat = [...(prev?.chat || []), {
            role: "user", content: e.text, timestamp: Date.now()/1000,
            id: crypto.randomUUID(),
          }];
          break;
        case "chat.assistant":
          next.chat = [...(prev?.chat || []), {
            role: "assistant", content: e.text, timestamp: Date.now()/1000,
            id: e.id,
          }];
          break;
        case "chat.system":
          next.chat = [...(prev?.chat || []), {
            role: "system", content: e.text, timestamp: Date.now()/1000,
            id: crypto.randomUUID(),
          }];
          break;
        case "chat.error":
          next.chat = (prev?.chat || []).map((m: any) =>
            m.id === e.id ? { ...m, error: e.error } : m);
          break;
        case "timeline.updated":
          next.actions = e.actions;
          next.version = e.version;
          next.duration = e.duration;
          break;
        case "preview.ready":
          next.currentPreview = e.previewPath;
          next.lastStats = e.stats;
          break;
        case "style.detected":
          next.styleSummary = e.summary;
          break;
        case "assets.updated":
          next.assets = e.assets;
          break;
      }
      return next;
    });
  };

  if (!sid) return <div className="loading">starting session…</div>;

  return (
    <div className="studio">
      <header className="studio-head">
        <h1>🎨 Monet Studio</h1>
        {state?.styleSummary && (
          <div className="vibe-chip">📐 vibe: {state.styleSummary}</div>
        )}
        {state?.lastStats && (
          <div className="render-chip">
            ⚡ {state.lastStats.cached}/{state.lastStats.totalSegments} cached
            {state.lastStats.rerendered > 0 && ` · ${state.lastStats.rerendered} rerendered`}
          </div>
        )}
      </header>

      <div className="studio-grid">
        <div className="col-left">
          <AssetDropZone sid={sid} assets={state?.assets || []} />
          <ChatPane sid={sid} messages={state?.chat || []} />
        </div>

        <div className="col-right">
          <PreviewPlayer sid={sid} previewPath={state?.currentPreview} />
          <TimelineEditor
            sid={sid}
            actions={state?.actions || []}
            duration={state?.duration || 0}
          />
        </div>
      </div>
    </div>
  );
}
export default Studio;
