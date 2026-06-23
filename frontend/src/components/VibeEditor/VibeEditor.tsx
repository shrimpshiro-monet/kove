// frontend/src/components/VibeEditor/VibeEditor.tsx
import { useEffect, useState } from "react";
import { vibeApi, SessionState } from "./api";
import { PromptBar } from "./PromptBar";
import { TriptychPreview } from "./TriptychPreview";
import { EnginePicker } from "./EnginePicker";
import { ProgressPanel } from "./ProgressPanel";
import { ExportButtons } from "./ExportButtons";
import { TemplateGallery } from "./TemplateGallery";
import { RegenerateBar } from "./RegenerateBar";
import "./vibe.css";

export function VibeEditor() {
  const [sid, setSid] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [raw, setRaw] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    vibeApi.newSession().then((r) => setSid(r.sessionId));
  }, []);

  const refresh = async () => {
    if (!sid) return;
    setState(await vibeApi.status(sid));
  };

  const handleGo = async (prompt: string) => {
    if (!sid || !raw) return alert("upload raw footage first");
    try {
      setBusy("uploading…");
      await vibeApi.upload(sid, { raw, reference: reference ?? undefined, music: music ?? undefined });
      setBusy("planning with Gemini…");
      await vibeApi.prompt(sid, prompt);
      setBusy("rendering on all engines… (this may take a min)");
      await vibeApi.render(sid);
      await refresh();
    } catch (err: any) {
      alert(`Render failed: ${err.message || err}`);
    } finally {
      setBusy(null);
    }
  };

  const handleFinalize = async (engine: string) => {
    if (!sid) return;
    setBusy(`finalizing with ${engine}…`);
    await vibeApi.finalize(sid, engine);
    await refresh();
    setBusy(null);
  };

  return (
    <div className="vibe-editor" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px", maxWidth: "1280px" }}>
      <main style={{ gridColumn: "1" }}>
        <header>
          <h1>🎨 Monet — Vibe Editor</h1>
          <p className="tag">prompt → AI directs → 4 engines race → you pick the vibe</p>
        </header>

        <section className="uploads" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", margin: "24px 0" }}>
          <FileSlot label="Raw footage " file={raw} onPick={setRaw} accept="video/*" />
          <FileSlot label="Reference (optional)" file={reference} onPick={setReference} accept="video/*" />
          <FileSlot label="Music (optional)" file={music} onPick={setMusic} accept="audio/*" />
        </section>

        <PromptBar onGo={handleGo} disabled={!!busy || !raw} />

        {busy && <div className="busy" style={{ background: "#1c1c28", padding: "12px 16px", borderRadius: "10px", color: "#ffd06b", margin: "12px 0" }}>⏳ {busy}</div>}

        {state?.status === "preview_ready" && state.triptychPath && (
          <>
            <TriptychPreview path={state.triptychPath} />
            <EnginePicker
              scores={state.scores}
              engines={state.engines}
              winner={state.winner}
              onPick={handleFinalize}
            />
          </>
        )}

        {state?.status === "finalized" && state.finalPath && (
          <section className="final" style={{ background: "#16161f", padding: "20px", borderRadius: "16px", marginTop: "24px", textAlign: "center" }}>
            <h2>✨ Your final cut</h2>
            <video src={vibeApi.fileUrl(state.finalPath)} controls autoPlay style={{ maxWidth: "600px", borderRadius: "12px", marginTop: "16px" }} />
            <div style={{ marginTop: "16px" }}>
              <a href={vibeApi.fileUrl(state.finalPath)} download style={{ display: "inline-block", background: "#5cdc9d", color: "#111", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>⬇️ Download</a>
            </div>
          </section>
        )}
      </main>

      <aside style={{ gridColumn: "2", display: "flex", flexDirection: "column", gap: "16px" }}>
        {sid && <TemplateGallery sid={sid} onApplied={refresh} />}
        {sid && state && state.status === "preview_ready" && (
          <>
            <ProgressPanel sid={sid} />
            <RegenerateBar sid={sid} onDone={refresh} />
          </>
        )}
        {sid && state && state.status === "finalized" && <ExportButtons sid={sid} />}
      </aside>
    </div>
  );
}

function FileSlot({ label, file, onPick, accept }: {
  label: string; file: File | null; onPick: (f: File) => void; accept: string;
}) {
  return (
    <label className="file-slot" style={{ background: "#16161f", padding: "16px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "8px", cursor: "pointer" }}>
      <span>{label}</span>
      <input type="file" accept={accept} style={{ display: "none" }}
             onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
      {file ? <small style={{ color: "#5cdc9d", wordBreak: "break-all" }}>{file.name}</small> : <small style={{ color: "#555" }}>Choose file...</small>}
    </label>
  );
}
