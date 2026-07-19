/**
 * AdvancedEditor — Studio Preview via OpenReel.
 *
 * One-way preview: Kove sends EDL to OpenReel iframe.
 * Manual edits inside OpenReel are not synced back to Kove yet.
 */

import React, { useRef, useEffect, useState } from "react";
import { useEDL } from "../../stores/project-store";
import { useRouterStore } from "../../stores/router-store";

const OPENREEL_URL = import.meta.env.VITE_OPENREEL_URL || "http://localhost:5173";

export function AdvancedEditor() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const edl = useEDL();
  const [ready, setReady] = useState(false);
  const navigate = useRouterStore((s) => s.navigate);

  useEffect(() => {
    if (!ready || !edl || !iframeRef.current) return;
    iframeRef.current.contentWindow?.postMessage(
      { type: "kove:load-edl", edl },
      OPENREEL_URL,
    );
  }, [ready, edl]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "openreel:ready") {
        setReady(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="h-screen w-screen bg-background overflow-hidden">
      {/* Minimal back button — floats top-left over the editor */}
      <button
        onClick={() => navigate("/simple-editor")}
        className="fixed top-3 left-3 z-[9999] w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-all duration-200"
        aria-label="Back to Simple Editor"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
      </button>

      {/* Mode toggle — floats top-right */}
      <div className="fixed top-3 right-3 z-[9999] flex bg-background-secondary/80 backdrop-blur-sm rounded-[4px] p-0.5 border border-border">
        <button
          onClick={() => navigate("/simple-editor")}
          className="px-3 py-1 rounded-[4px] text-[11px] font-medium text-text-muted hover:text-text-secondary transition-colors"
        >
          Director
        </button>
        <span className="px-3 py-1 rounded-[4px] text-[11px] font-medium bg-primary text-primary-foreground">
          Studio Preview
        </span>
      </div>

      {/* Manual edits warning */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9999] px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-[10px] font-mono backdrop-blur-sm">
        Studio manual edits are not yet synced back to Kove. Use Kove AI controls to make persistent changes.
      </div>

      {/* OpenReel — fullscreen, no border, no margin */}
      <iframe
        ref={iframeRef}
        src={OPENREEL_URL}
        className="absolute inset-0 w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; webgpu"
      />
    </div>
  );
}
