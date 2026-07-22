/**
 * Experimental page — pipeline endpoint tester with real data.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/experimental")({
  component: ExperimentalPage,
});

const TEST_VIDEO = "/Users/hamza/Desktop/reserves/monet-ai-story/monet-reference-edits/2nd imporatnt.MP4";
const PYTHON_AI = "http://localhost:8102";

function ExperimentalPage() {
  const [results, setResults] = useState<Record<string, { status: string; data: any }>>({});

  const run = async (name: string, fn: () => Promise<any>) => {
    setResults((prev) => ({ ...prev, [name]: { status: "running", data: null } }));
    try {
      const data = await fn();
      setResults((prev) => ({ ...prev, [name]: { status: "done", data } }));
    } catch (err: any) {
      setResults((prev) => ({ ...prev, [name]: { status: "error", data: err.message } }));
    }
  };

  const testHealth = () => run("health", async () => {
    const res = await fetch(`${PYTHON_AI}/health`);
    return res.json();
  });

  const testExtractFrames = () => run("extract-frames", async () => {
    const res = await fetch(`${PYTHON_AI}/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: TEST_VIDEO, fps: 2, maxFrames: 10 }),
    });
    return res.json();
  });

  const testDetectCuts = () => run("detect-cuts", async () => {
    // First extract frames
    const fres = await fetch(`${PYTHON_AI}/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: TEST_VIDEO, fps: 2, maxFrames: 20 }),
    });
    const fdata = await fres.json();
    const frameDir = fdata.data.metadata.output_dir;

    // Then detect cuts
    const res = await fetch(`${PYTHON_AI}/detect-cuts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frameDir, fps: 2 }),
    });
    return res.json();
  });

  const testCreateMosaic = () => run("create-mosaic", async () => {
    // Extract frames
    const fres = await fetch(`${PYTHON_AI}/extract-frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: TEST_VIDEO, fps: 2, maxFrames: 20 }),
    });
    const fdata = await fres.json();
    const frameDir = fdata.data.metadata.output_dir;

    // Create mosaic
    const res = await fetch(`${PYTHON_AI}/create-mosaic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frameDir, fps: 2, cols: 5 }),
    });
    const data = await res.json();

    // Open mosaic if it exists
    if (data.data?.exists) {
      window.open(`file://${data.data.path}`, "_blank");
    }

    return data;
  });

  const testAnalyzeDNA = () => run("analyze-dna", async () => {
    const res = await fetch("/api/analyze-dna", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: TEST_VIDEO, fps: 2, type: "reference" }),
    });
    return res.json();
  });

  const tests = [
    { name: "health", label: "Health Check (Python AI)", fn: testHealth },
    { name: "extract-frames", label: "Extract Frames (2fps, 10 max)", fn: testExtractFrames },
    { name: "detect-cuts", label: "Detect Cuts", fn: testDetectCuts },
    { name: "create-mosaic", label: "Create Mosaic", fn: testCreateMosaic },
    { name: "analyze-dna", label: "Analyze DNA (full pipeline)", fn: testAnalyzeDNA },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "2rem", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
        Experimental — Pipeline Tester
      </h1>
      <p style={{ color: "#888", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
        Test: {TEST_VIDEO.split("/").pop()}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {tests.map((t) => (
          <div key={t.name} style={{ border: "1px solid #333", borderRadius: "0.25rem", padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
              <button
                onClick={t.fn}
                disabled={results[t.name]?.status === "running"}
                style={{ padding: "0.4rem 0.8rem", background: "#333", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer", fontSize: "0.75rem" }}
              >
                {results[t.name]?.status === "running" ? "..." : "Run"}
              </button>
              <span style={{ fontSize: "0.875rem" }}>{t.label}</span>
              {results[t.name] && (
                <span style={{ fontSize: "0.75rem", color: results[t.name].status === "error" ? "#f87171" : "#4ade80" }}>
                  {results[t.name].status}
                </span>
              )}
            </div>
            {results[t.name]?.data && (
              <pre style={{ fontSize: "0.7rem", color: "#888", maxHeight: "200px", overflow: "auto", whiteSpace: "pre-wrap" }}>
                {typeof results[t.name].data === "string"
                  ? results[t.name].data
                  : JSON.stringify(results[t.name].data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
