import React, { useState, useCallback, useRef, useEffect } from "react";
import { useProjectStore, useEDL, useDuration } from "../../../stores/project-store";
import { useRefineEDL } from "../../../hooks/useRefineEDL";
import { useRouterStore } from "../../../stores/router-store";
import { runGenerationPipeline, type PipelineStage } from "../../../lib/kove-generation-pipeline";
import { ProjectHeader } from "./ProjectHeader";
import { VideoPreview } from "./VideoPreview";
import { ChatStream } from "./ChatStream";
import { ChatInputDock } from "./ChatInputDock";
import type { ChatMessage, UploadedFile, EditorStage } from "./types";

const QUICK_TAGS = [
  "More intense",
  "Cleaner cuts",
  "Add slow-mo",
  "Match beat",
  "Regenerate section",
  "Explain this edit",
];

function uid() {
  return crypto.randomUUID().slice(0, 8);
}

// Pipeline stages map to ProgressPipeline steps
const PIPELINE_STAGES: EditorStage[] = ["idle", "uploading", "analyzing", "generating", "ready"];

function getPipelineStep(stage: EditorStage): number {
  switch (stage) {
    case "uploading": return 0;
    case "analyzing": return 2;
    case "generating": return 4;
    case "ready": return 6;
    default: return 0;
  }
}

export function SimpleEditorPage() {
  const project = useProjectStore((s) => s.project);
  const edl = useEDL();
  const duration = useDuration();
  const bootstrapProject = useProjectStore((s) => s.bootstrapEmptyProject);
  const applyEDL = useProjectStore((s) => s.applyMonetEDLToProject);

  const [stage, setStage] = useState<EditorStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [projectName, setProjectName] = useState("Untitled cut");
  const [scope, setScope] = useState<{ from: number; to: number } | null>(null);
  const navigate = useRouterStore((s) => s.navigate);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const projectIdRef = useRef(`proj-${Date.now()}`);
  const { start: startRefine, cancel: cancelRefine, streaming, partial } = useRefineEDL();

  const hasEdit = (edl?.timeline?.tracks?.flatMap((t: any) => t.clips ?? []).length ?? 0) > 0;
  const isGenerating = stage === "uploading" || stage === "analyzing" || stage === "generating" || stage === "regenerating";
  const pipelineStep = getPipelineStep(stage);

  useEffect(() => {
    if (!project) bootstrapProject();
  }, [project, bootstrapProject]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partial]);

  // Reset stage when refinement completes
  useEffect(() => {
    if (stage === "regenerating" && !streaming) {
      setStage("ready");
    }
  }, [streaming, stage]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((patch: Partial<ChatMessage>) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = { ...last, ...patch };
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async (prompt: string) => {
    if (!prompt.trim() || uploadedFiles.length === 0) return;
    const pid = projectIdRef.current;

    setStage("uploading");
    setError(null);

    const userId = uid();
    addMessage({ id: userId, role: "user", text: prompt, timestamp: Date.now() });

    try {
      const pipelineResult = await runGenerationPipeline({
        projectId: pid,
        files: uploadedFiles.map((f) => ({ file: f.file, type: f.type as any })),
        prompt,
        onStageChange: (s: PipelineStage) => setStage(s as EditorStage),
      });

      if (!pipelineResult.success || !pipelineResult.edl) {
        throw new Error(pipelineResult.error || "Generation failed");
      }

      // Apply EDL to Zustand store
      const generatedEdl = pipelineResult.edl as any;
      const mediaItems = uploadedFiles
        .filter((f) => f.r2FileId)
        .map((f) => ({
          id: f.r2FileId!,
          path: pipelineResult.mediaUrlMap[f.r2FileId!] || "",
          duration: 0,
          type: f.type === "music" ? ("audio" as const) : ("video" as const),
        }));

      await applyEDL(generatedEdl, mediaItems, pipelineResult.mediaUrlMap);

      setStage("ready");

      const clipCount = generatedEdl.shots?.length ?? 0;
      const dur = generatedEdl.timeline?.duration ?? 0;
      const effectsApplied = (generatedEdl.shots ?? []).reduce(
        (count: number, c: any) => count + (c.effects?.length ?? 0), 0
      );

      addMessage({
        id: uid(),
        role: "kove",
        text: `edit complete — ${clipCount} scenes, ${dur.toFixed(1)}s runtime${effectsApplied > 0 ? `, ${effectsApplied} effects` : ""}.`,
        timestamp: Date.now(),
        metrics: { clips: clipCount, duration: dur, onBeat: 68, slowMo: 0 },
        actions: [
          { label: "regenerate this cut", variant: "ghost" },
          { label: "make it more intense", variant: "ghost" },
          { label: "cleaner transitions", variant: "ghost" },
        ],
      });
    } catch (err: unknown) {
      console.error("[Pipeline] FAILED:", err);
      const message = err instanceof Error ? err.message : "unknown error";
      setStage("error");
      setError(message);
      addMessage({
        id: uid(),
        role: "kove",
        text: `kove hit a snag: ${message}. try again or open studio mode.`,
        timestamp: Date.now(),
        actions: [{ label: "retry", variant: "primary" }],
      });
    }
  }, [uploadedFiles, applyEDL, addMessage]);

  const handleRefine = useCallback(async (feedback: string) => {
    if (!feedback.trim() || !edl) return;

    const userId = uid();
    addMessage({ id: userId, role: "user", text: feedback, timestamp: Date.now() });
    setChatInput("");
    setStage("regenerating");

    await startRefine({ projectId: projectIdRef.current, edl, feedback });
  }, [edl, startRefine, addMessage]);

  const handleSend = useCallback(() => {
    if (!chatInput.trim()) return;
    if (!hasEdit) handleGenerate(chatInput);
    else handleRefine(chatInput);
    setChatInput("");
  }, [chatInput, hasEdit, handleGenerate, handleRefine]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleModeChange = useCallback((newMode: "simple" | "studio") => {
    if (newMode === "studio") {
      navigate("/editor");
    }
  }, [navigate]);

  const handleSuggestion = useCallback((prompt: string) => {
    setChatInput(prompt);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    setChatInput((prev) => (prev ? `${prev} ${tag}` : tag));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <ProjectHeader
        projectName={projectName}
        onNameChange={setProjectName}
        stage={stage}
        mode="simple"
        onModeChange={handleModeChange}
        hasEdit={hasEdit}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Chat column — always 50% */}
        <div className="flex flex-col w-1/2 min-w-0 border-r border-border">
          <div className="px-4 py-2 border-b border-border bg-background/80 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-text-muted font-mono">Kove Director</span>
              <span className="text-text-tertiary">·</span>
              {isGenerating ? (
                <span className="text-[10px] text-primary font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {stage === "uploading" ? "uploading…" : stage === "analyzing" ? "analyzing…" : stage === "generating" ? "generating…" : "working…"}
                </span>
              ) : hasEdit ? (
                <span className="text-[10px] text-text-tertiary font-mono">
                  {edl?.timeline?.tracks?.[0]?.clips?.length ?? 0} clips · {(edl?.timeline?.duration ?? 0).toFixed(1)}s
                </span>
              ) : (
                <span className="text-[10px] text-text-tertiary font-mono">awaiting directive</span>
              )}
            </div>
          </div>

          <ChatStream
            messages={messages}
            streaming={streaming}
            partial={partial}
            chatEndRef={chatEndRef}
            onSuggestion={handleSuggestion}
            hasEdit={hasEdit}
            uploadedFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
            isGenerating={isGenerating}
          />

          <ChatInputDock
            input={chatInput}
            onInputChange={setChatInput}
            onSend={handleSend}
            onCancel={cancelRefine}
            onKeyDown={handleKeyDown}
            streaming={streaming}
            hasEdit={hasEdit}
            scope={scope}
            onClearScope={() => setScope(null)}
            onTagClick={handleTagClick}
            tags={QUICK_TAGS}
            disabled={isGenerating}
            showUpload={!hasEdit && uploadedFiles.length === 0}
            uploadedFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
          />
        </div>

        {/* Preview column — always 50% */}
        <div className="w-1/2 min-w-0">
          <VideoPreview
            stage={stage}
            error={error}
            hasEdit={hasEdit}
            uploadedFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
            onGenerate={() => {
              if (chatInput.trim()) handleGenerate(chatInput);
            }}
            isGenerating={isGenerating}
            pipelineStep={pipelineStep}
            pipelineError={stage === "error" ? error ?? undefined : undefined}
          />
        </div>
      </div>
    </div>
  );
}
