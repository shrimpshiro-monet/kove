import { useState } from "react";

export function PromptBar({ onGo, disabled }: {
  onGo: (p: string) => void; disabled: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  return (
    <section className="prompt-bar">
      <textarea
        placeholder="e.g. 'cinematic slow-mo on the dunk, gritty hip-hop drop, HE GOT GAME caption'"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
      />
      <button onClick={() => onGo(prompt)} disabled={disabled || !prompt.trim()}>
        🎬 Vibe Edit
      </button>
    </section>
  );
}
