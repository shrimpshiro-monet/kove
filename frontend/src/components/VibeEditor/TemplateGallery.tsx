// frontend/src/components/VibeEditor/TemplateGallery.tsx
import { useEffect, useState } from "react";

export function TemplateGallery({ sid, onApplied }: { sid: string; onApplied: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

  useEffect(() => {
    fetch(`${BASE}/api/templates/`)
      .then(r => r.json())
      .then(setItems)
      .catch(err => console.error("failed loading templates:", err));
  }, []);

  const apply = async (id: string) => {
    try {
      const res = await fetch(`${BASE}/api/templates/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, template_id: id, params: {} }),
      });
      const d = await res.json();
      if (d.actionCount !== undefined) {
        onApplied();
      } else {
        alert(d.detail || "Template application failed");
      }
    } catch (err: any) {
      alert(`Failed to apply template: ${err.message || err}`);
    }
  };

  return (
    <section className="templates" style={{ marginTop: "16px" }}>
      <h3>🎨 Templates</h3>
      <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
        {items.map(t => (
          <button key={t.id} className="tpl" onClick={() => apply(t.id)} style={{ background: "#16161f", border: "1px solid #2a2a3a", borderRadius: "8px", padding: "12px", color: "white", textAlign: "left", cursor: "pointer" }}>
            <strong style={{ display: "block", color: "#ffd06b" }}>{t.name}</strong>
            <small style={{ color: "#888", display: "block", marginTop: "4px" }}>{t.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
