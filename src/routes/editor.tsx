import { createFileRoute } from "@tanstack/react-router";
import React from "react";

const VibeEditor = React.lazy(() =>
  import("../../apps/web/src/components/editor/VibeEditor").then(m => ({ default: m.VibeEditor }))
);

export const Route = createFileRoute("/editor")({
  ssr: false,
  component: () => (
    <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-background text-text-muted font-mono text-sm">{"> "}loading editor…</div>}>
      <VibeEditor />
    </React.Suspense>
  ),
});
