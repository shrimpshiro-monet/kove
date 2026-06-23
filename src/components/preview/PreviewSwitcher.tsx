// src/components/preview/PreviewSwitcher.tsx
import { useState } from "react";
import { OutputPreview } from "./OutputPreview";
import { BlueprintPreview } from "./BlueprintPreview";
import type { MonetEDL } from "../../server/types/edl";

interface Props {
  edl: MonetEDL;
  previewUrl?: string;      // Server-rendered MP4 URL
  clipProxyUrls: Record<string, string>;
}

export function PreviewSwitcher({ edl, previewUrl, clipProxyUrls }: Props) {
  const [mode, setMode] = useState<"output" | "blueprint">("output");

  return (
    <div className="preview-system flex flex-col h-full bg-[#050505] rounded-xl overflow-hidden border border-white/10 shadow-2xl">
      {/* Tab Controls */}
      <div className="preview-tabs flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5">
         <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
          <button
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              mode === "output" 
                ? "bg-white text-black shadow-lg" 
                : "text-white/40 hover:text-white/60 hover:bg-white/5"
            }`}
            onClick={() => setMode("output")}
          >
            ▶ OUTPUT
          </button>
          <button
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              mode === "blueprint" 
                ? "bg-white text-black shadow-lg" 
                : "text-white/40 hover:text-white/60 hover:bg-white/5"
            }`}
            onClick={() => setMode("blueprint")}
          >
            🎬 BLUEPRINT
          </button>
        </div>
        
        <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${previewUrl ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-amber-500 animate-pulse'}`} />
           <span className="text-[10px] font-bold tracking-tighter text-white/40 uppercase">
             {previewUrl ? 'Ready' : 'Rendering'}
           </span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative min-h-[400px]">
        {mode === "output" ? (
          <div className="absolute inset-0 p-4">
            <OutputPreview
              previewUrl={previewUrl}
              edl={edl}
            />
          </div>
        ) : (
          <div className="absolute inset-0 p-4 overflow-auto">
            <BlueprintPreview
              edl={edl}
              clipProxyUrls={clipProxyUrls}
            />
          </div>
        )}
      </div>
    </div>
  );
}
