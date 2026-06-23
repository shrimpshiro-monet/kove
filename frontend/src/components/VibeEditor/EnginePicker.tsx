// frontend/src/components/VibeEditor/EnginePicker.tsx
import { EngineScore } from "./api";

export function EnginePicker({ scores, engines, winner, onPick }: {
  scores: Record<string, EngineScore>;
  engines: string[];
  winner: string | null;
  onPick: (engine: string) => void;
}) {
  return (
    <section className="engine-picker">
      <h2>🏆 Pick your favorite (or trust the winner)</h2>
      <div className="scorecard">
        {engines.map((e) => {
          const s = scores[e];
          const isWinner = e === winner;
          return (
            <div key={e} className={`card ${isWinner ? "winner" : ""}`}>
              <div className="head">
                <strong>{e}</strong>
                {isWinner && <span className="badge">👑 auto-pick</span>}
              </div>
              <div className="metrics">
                <Metric label="overall" v={s?.overall} max={1} />
                <Metric label="resolution" v={s?.resolution_ok ? 1 : 0} max={1} />
                <Metric label="duration match" v={s?.duration_match} max={1} />
                {s?.render_time_sec !== undefined && (
                  <small>{s.render_time_sec.toFixed(1)}s render</small>
                )}
              </div>
              <button onClick={() => onPick(e)}>Use this one</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, v, max }: { label: string; v?: number; max: number }) {
  const pct = v != null ? (v / max) * 100 : 0;
  return (
    <div className="metric">
      <span>{label}</span>
      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
