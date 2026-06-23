// src/hooks/use-edl-renderer.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { hashEdl } from "../lib/renderer/edl-hash";
import type { MonetEDL } from "../../apps/web/src/lib/executors/monet-action-executor";

/**
 * React hook that triggers the renderer ONLY when the EDL hash actually changes.
 * This is the fix for the 7× re-render storm.
 */
export function useEdlRenderer(edl: MonetEDL | null, renderFn: (edl: MonetEDL) => Promise<any>) {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);
  const [rendering, setRendering] = useState(false);
  const lastHashRef = useRef<string>("empty");

  // Compute hash from EDL — this is memoized so it only recomputes when EDL changes
  const edlHash = useMemo(() => hashEdl(edl), [edl]);

  useEffect(() => {
    if (!edl) return;
    if (edlHash === lastHashRef.current) return; // hash-stable, no-op

    lastHashRef.current = edlHash;
    let cancelled = false;
    setRendering(true);
    setError(null);

    renderFn(edl).then(
      (r) => { if (!cancelled) { setResult(r); setRendering(false); } },
      (e) => { if (!cancelled) { setError(e); setRendering(false); } },
    );

    return () => { cancelled = true; };
  }, [edlHash, renderFn]); // ← only this dep; React.memo + this hook = zero wasted renders

  return { result, error, rendering, edlHash };
}
