// frontend/src/components/Studio/PreviewPlayer.tsx
import { sessionApi } from "./api";

export function PreviewPlayer({ sid, previewPath }: { sid: string; previewPath?: string }) {
  if (!previewPath) {
    return (
      <section className="preview-player empty">
        <p>🎬 your preview lands here</p>
      </section>
    );
  }
  return (
    <section className="preview-player">
      <video src={sessionApi.fileUrl(sid, previewPath)}
             controls autoPlay loop muted={false}
             key={previewPath} />
    </section>
  );
}
