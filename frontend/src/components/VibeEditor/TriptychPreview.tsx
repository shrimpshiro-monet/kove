import { vibeApi } from "./api";

export function TriptychPreview({ path }: { path: string }) {
  return (
    <section className="triptych">
      <h2>🎞️ All engines, side-by-side</h2>
      <video src={vibeApi.fileUrl(path)} controls loop autoPlay muted />
      <p className="hint">Each quadrant labeled with engine name. Audio = first engine.</p>
    </section>
  );
}
