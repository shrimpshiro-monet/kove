// frontend/src/components/VibeEditor/ExportButtons.tsx
const PLATFORMS = ["tiktok", "reels", "shorts", "x_post", "youtube", "square"];

export function ExportButtons({ sid }: { sid: string }) {
  const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
  
  const handle = async (p: string) => {
    try {
      const r = await fetch(`${BASE}/api/export/${sid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: p }),
      });
      const d = await r.json();
      if (d.path) {
        window.open(`${BASE}/api/vibe/file?path=${encodeURIComponent(d.path)}`);
      } else {
        alert(d.detail || "Export failed");
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message || err}`);
    }
  };
  
  return (
    <section className="exports">
      <h3>📲 Export for…</h3>
      <div className="button-grid" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
        {PLATFORMS.map(p => (
          <button key={p} onClick={() => handle(p)} style={{ padding: "8px 16px", borderRadius: "6px", background: "#2a2a3a", border: "none", color: "white", cursor: "pointer" }}>
            {p}
          </button>
        ))}
      </div>
    </section>
  );
}
