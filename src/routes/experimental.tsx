/**
 * Experimental page — legacy two-pass EDL generation pipeline.
 * This pipeline is kept for A/B testing and backward compatibility.
 * The main chat route uses the new intent pipeline (runIntentPipeline).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { runGenerationPipeline, type PipelineStage } from "../apps/web/src/lib/kove-generation-pipeline";

export const Route = createFileRoute("/experimental")({
  component: ExperimentalPage,
});

function ExperimentalPage() {
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setStage("uploading");
    setError(null);
    setResult(null);

    try {
      const res = await runGenerationPipeline({
        projectId: "experimental-test",
        files: [],
        prompt: "Test edit with legacy pipeline",
        onStageChange: setStage,
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Experimental — Legacy Pipeline</h1>
      <p className="text-neutral-400 mb-6">
        This page tests the legacy two-pass EDL generation pipeline.
        The main chat route uses the new intent pipeline instead.
      </p>

      <div className="space-y-4">
        <div>
          <span className="text-sm text-neutral-500">Status:</span>
          <span className="ml-2 text-sm">{stage}</span>
        </div>

        <button
          onClick={handleTest}
          disabled={stage !== "idle"}
          className="px-4 py-2 bg-neutral-800 rounded hover:bg-neutral-700 disabled:opacity-50"
        >
          Run Legacy Pipeline
        </button>

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded">
            <pre className="text-xs overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
