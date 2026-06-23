// frontend/src/components/Studio/TimelineEditor.tsx
import { useState } from "react";
import { sessionApi } from "./api";

export function TimelineEditor({ sid, actions, duration }: {
  sid: string; actions: any[]; duration: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const clips = actions
    .filter((a) => a.type === "addMedia" && a.trackId?.startsWith("video_"))
    .map((a) => {
      // find its updateClip props if any
      const upd = actions.find((x) => x.type === "updateClip" && x.clipId === a.clipId);
      return { ...a, properties: upd?.properties || {} };
    });

  const captions = actions.filter((a) => a.type === "addCaption");

  const updateSpeed = async (clipId: string, speed: number) => {
    await sessionApi.patch(sid, {
      op: "update",
      actions: [{
        type: "updateClip", trackId: "video_1", clipId,
        properties: { playbackSpeed: speed },
      }],
      target_clip_ids: [clipId],
    });
  };

  const removeClip = async (clipId: string) => {
    await sessionApi.patch(sid, {
      op: "remove",
      target_clip_ids: [clipId],
    });
  };

  return (
    <section className="timeline-editor">
      <div className="te-head">
        <strong>Timeline</strong>
        <span className="dur">⏱ {duration.toFixed(1)}s</span>
      </div>

      <div className="track" data-label="video">
        {clips.length === 0 && <div className="empty">no clips yet</div>}
        {clips.map((c) => {
          const w = Math.max(80, (c.properties.sourceOut || 5) - (c.properties.sourceIn || 0)) * 30;
          return (
            <div
              key={c.clipId}
              className={`clip ${selected === c.clipId ? "selected" : ""}`}
              style={{ width: `${w}px` }}
              onClick={() => setSelected(c.clipId)}
            >
              <div className="clip-name">{c.clipId}</div>
              <div className="clip-meta">
                {c.properties.playbackSpeed && c.properties.playbackSpeed !== 1 &&
                  <span className="badge">{c.properties.playbackSpeed}×</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="track" data-label="text">
        {captions.map((c, i) => (
          <div key={i} className="caption-block"
               style={{ marginLeft: `${c.startTime * 30}px`, width: `${c.duration * 30}px` }}>
            T: {c.text}
          </div>
        ))}
      </div>

      {selected && (
        <div className="inspector">
          <strong>{selected}</strong>
          <label>
            Speed
            <input type="range" min="0.1" max="2" step="0.1"
                   defaultValue={1}
                   onChange={(e) => updateSpeed(selected, parseFloat(e.target.value))} />
          </label>
          <button onClick={() => removeClip(selected)}>🗑 remove</button>
        </div>
      )}
    </section>
  );
}
