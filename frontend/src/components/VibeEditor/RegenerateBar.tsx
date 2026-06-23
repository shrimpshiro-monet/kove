// frontend/src/components/VibeEditor/RegenerateBar.tsx
import { useState } from "react";

export function RegenerateBar({ sid, onDone }: { sid: string; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [intensity, setIntensity] = useState(0.5);
  const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

  const submit = async () => {
    try {
      const res = await fetch(`${BASE}/api/vibe/${sid}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, intensity }),
      });
      const d = await res.json();
      if (d.status === "preview_ready" || d.status === "planned") {
        onDone();
      } else {
        alert(d.detail || "Regeneration failed");
      }
    } catch (err: any) {
      alert(`Regeneration failed: ${err.message || err}`);
    }
  };

  return (
    <section className="regen" style={{ marginTop: "16px", background: "#16161f", padding: "16px", borderRadius: "12px", border: "1px solid #2a2a3a" }}>
      <h3>♻️ Tell Gemini what to fix</h3>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="e.g. 'make caption bigger, slow-mo longer, dim BG more'"
        rows={2}
        style={{ width: "100%", background: "#0b0b10", color: "white", padding: "8px", border: "1px solid #2a2a3a", borderRadius: "6px", resize: "vertical", fontSize: "14px", marginTop: "8px" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
        <label style={{ fontSize: "14px", color: "#aaa" }}>
          intensity: <input type="range" min="0" max="1" step="0.1"
                            value={intensity} onChange={e => setIntensity(parseFloat(e.target.value))}
                            style={{ verticalAlign: "middle" }} />
          {" "}{intensity.toFixed(1)}
        </label>
        <button onClick={submit} style={{ background: "#ffd06b", color: "#111", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
          ♻️ Re-vibe
        </button>
      </div>
    </section>
  );
}
