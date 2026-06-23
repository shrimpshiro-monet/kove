// src/components/preview/OutputPreview.tsx
import type { MonetEDL } from "../../server/types/edl";

interface Props {
  previewUrl?: string;
  edl: MonetEDL;
}

export function OutputPreview({ previewUrl, edl }: Props) {
  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center aspect-video bg-black/40 rounded-lg border border-white/10 p-8 text-center">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white/80 rounded-full animate-spin mb-4" />
        <p className="text-white font-medium">Rendering preview ({edl.shots.length} shots, {edl.timeline.duration.toFixed(1)}s)...</p>
        <p className="text-white/40 text-sm mt-2 font-mono">This takes 10-30 seconds</p>
      </div>
    );
  }

  return (
    <div className="output-preview aspect-video bg-black rounded-lg overflow-hidden border border-white/10 relative group">
      <video
        src={previewUrl}
        controls
        className="w-full h-full object-contain"
        autoPlay={false}
        poster=""
      />
    </div>
  );
}
