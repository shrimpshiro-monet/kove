// frontend/src/components/Studio/AssetDropZone.tsx
import { useState } from "react";
import { sessionApi } from "./api";

export function AssetDropZone({ sid, assets }: { sid: string; assets: string[] }) {
  const [busy, setBusy] = useState(false);

  const handle = async (kind: "raw" | "reference" | "music", f: File) => {
    setBusy(true);
    try {
      await sessionApi.upload(sid, { [kind]: f });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dropzones">
      <Slot label="🎥 raw footage" k="raw" got={assets.includes("raw_footage")} onPick={handle} accept="video/*" />
      <Slot label="🎯 reference" k="reference" got={assets.includes("reference_video")} onPick={handle} accept="video/*" />
      <Slot label="🎵 music" k="music" got={assets.includes("bgm_main")} onPick={handle} accept="audio/*" />
      {busy && <small>uploading…</small>}
    </section>
  );
}

function Slot({ label, k, got, onPick, accept }: any) {
  return (
    <label className={`slot ${got ? "got" : ""}`}>
      <input type="file" accept={accept}
             onChange={(e) => e.target.files?.[0] && onPick(k, e.target.files[0])} />
      <span>{got ? "✓" : "+"} {label}</span>
    </label>
  );
}
