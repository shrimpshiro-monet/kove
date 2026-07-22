/**
 * Experimental page — legacy pipeline test.
 * Simplified to avoid importing the heavy pipeline module.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/experimental")({
  component: ExperimentalPage,
});

function ExperimentalPage() {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState<string | null>(null);

  const testPipeline = async () => {
    setStatus("testing");
    try {
      const res = await fetch("/api/generate-edl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "experimental-test",
          intentId: "",
          analysisId: "",
          prompt: "Test edit",
        }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
      setStatus("done");
    } catch (err: any) {
      setResult(err.message);
      setStatus("error");
    }
  };

  const testIntentPipeline = async () => {
    setStatus("testing");
    try {
      const res = await fetch("/api/analyze-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "test.mp4", fps: 3 }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
      setStatus("done");
    } catch (err: any) {
      setResult(err.message);
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
        Experimental — Pipeline Testing
      </h1>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>
        Test individual pipeline endpoints. The main chat uses the new intent pipeline.
      </p>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <button
          onClick={testPipeline}
          disabled={status === "testing"}
          style={{
            padding: "0.5rem 1rem",
            background: "#333",
            color: "#fff",
            border: "none",
            borderRadius: "0.25rem",
            cursor: "pointer",
          }}
        >
          Test Legacy /api/generate-edl
        </button>

        <button
          onClick={testIntentPipeline}
          disabled={status === "testing"}
          style={{
            padding: "0.5rem 1rem",
            background: "#333",
            color: "#fff",
            border: "none",
            borderRadius: "0.25rem",
            cursor: "pointer",
          }}
        >
          Test New /api/analyze-dna
        </button>
      </div>

      <div style={{ marginBottom: "0.5rem", color: "#888" }}>
        Status: <span style={{ color: "#fff" }}>{status}</span>
      </div>

      {result && (
        <pre
          style={{
            padding: "1rem",
            background: "#111",
            border: "1px solid #333",
            borderRadius: "0.25rem",
            fontSize: "0.75rem",
            overflow: "auto",
            maxHeight: "400px",
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
