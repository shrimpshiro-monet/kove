// frontend/src/components/VibeEditor/ProgressPanel.tsx
import { useProgress } from "./useProgress";

export function ProgressPanel({ sid }: { sid: string }) {
  const { engines, timeline } = useProgress(sid);
  const list = Object.entries(engines);
  if (!list.length) return null;
  return (
    <section className="progress-panel">
      <h3>⚡ Live render progress</h3>
      {timeline && <p>📐 timeline: {timeline.duration?.toFixed(1)}s, {timeline.segments} segs</p>}
      {list.map(([name, p]) => (
        <div key={name} className={`prog-row prog-${p.status}`}>
          <strong>{name}</strong>
          <span>{p.status === "done" ? `✅ ${p.renderTimeSec?.toFixed(1)}s` :
                 p.status === "error" ? `❌ ${p.error}` :
                 p.status === "running" ? "⏳ rendering…" : "—"}</span>
        </div>
      ))}
    </section>
  );
}
