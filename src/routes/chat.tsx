import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useChatThreads } from "@/lib/storage";

export const Route = createFileRoute("/chat")({
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const { threads, hydrated, createThread } = useChatThreads();

  useEffect(() => {
    if (!hydrated) return;
    if (threads.length > 0) {
      navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true });
    } else {
      const t = createThread();
      navigate({ to: "/chat/$threadId", params: { threadId: t.id }, replace: true });
    }
  }, [hydrated, threads, navigate, createThread]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">
      <Link to="/" className="hover:text-foreground">← monet</Link>
      <span className="ml-4">Loading conversation…</span>
    </div>
  );
}