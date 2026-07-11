import { useCallback, useRef, useState } from "react";
import { refineEdit, getRefineStatus } from "../lib/api-client";
import { useProjectStore } from "../stores/project-store";
import type { ProjectEDL as MonetEDL } from "@monet/edl";

const BASE_DELAY = 1000;
const MAX_DELAY = 5000;
const BACKOFF_MULTIPLIER = 2;

export function useRefineEDL() {
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY);
  const loadEDL = useProjectStore((s) => s.loadMonetEDL);
  const resetDirty = useProjectStore((s) => s.resetDirtyFlag);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (input: {
      projectId: string;
      edl: MonetEDL;
      feedback: string;
      scope?: string[];
    }) => {
      setStreaming(true);
      setPartial("");
      setError(null);
      delayRef.current = BASE_DELAY;

      try {
        setPartial("> sending refinement to kove director…");

        const { jobId } = await refineEdit(
          input.edl,
          input.feedback,
          input.scope,
          input.projectId
        );

        setPartial("> analyzing your edit…");

        const poll = async () => {
          try {
            const status = await getRefineStatus(jobId);
            const prevPartial = partial;

            if (status.status === "analyzing") {
              setPartial("> analyzing your edit…");
            } else if (status.status === "generating") {
              setPartial("> building refined cut…");
              delayRef.current = BASE_DELAY; // reset on progress
            } else if (status.status === "complete" && status.result) {
              clearPoll();
              loadEDL(status.result.edl);
              resetDirty();
              setPartial("");
              setStreaming(false);
              return;
            } else if (status.status === "failed") {
              clearPoll();
              setError(status.error || "refinement failed");
              setStreaming(false);
              return;
            }

            // Exponential backoff with jitter
            const jitter = Math.random() * 200;
            delayRef.current = Math.min(delayRef.current * BACKOFF_MULTIPLIER + jitter, MAX_DELAY);
            pollRef.current = setTimeout(poll, delayRef.current);
          } catch {
            // Poll error — retry with backoff
            delayRef.current = Math.min(delayRef.current * BACKOFF_MULTIPLIER, MAX_DELAY);
            pollRef.current = setTimeout(poll, delayRef.current);
          }
        };

        pollRef.current = setTimeout(poll, delayRef.current);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "refinement failed";
        setError(message);
        setStreaming(false);
      }
    },
    [loadEDL, resetDirty, clearPoll, partial]
  );

  const cancel = useCallback(() => {
    clearPoll();
    setStreaming(false);
    setPartial("");
  }, [clearPoll]);

  return { start, cancel, streaming, partial, error };
}
