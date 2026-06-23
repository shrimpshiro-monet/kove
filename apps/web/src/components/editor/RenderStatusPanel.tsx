import React from "react";
import { useRenderStatus } from "../../hooks/useRenderStatus";

export function RenderStatusPanel({
  jobId,
  apiBaseUrl
}: {
  jobId: string | null;
  apiBaseUrl: string;
}) {
  const status = useRenderStatus(apiBaseUrl, jobId);

  if (!jobId) {
    return <div className="text-xs text-muted-foreground">No render started</div>;
  }

  if (!status) {
    return <div className="text-xs">Loading...</div>;
  }

  return (
    <div className="rounded border p-3 text-xs flex flex-col gap-2 mt-4">
      <div className="font-medium">Job ID: {jobId}</div>
      <div className="capitalize">Status: {status.state}</div>

      <div className="w-full h-2 bg-muted rounded overflow-hidden relative">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${status.progress || 0}%` }}
        />
      </div>

      <div className="text-right font-medium">
        {Math.floor(status.progress || 0)}%
      </div>

      {status.state === "completed" && (
        <div className="text-emerald-600 font-medium mt-1">
          ✅ Render Complete
        </div>
      )}

      {status.state === "failed" && (
        <div className="text-red-600 font-medium mt-1">
          ❌ {status.failedReason || "Render failed"}
        </div>
      )}
    </div>
  );
}
