import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Send, Sparkles, Film, Paperclip, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatThreads, cryptoId, type ChatMessage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { VideoUploader } from "@/components/chat/VideoUploader";
import { ThinkingPanel, type ThinkingStage } from "@/components/chat/ThinkingPanel";
import { EDLPreview } from "@/components/chat/EDLPreview";
import { VideoPreview } from "@/components/chat/VideoPreview";
import { decodeIntent, analyzeMedia, generateEDL, uploadFile } from "@/lib/api-client";

interface UploadedFile {
  id: string;
  file: File;
  type: "footage" | "music" | "reference";
  preview?: string;
}

export const Route = createFileRoute("/chat_/$threadId")({
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = useParams({ from: "/chat_/$threadId" });
  const navigate = useNavigate();
  const { threads, hydrated, createThread, deleteThread, updateThread } = useChatThreads();
  const [draft, setDraft] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [thinkingStage, setThinkingStage] = useState<ThinkingStage>("idle");
  const [thinkingData, setThinkingData] = useState<any>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = threads.find((t) => t.id === threadId);

  useEffect(() => {
    if (!hydrated) return;
    if (!active && threads.length > 0) {
      navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true });
    } else if (!active && threads.length === 0) {
      const t = createThread();
      navigate({ to: "/chat/$threadId", params: { threadId: t.id }, replace: true });
    }
  }, [hydrated, active, threads, navigate, createThread]);

  useEffect(() => {
    taRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !active || isGenerating) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: cryptoId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    updateThread(threadId, (t) => ({
      ...t,
      title: t.messages.length === 0 ? text.slice(0, 40) : t.title,
      updatedAt: Date.now(),
      messages: [...t.messages, userMsg],
    }));

    setDraft("");
    setIsGenerating(true);
    setThinkingData({});

    try {
      // Stage 1: Intent Extraction
      setThinkingStage("intent");
      const intentRes = await decodeIntent(text, threadId);

      if (!intentRes.success) {
        throw new Error(intentRes.error || "Intent extraction failed");
      }

      setThinkingData((prev: any) => ({
        ...prev,
        intentConfidence: intentRes.result?.confidence,
      }));

      // Stage 2: Analysis (mock for now - need actual uploads)
      setThinkingStage("analysis");

      // Get uploaded file IDs (mock for now)
      const footageIds = uploadedFiles
        .filter((f) => f.type === "footage")
        .map((f) => `mock-${f.file.name}`);
      const musicId = uploadedFiles.find((f) => f.type === "music")
        ? `mock-music-${Date.now()}`
        : undefined;

      const analysisRes = await analyzeMedia(threadId, footageIds, musicId);

      if (!analysisRes.success) {
        throw new Error(analysisRes.error || "Analysis failed");
      }

      // Stage 3: EDL Generation
      setThinkingStage("edl");
      const edlRes = await generateEDL(
        threadId,
        intentRes.intentId!,
        analysisRes.analysisId!
      );

      if (!edlRes.success) {
        throw new Error(edlRes.error || "EDL generation failed");
      }

      setThinkingData((prev: any) => ({
        ...prev,
        edlShots: edlRes.edl?.shots.length || 0,
        scores: edlRes.scores,
        usedFallback: edlRes.usedFallback,
      }));

      setThinkingStage("complete");

      // Store EDL for preview
      setThinkingData((prev: any) => ({
        ...prev,
        edl: edlRes.edl,
      }));

      // Add assistant response
      const assistantMsg: ChatMessage = {
        id: cryptoId(),
        role: "assistant",
        content: generateSuccessMessage(edlRes),
        createdAt: Date.now(),
      };

      updateThread(threadId, (t) => ({
        ...t,
        updatedAt: Date.now(),
        messages: [...t.messages, assistantMsg],
      }));
    } catch (error) {
      console.error("Generation error:", error);
      setThinkingStage("error");
      setThinkingData((prev: any) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
      }));

      // Add error message
      const errorMsg: ChatMessage = {
        id: cryptoId(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        createdAt: Date.now(),
      };

      updateThread(threadId, (t) => ({
        ...t,
        updatedAt: Date.now(),
        messages: [...t.messages, errorMsg],
      }));
    } finally {
      setIsGenerating(false);
      setTimeout(() => setThinkingStage("idle"), 3000);
    }
  };

  function generateSuccessMessage(edlRes: any): string {
    const shots = edlRes.edl?.shots.length || 0;
    const duration = edlRes.edl?.timeline.duration || 30;
    const avgShot = shots > 0 ? (duration / shots).toFixed(1) : "0";
    const beatSync = edlRes.scores?.beatSyncScore
      ? Math.round(edlRes.scores.beatSyncScore * 100)
      : 0;

    let message = `✨ Edit complete!\n\n`;
    message += `📊 ${shots} shots, ${duration}s total (${avgShot}s avg)\n`;
    message += `🎵 Beat sync: ${beatSync}%\n`;

    if (edlRes.usedFallback) {
      message += `\n⚠️ Generated with deterministic fallback (LLM busy)`;
    }

    message += `\n\nReady to preview and refine!`;

    return message;
  }

  const handleNew = () => {
    const t = createThread();
    navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
  };

  const handleDelete = (id: string) => {
    deleteThread(id);
    if (id === threadId) {
      const remaining = threads.filter((t) => t.id !== id);
      if (remaining.length > 0) {
        navigate({ to: "/chat/$threadId", params: { threadId: remaining[0].id } });
      } else {
        const t = createThread();
        navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
      }
    }
  };

  return (
    <div className="grid h-screen grid-cols-[260px_1fr] bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-border bg-sidebar">
        <Link to="/" className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-xs font-medium tracking-[0.3em] uppercase">monet</span>
        </Link>
        <div className="px-3 py-3">
          <Button
            onClick={handleNew}
            className="w-full justify-start gap-2 bg-secondary text-foreground hover:bg-secondary/70"
            size="sm"
          >
            <Plus className="h-4 w-4" /> New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {threads.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-2 text-sm cursor-pointer",
                t.id === threadId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <button
                className="flex-1 truncate text-left"
                onClick={() =>
                  navigate({ to: "/chat/$threadId", params: { threadId: t.id } })
                }
              >
                {t.title || "New conversation"}
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background/50 transition-opacity"
                aria-label="Delete thread"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-sidebar-border p-3">
          <Link
            to="/studio"
            className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Film className="h-3.5 w-3.5" /> Open Studio
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>

      {/* Main chat */}
      <main className="flex flex-col h-screen">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
              Simple mode
            </div>
            <h1 className="text-base font-medium truncate max-w-md">
              {active?.title || "New conversation"}
            </h1>
          </div>
          <Link
            to="/studio"
            className="text-xs text-muted-foreground hover:text-primary tracking-widest uppercase flex items-center gap-1.5"
          >
            Advanced <ArrowRight className="h-3 w-3" />
          </Link>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-10">
            {active && active.messages.length === 0 && <EmptyChat />}
            {active?.messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}

            {/* Show thinking panel during generation */}
            {isGenerating && (
              <div className="mt-6">
                <ThinkingPanel
                  stage={thinkingStage}
                  intentConfidence={thinkingData.intentConfidence}
                  edlShots={thinkingData.edlShots}
                  scores={thinkingData.scores}
                  usedFallback={thinkingData.usedFallback}
                  error={thinkingData.error}
                />
              </div>
            )}

            {/* Show EDL preview after complete */}
            {thinkingStage === "complete" && thinkingData.edl && (
              <div className="mt-6 space-y-6">
                <EDLPreview edl={thinkingData.edl} />

                {/* Video Preview with Playback */}
                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-medium mb-4">Preview</h3>
                  <VideoPreview edl={thinkingData.edl} mediaUrls={mediaUrls} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-background">
          <div className="mx-auto max-w-3xl px-6 py-4 space-y-4">
            {/* File uploader (show if no messages yet) */}
            {active && active.messages.length === 0 && (
              <VideoUploader
                onFilesChange={(files) => {
                  setUploadedFiles(files);

                  // Create blob URLs for local playback
                  const urls = new Map<string, string>();
                  for (const file of files) {
                    if (file.type === "footage") {
                      const blobUrl = URL.createObjectURL(file.file);
                      urls.set(file.id, blobUrl);
                    }
                  }
                  setMediaUrls(urls);
                }}
                disabled={isGenerating}
              />
            )}

            {/* Prompt input */}
            <div className="relative rounded-xl border border-border bg-card focus-within:border-primary/50 transition-colors">
              <Textarea
                ref={taRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Describe the edit you want… (e.g. ‘make a 30s anime AMV cut to the beat’)"
                className="min-h-[80px] resize-none border-0 bg-transparent px-4 py-3 pr-12 focus-visible:ring-0"
                disabled={isGenerating}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <div className="absolute right-2 bottom-2">
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={!draft.trim() || isGenerating}
                  className="h-8 w-8 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">
              {uploadedFiles.length > 0
                ? `${uploadedFiles.length} file(s) ready • Monet will analyze and edit`
                : "Upload footage and music to get started"}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 mb-8">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {message.content}
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex flex-col items-center text-center pt-20 pb-10 gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="text-2xl font-serif">What should we edit?</h2>
      <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
        Drop a clip and tell Monet the vibe. Anime, sports, fan edits — anything goes.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-6 w-full max-w-2xl">
        {[
          "Make a 30s hype reel from this match",
          "Anime AMV cut to this song",
          "Color-grade this like Wong Kar-wai",
        ].map((s) => (
          <div
            key={s}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground text-left hover:border-primary/50 hover:text-foreground cursor-pointer transition-colors"
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

