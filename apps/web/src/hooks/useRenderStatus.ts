import { useEffect, useState } from "react";

interface RenderStatus {
  state: string;
  progress: number;
  returnvalue?: any;
  failedReason?: string;
}

export function useRenderStatus(apiBaseUrl: string, jobId: string | null) {
  const [status, setStatus] = useState<RenderStatus | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let interval: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/render-status/${jobId}`);
        const json = await res.json();

        if (json.success) {
          setStatus(json.data);

          if (
            json.data.state === "completed" ||
            json.data.state === "failed"
          ) {
            if (interval) clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Failed to fetch render status", err);
      }
    };

    fetchStatus();
    interval = setInterval(fetchStatus, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, apiBaseUrl]);

  return status;
}
