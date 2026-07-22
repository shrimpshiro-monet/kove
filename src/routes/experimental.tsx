/**
 * Experimental page — simple endpoint tester.
 * Tests legacy and new pipeline endpoints directly via fetch.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/experimental")({
  component: ExperimentalPage,
});

function ExperimentalPage() {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState<string | null>(null);

  const testEndpoint = async (url: string, body: any) => {
    setStatus("testing");
    setResult(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        Experimental — Pipeline Endpoints
      </h1>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>
        Test individual API endpoints directly. Main chat uses the new intent pipeline.
      </p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button
          onClick={() => testEndpoint("/api/health", {})}
          disabled={status === "testing"}
          style={{ padding: "0.5rem 1rem", background: "#333", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
        >
          Health Check
        </button>
        <button
          onClick={() => testEndpoint("/api/analyze-dna", { filePath: "test.mp4", fps: 3 })}
          disabled={status === "testing"}
          style={{ padding: "0.5rem 1rem", background: "#333", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
        >
          /api/analyze-dna
        </button>
        <button
          onClick={() => testEndpoint("/api/compile-intent", { editDNA: {}, manifest: { clips: [] }, prompt: "test" })}
          disabled={status === "testing"}
          style={{ padding: "0.5rem 1rem", background: "#333", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
        >
          /api/compile-intent
        </button>
        <button
          onClick={() => testEndpoint("/api/pipeline", { filePath: "test.mp4", clipPaths: [], prompt: "test" })}
          disabled={status === "testing"}
          style={{ padding: "0.5rem 1rem", background: "#333", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
        >
          /api/pipeline
        </button>
      </div>

      <div style={{ marginBottom: "0.5rem", color: "#888" }}>
        Status: <span style={{ color: "#fff" }}>{status}</span>
      </div>

      {result && (
        <pre style={{ padding: "1rem", background: "#111", border: "1px solid #333", borderRadius: "0.25rem", fontSize: "0.75rem", overflow: "auto", maxHeight: "400px", whiteSpace: "pre-wrap" }}>
          {result}
        </pre>
      )}
    </div>
  );
}
