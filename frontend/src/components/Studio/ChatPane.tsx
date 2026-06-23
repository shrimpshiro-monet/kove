// frontend/src/components/Studio/ChatPane.tsx
import { useEffect, useRef, useState } from "react";
import { ChatMsg, sessionApi } from "./api";

export function ChatPane({ sid, messages }: { sid: string; messages: ChatMsg[] }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const t = text;
    setText("");
    try {
      await sessionApi.message(sid, t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chat-pane">
      <div className="chat-scroll">
        {messages.length === 0 && (
          <div className="empty">
            <p>👋 Drop your footage, then tell me the vibe.</p>
            <p className="hint">try: "cinematic slow-mo on the dunk, gritty hip-hop drop, yellow HE GOT GAME caption"</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="role">{m.role === "user" ? "you" : m.role === "system" ? "✏️ edit" : "monet"}</div>
            <div className="body">{m.content}</div>
            {m.error && <div className="err">⚠️ {m.error}</div>}
          </div>
        ))}
        {busy && <div className="msg msg-assistant"><div className="body">⏳ directing…</div></div>}
        <div ref={endRef} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="tell me the vibe…"
          rows={2}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !text.trim()}>🎬</button>
      </form>
    </section>
  );
}
