import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Send, Sparkles, Film, Paperclip, ArrowRight, Download, Type, Loader2, StickyNote } from "lucide-react";
import { UpgradePrompt, type UpgradeCta } from "@/components/chat/UpgradePrompt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatThreads, cryptoId, type ChatMessage, type ChatAttachment, type ChatThread } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { VideoUploader, type UploadedFile } from "@/components/chat/VideoUploader";
import { ThinkingPanel, type ThinkingStage } from "@/components/chat/ThinkingPanel";
import { BlueprintPreview } from "@/components/chat/BlueprintPreview";
import { VideoPreview } from "@/components/chat/VideoPreview";
import { TextTimeline } from "@/components/chat/TextTimeline";
import { decodeIntent, analyzeMedia, generateEDL, uploadFileDirect, refineEDL, transcribeMedia, analyzeReferenceStyle, analyzeReferenceStyleByUrl, generateCompositionOverlay, persistStudioProject, submitDirectorFeedback, pollDirectorRender, compileStyle } from "@/lib/api-client";
import type { ReferenceStyle } from "@/server/types/reference-style";
import type { TimelineAnnotation } from "@/server/types/annotation";
import { type ExportProgress } from "@/lib/export-engine";
import type { MonetEDL, Shot } from "@monet/edl";
import type { TranscriptResult } from "@/server/api/transcribe";
import { addDemoTrackedTextOverlay } from "@/lib/openreel/motion-tracking";
import { addAutoFaceTrack } from "@/lib/openreel/face-tracking";
import { addDemoPlanarTextOverlay } from "@/lib/openreel/planar-tracking";
import { useProjectStore } from "../../apps/web/src/stores/project-store";
import { registerMonetExecutor } from "../../apps/web/src/lib/executors/monet-action-executor";
import { syncUploadedFilesAndEDLToProject } from "../../apps/web/src/lib/media/project-media-hydration";
import { probeVideoClientSide } from "@/lib/client-probe";
import { scoreSimilarity } from "../lib/style/reference-similarity";
import { routeEDL, summarizeRouting } from "../lib/engines/router";

const ENABLE_HYPERFRAMES = false;

registerMonetExecutor(useProjectStore);

if (typeof window !== "undefined") {
  (window as any).__monetStore = useProjectStore;
  console.log("[monet] debug: store available at window.__monetStore");
}


function formatApiError(error: any): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    if (typeof error.message === "string") return error.message;
    if (typeof error.error === "object" && typeof error.error.message === "string") return error.error.message;
    return JSON.stringify(error);
  }
  return String(error);
}

type ThinkingData = {
  intentConfidence?: number;
  edlShots?: number;
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  usedFallback?: boolean;
  error?: string;
  edl?: MonetEDL;
  creativeDensity?: any;
  styleDirectives?: any;
  referenceSimilarity?: any;
};

// @ts-ignore - Route tree generation pending
export const Route = createFileRoute("/chat_/$threadId")({
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { threads, hydrated, createThread, deleteThread, updateThread } = useChatThreads();
  const [draft, setDraft] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [thinkingStage, setThinkingStage] = useState<ThinkingStage>("idle");
  const [thinkingData, setThinkingData] = useState<ThinkingData>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentEDL, setCurrentEDL] = useState<MonetEDL | null>(null);
  const [currentEdlId, setCurrentEdlId] = useState<string | null>(null);
  const [currentIntentId, setCurrentIntentId] = useState<string | null>(null);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  /** Time-anchored annotations added by pausing the preview */
  const [annotations, setAnnotations] = useState<TimelineAnnotation[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Track reference file ids already analyzed so type-toggle reruns analysis */
  const analyzedRefIds = useRef<Set<string>>(new Set());

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTextTimeline, setShowTextTimeline] = useState(false);
  // Playback time sync between VideoPreview and TextTimeline word highlighting
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const [seekToMs, setSeekToMs] = useState<number | undefined>(undefined);
  const [referenceStyle, setReferenceStyle] = useState<ReferenceStyle | null>(null);
  const [referenceTrace, setReferenceTrace] = useState<any | null>(null);
  const [isAnalyzingReference, setIsAnalyzingReference] = useState(false);
  const [isAutoTrackingFace, setIsAutoTrackingFace] = useState(false);
  const [compositionHtml, setCompositionHtml] = useState<string | null>(null);
  const [currentIntent, setCurrentIntent] = useState<unknown>(null);
  const [directorJobId, setDirectorJobId] = useState<string | null>(null);
  const [engineRouting, setEngineRouting] = useState<any | null>(null);

  useEffect(() => {
    if (!currentEDL) {
      setEngineRouting(null);
      return;
    }
    try {
      const routing = routeEDL(currentEDL, { tier: "free" });
      setEngineRouting(summarizeRouting(routing));
    } catch (e) {
      console.warn("Client side routing summary failed", e);
    }
  }, [currentEDL]);

  // After EDL is generated or restored, compute and log similarity scores
  useEffect(() => {
    if (!currentEDL) return;
    const score = scoreSimilarity(currentEDL as any, referenceStyle);
    console.log("[ChatPage] Director diagnostics", {
      styleDirectives: (currentEDL as any).style || (currentEDL as any).globalEffects,
      creativeDensity: {
        featuresPerShot:
          currentEDL.shots.reduce(
            (s, sh) => s + ((sh as any).effects?.length || 0),
            0
          ) / Math.max(1, currentEDL.shots.length),
      },
      referenceSimilarity: score,
    });
  }, [currentEDL, referenceStyle]);
  const [directorRenderStatus, setDirectorRenderStatus] = useState<string | null>(null);
  const [directorPreviewUrl, setDirectorPreviewUrl] = useState<string | null>(null);
  const [patchSummary, setPatchSummary] = useState<string | null>(null);
  const [upgradeCta, setUpgradeCta] = useState<UpgradeCta | null>(null);
  const lastPersistedStudioSnapshotRef = useRef<string | null>(null);
  const chatUiStorageKey = `monet.chat.ui.${threadId}`;

  const resolveMediaKeys = (file: UploadedFile): string[] => {
    const keys = [file.id, `dev-${file.file.name}`, file.file.name];

    if (file.r2FileId) {
      keys.push(file.r2FileId);
    }

    return Array.from(new Set(keys.filter(Boolean)));
  };

  const active = (threads as ChatThread[]).find((t) => t.id === threadId);

  const resolvableMediaIds = useMemo(() => {
    const ids = new Set<string>();

    for (const file of uploadedFiles) {
      if (file.type !== "footage" && file.type !== "music") continue;
      for (const key of resolveMediaKeys(file)) ids.add(key);
    }

    for (const message of active?.messages ?? []) {
      for (const attachment of message.attachments ?? []) {
        const canonical = attachment.r2FileId ?? attachment.id;
        if (!canonical) continue;
        ids.add(canonical);
        if (attachment.id) ids.add(attachment.id);
        if (attachment.name) ids.add(`dev-${attachment.name}`);
      }
    }

    return ids;
  }, [uploadedFiles, active?.messages]);

  const canResolvePreviewClip = (clipId: string): boolean => {
    return mediaUrls.has(clipId) || resolvableMediaIds.has(clipId);
  };

  const missingPreviewClips: string[] = currentEDL
    ? Array.from(
        new Set(
          currentEDL.shots
            .map((shot: Shot) => shot.source.clipId)
            .filter((clipId: string) => !canResolvePreviewClip(clipId))
        )
      )
    : [];

  const mediaApiBase =
    ((import.meta as any).env?.VITE_API_BASE ||
      (typeof window !== "undefined" ? window.location.origin : ""))
      .replace(/\/$/, "");

  const buildMediaUrl = (mediaId: string) =>
    mediaApiBase
      ? `${mediaApiBase}/api/media/${encodeURIComponent(mediaId)}`
      : `/api/media/${encodeURIComponent(mediaId)}`;

  const buildPreviewMediaUrl = (mediaId: string) => {
    if (mediaId.endsWith("_proxy")) return buildMediaUrl(mediaId);
    return buildMediaUrl(`${mediaId}_proxy`);
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!active && threads.length > 0) {
      navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true } as any);
    } else if (!active && threads.length === 0) {
      const t = createThread();
      navigate({ to: "/chat/$threadId", params: { threadId: t.id }, replace: true } as any);
    }
  }, [hydrated, active, threads, navigate, createThread]);

  useEffect(() => {
    taRef.current?.focus();
  }, [threadId]);

  // New thread = new session. Clear transient state when switching chats.
  useEffect(() => {
    abortRef.current?.abort();
    setDraft("");
    setUploadedFiles([]);
    setMediaUrls(new Map());
    setThinkingStage("idle");
    setThinkingData({});
    setIsGenerating(false);
    setCurrentEDL(null);
    setCurrentEdlId(null);
    setCurrentIntentId(null);
    setCurrentAnalysisId(null);
    setRefineFeedback("");
    setIsRefining(false);
    setAnnotations([]);
    setIsExporting(false);
    setExportProgress(null);
    setTranscript(null);
    setIsTranscribing(false);
    setShowTextTimeline(false);
    setReferenceStyle(null);
    setIsAnalyzingReference(false);
    setCompositionHtml(null);
    setCurrentIntent(null);
    setDirectorJobId(null);
    setDirectorRenderStatus(null);
    setDirectorPreviewUrl(null);
    setPatchSummary(null);
    analyzedRefIds.current.clear();
  }, [threadId]);

  // Restore EDL from persisted thread state when switching threads or on refresh
  useEffect(() => {
    if (!active) return;
    setCurrentEDL(active.latestEdl ? (active.latestEdl as MonetEDL) : null);
    setCurrentEdlId(active.latestEdlId ?? null);
    setCurrentIntentId(active.latestIntentId ?? null);
    setCurrentAnalysisId(active.latestAnalysisId ?? null);
    const latestRef = active.latestReferenceStyle
      ? (active.latestReferenceStyle as ReferenceStyle)
      : null;
    setReferenceStyle(latestRef);
    const latestTrace = (active as any).latestReferenceTrace ?? null;
    setReferenceTrace(latestTrace);

    // Auto-wire ReferenceStyle into Project Store settings
    const project = useProjectStore.getState().project;
    if (project) {
      const updatedProject = {
        ...project,
        settings: {
          ...project.settings,
          monet: {
            ...project.settings?.monet,
            referenceStyle: latestRef || undefined,
            referenceStyleId: (active as any).latestReferenceStyleId || undefined
          }
        }
      };
      useProjectStore.setState({ project: updatedProject });
    }
  }, [threadId, active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length]);

  useEffect(() => {
    const urls = new Map<string, string>();
    const footageWithPreview = uploadedFiles.filter(
      (file) => file.type === "footage" && !!file.preview
    );

    for (const file of footageWithPreview) {
      if (file.type !== "footage" || !file.preview) continue;
      for (const key of resolveMediaKeys(file)) {
        // Prefer local blob URL for immediate playback to avoid waiting for server proxy generation.
        urls.set(key, file.preview);
      }
    }

    // Resiliency: if the EDL references unknown clip IDs but the user has only
    // one footage source loaded, bind unresolved IDs to that source.
    if (currentEDL && footageWithPreview.length === 1) {
      const firstFootage = footageWithPreview[0];
      const fallbackPreview = firstFootage.r2FileId
        ? buildMediaUrl(`${firstFootage.r2FileId}_proxy`)
        : firstFootage.preview;

      if (fallbackPreview) {
        for (const shot of currentEDL.shots) {
          if (!urls.has(shot.source.clipId)) {
            urls.set(shot.source.clipId, fallbackPreview);
          }
        }
      }
    }

    // Recover persisted attachments from thread history after reload.
    for (const message of active?.messages ?? []) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.type !== "footage") continue;
        const mediaId = attachment.r2FileId ?? attachment.id;
        if (!mediaId) continue;
        if (!urls.has(mediaId)) {
          urls.set(mediaId, buildMediaUrl(mediaId));
        }
      }
    }

    // Also map directly from the EDL in case legacy thread attachments did not
    // persist r2FileId correctly.
    if (currentEDL) {
      for (const shot of currentEDL.shots) {
        const mediaId = shot.source.clipId;
        if (!urls.has(mediaId)) {
          urls.set(mediaId, buildPreviewMediaUrl(mediaId));
        }
      }

      const musicId = currentEDL.music?.sourceId;
      if (musicId && !urls.has(musicId)) {
        urls.set(musicId, buildMediaUrl(musicId));
      }
    }

    // If there is one footage source in memory, still map unresolved EDL IDs to
    // that local preview as a last-resort resiliency path.
    if (currentEDL && footageWithPreview.length === 1 && footageWithPreview[0].preview) {
      const firstFootage = footageWithPreview[0];
      const fallbackPreview = firstFootage.r2FileId
        ? buildMediaUrl(`${firstFootage.r2FileId}_proxy`)
        : firstFootage.preview ?? "";

      for (const shot of currentEDL.shots) {
        if (!urls.has(shot.source.clipId)) {
          urls.set(shot.source.clipId, fallbackPreview);
        }
      }
    }

    setMediaUrls(urls);
  }, [uploadedFiles, currentEDL, active?.messages, mediaApiBase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(chatUiStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        showTextTimeline?: boolean;
        refineFeedback?: string;
        annotations?: TimelineAnnotation[];
      };
      if (typeof parsed.showTextTimeline === "boolean") {
        setShowTextTimeline(parsed.showTextTimeline);
      }
      if (typeof parsed.refineFeedback === "string") {
        setRefineFeedback(parsed.refineFeedback);
      }
      if (Array.isArray(parsed.annotations)) {
        setAnnotations(parsed.annotations);
      }
    } catch {
      // Ignore corrupt local UI state and fall back to defaults.
    }
  }, [chatUiStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        chatUiStorageKey,
        JSON.stringify({
          showTextTimeline,
          refineFeedback,
          annotations,
        })
      );
    } catch {
      // UI persistence is best-effort only.
    }
  }, [chatUiStorageKey, showTextTimeline, refineFeedback, annotations]);

  useEffect(() => {
    if (!currentEDL || !active) return;
    const snapshotKey = `${threadId}:${currentEdlId ?? "no-edl-id"}:${currentEDL.timeline.duration}:${currentEDL.shots.length}`;
    if (lastPersistedStudioSnapshotRef.current === snapshotKey) return;

    lastPersistedStudioSnapshotRef.current = snapshotKey;
    persistStudioProject(
      {
        projectId: threadId,
        threadId,
        projectName: active.title,
        edlId: currentEdlId ?? undefined,
        edl: currentEDL,
      },
      abortRef.current?.signal ?? undefined
    ).catch((err: any) => {
      console.warn("Failed to persist studio snapshot:", err);
    });
  }, [active, threadId, currentEDL, currentEdlId]);

  const previewShotCount = currentEDL?.shots.length ?? 0;
  const previewDuration = currentEDL?.timeline.duration ?? 0;
  const previewClipCount = currentEDL
    ? new Set(currentEDL.shots.map((shot: Shot) => shot.source.clipId)).size
    : 0;
  const previewReady = currentEDL != null && mediaUrls.size > 0 && missingPreviewClips.length === 0;

  const handleFilesChange = async (files: UploadedFile[]) => {
    setUploadedFiles(files);

    // Eagerly analyze any reference file not yet analyzed
    const newRef = files.find(
      (f: UploadedFile) => f.type === "reference" && !analyzedRefIds.current.has(f.id)
    );
    if (!newRef || isAnalyzingReference) return;
    analyzedRefIds.current.add(newRef.id);

    setIsAnalyzingReference(true);
    try {
     let fileId = newRef.r2FileId;
     if (!fileId) {
       let metadata;
       try {
         if (newRef.file.type.startsWith("video/")) {
           metadata = await probeVideoClientSide(newRef.file);
         }
       } catch (probeErr) {
         console.warn("Reference probe failed", probeErr);
       }

       const uploadRes = await uploadFileDirect(newRef.file, threadId, "reference", metadata);        if (!uploadRes.success) throw new Error(formatApiError(uploadRes.error) || "Reference upload failed");
        fileId = uploadRes.fileId;
        setUploadedFiles((prev: UploadedFile[]) =>
          prev.map((f) => (f.id === newRef.id ? { ...f, r2FileId: fileId } : f))
        );
      }
      const styleRes = await analyzeReferenceStyle(threadId, fileId);
      if (styleRes.success && styleRes.style) {
        setReferenceStyle(styleRes.style);
        if ((styleRes as any).trace) setReferenceTrace((styleRes as any).trace);
        updateThread(threadId, (t: ChatThread) => ({
          ...t,
          updatedAt: Date.now(),
          latestReferenceStyle: styleRes.style,
          latestReferenceStyleId: styleRes.referenceStyleId,
          latestReferenceTrace: (styleRes as any).trace,
        }));

        // Instantly sync analyzed style into the active Project Store
        const project = useProjectStore.getState().project;
        if (project) {
          const updatedProject = {
            ...project,
            settings: {
              ...project.settings,
              monet: {
                ...project.settings?.monet,
                referenceStyle: styleRes.style,
                referenceStyleId: styleRes.referenceStyleId
              }
            }
          };
          useProjectStore.setState({ project: updatedProject });
        }
      } else {
        console.warn("Reference analysis returned no style:", styleRes.error);
        analyzedRefIds.current.delete(newRef.id); // allow retry
      }
    } catch (err: any) {
      console.error("Reference analysis failed:", err);
      analyzedRefIds.current.delete(newRef.id);
    } finally {
      setIsAnalyzingReference(false);
    }
  };

  /** Called by VideoUploader when user submits a YouTube / direct URL */
  const handleYouTubeUrl = async (url: string) => {
    if (!url || isAnalyzingReference) return;
    setIsAnalyzingReference(true);
    try {
      const styleRes = await analyzeReferenceStyleByUrl(threadId, url);
      if (styleRes.success && styleRes.style) {
        setReferenceStyle(styleRes.style);
        if ((styleRes as any).trace) setReferenceTrace((styleRes as any).trace);
        updateThread(threadId, (t: ChatThread) => ({
          ...t,
          updatedAt: Date.now(),
          latestReferenceStyle: styleRes.style,
          latestReferenceStyleId: styleRes.referenceStyleId,
          latestReferenceTrace: (styleRes as any).trace,
        }));

        // Instantly sync analyzed style into the active Project Store
        const project = useProjectStore.getState().project;
        if (project) {
          const updatedProject = {
            ...project,
            settings: {
              ...project.settings,
              monet: {
                ...project.settings?.monet,
                referenceStyle: styleRes.style,
                referenceStyleId: styleRes.referenceStyleId
              }
            }
          };
          useProjectStore.setState({ project: updatedProject });
        }
      } else {
        console.warn("YouTube reference analysis returned no style:", styleRes.error);
      }
    } catch (err: any) {
      console.error("YouTube reference analysis failed:", err);
    } finally {
      setIsAnalyzingReference(false);
    }
  };

  const applyGeneratedEDLToProject = async (
    generatedEdl: MonetEDL,
    currentFiles: UploadedFile[]
  ) => {
    console.log("[ChatPage] Applying generated EDL to project store...");

    const store = useProjectStore.getState();
    const project = store.project ?? store.bootstrapEmptyProject();

    const syncedProject = syncUploadedFilesAndEDLToProject({
      project,
      uploadedFiles: currentFiles,
      edl: generatedEdl,
      buildMediaUrl,
    });

    useProjectStore.setState({ project: syncedProject });

    console.log("[ChatPage] Synced project media before apply", {
      mediaCount: syncedProject.mediaLibrary?.items?.length ?? 0,
      mediaIds: syncedProject.mediaLibrary?.items?.map((item: any) => item.id),
      edlClipIds: Array.from(
        new Set(generatedEdl.shots.map((shot: any) => shot.source?.clipId).filter(Boolean))
      ),
    });

    const applyResult = await useProjectStore.getState().applyMonetEDLToProject(generatedEdl);

    if (!applyResult.success) {
      throw new Error(
        formatApiError(applyResult.error) ||
          "Failed to apply Monet EDL to project tracks"
      );
    }

    console.log("[ChatPage] Monet EDL applied successfully to OpenReel project tracks", {
      appliedShots: applyResult.data?.appliedShots,
      duration: applyResult.data?.duration,
    });
  };

  const sendMessage = async (overrideText?: string | React.MouseEvent) => {
    const text = (typeof overrideText === "string" ? overrideText : draft).trim();
    if (!text || !active || isGenerating) return;

    const messageAttachments: ChatAttachment[] = uploadedFiles.map((file: UploadedFile) => ({
      id: file.id,
      type: file.type,
      name: file.file.name,
      sizeBytes: file.file.size,
      r2FileId: file.r2FileId,
    }));

    // Add user message
    const userMsg: ChatMessage = {
      id: cryptoId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
      attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
    };

    updateThread(threadId, (t: ChatThread) => ({
      ...t,
      title: t.messages.length === 0 ? text.slice(0, 40) : t.title,
      updatedAt: Date.now(),
      messages: [...t.messages, userMsg],
    }));

    setDraft("");
    setIsGenerating(true);
    setThinkingData({});

    try {
      // Stage 1: Upload files to R2 (if not already uploaded)
      setThinkingStage("intent");
      const abort = new AbortController();
      abortRef.current = abort;

      let workingFiles = uploadedFiles;

      // Upload footage + music in parallel
      const filesToUpload = uploadedFiles.filter((f) => !f.r2FileId);
      if (filesToUpload.length > 0) {
        const uploadResults = await Promise.all(
          filesToUpload.map(async (f) => {
            let metadata;
            try {
              if (f.file.type.startsWith("video/")) {
                metadata = await probeVideoClientSide(f.file);
              }
            } catch (probeErr) {
              console.warn(`Probe failed for ${f.file.name}`, probeErr);
            }

            const res = await uploadFileDirect(f.file, threadId, f.type, metadata, abort.signal);

            if (!res.success || !res.fileId) {
              throw new Error(
                formatApiError(res.error) || `Upload failed for ${f.file.name}`
              );
            }

            return {
              localId: f.id,
              r2FileId: res.fileId,
            };
          })
        );

        // Update local state with real file IDs
        workingFiles = uploadedFiles.map((f) => {
            const result = uploadResults.find((r) => r.localId === f.id);
            return result ? { ...f, r2FileId: result.r2FileId } : f;
          });

        setUploadedFiles(workingFiles);

        // Persist resolved R2 IDs into the just-added user message attachments.
        updateThread(threadId, (t: ChatThread) => {
          const updatedMessages = t.messages.map((message: ChatMessage) => {
            if (message.id !== userMsg.id || !message.attachments) return message;

            const attachments = message.attachments.map((attachment: ChatAttachment) => {
              const resolved = workingFiles.find((f) => f.id === attachment.id);
              if (!resolved?.r2FileId) return attachment;
              return {
                ...attachment,
                r2FileId: resolved.r2FileId,
              };
            });

            return {
              ...message,
              attachments,
            };
          });

          return {
            ...t,
            updatedAt: Date.now(),
            messages: updatedMessages,
          };
        });
      }

      // Get current file IDs (real or mock for dev)
      const getFileId = (f: UploadedFile) => f.r2FileId ?? `dev-${f.file.name}`;

      // Stage 1: Intent Extraction
      // Pass referenceStyle if one was analyzed — drives intent toward that edit DNA
      const intentRes = await decodeIntent(text, threadId, referenceStyle ?? undefined);

      if (!intentRes.success) {
        throw new Error(formatApiError(intentRes.error) || "Intent extraction failed");
      }

      setCurrentIntentId(intentRes.intentId ?? null);
      if (intentRes.result?.intent) setCurrentIntent(intentRes.result.intent);
      setThinkingData((prev) => ({
        ...prev,
        intentConfidence: intentRes.result?.confidence,
      }));

      // Stage 1.5: StyleDNA Compilation (non-blocking, fires in parallel with analysis)
      const stylePromise = compileStyle(text, abortRef.current?.signal ?? undefined).catch((err: any) => {
        console.warn("[ChatPage] style compilation failed (non-critical):", err);
        return null;
      });

      // Stage 2: Analysis
      setThinkingStage("analysis");

      const footageIds = workingFiles
        .filter((f) => f.type === "footage")
        .map(getFileId);
      const musicFile = workingFiles.find((f) => f.type === "music");
      const musicId = musicFile ? getFileId(musicFile) : undefined;

      console.log("[ChatPage] analyzeMedia inputs", {
        workingFiles: workingFiles.map((f) => ({
          id: f.id,
          r2FileId: f.r2FileId,
          name: f.file.name,
          type: f.type,
        })),
        footageIds,
        musicId,
      });

      const analysisRes = await analyzeMedia(threadId, footageIds, musicId);

      if (!analysisRes.success) {
        throw new Error(formatApiError(analysisRes.error) || "Analysis failed");
      }

      setCurrentAnalysisId(analysisRes.analysisId ?? null);

      // Stage 3: EDL Generation
      setThinkingStage("edl");
      console.log("DEBUGGING EDL GENERATION HANDSHAKE:", { 
        threadId, 
        intentId: intentRes.intentId, 
        analysisId: analysisRes.analysisId 
      });
      const styleResult = await stylePromise;

      const edlRes = await generateEDL(
        threadId,
        intentRes.intentId!,
        analysisRes.analysisId!,
        referenceStyle ?? undefined,
        referenceTrace ?? undefined,
        referenceStyle ? "strict_replication" : "inspired",
        text,
        undefined,
        undefined,
        styleResult?.success ? styleResult.style : undefined
      );

      console.log("[ChatPage] Director diagnostics", {
        styleDirectives: (edlRes as any).styleDirectives,
        creativeDensity: (edlRes as any).creativeDensity,
        referenceSimilarity: (edlRes as any).referenceSimilarity,
      });

      if (!edlRes.success) {
        throw new Error(formatApiError(edlRes.error) || "EDL generation failed");
      }

      const generatedEDL = edlRes.edl as MonetEDL;

      const styledEDL = generatedEDL;
      if (styleResult?.success && styleResult.style) {
        console.log(
          `[ChatPage] style compiled (${styleResult.source}, cached=${styleResult.cached}):`,
          styleResult.style.name,
          "→ server-side application",
        );
      }

      if ((edlRes as any).styleApplicationSummary) {
        console.log("[ChatPage] style applied", (edlRes as any).styleApplicationSummary);
      }

      // Generate HyperFrames visual treatment composition via Gemini
      // Generate HyperFrames visual treatment composition via Gemini
      // Non-blocking: fires in background, updates overlay when ready
      const userPrompt = text;
      if (ENABLE_HYPERFRAMES) {
        generateCompositionOverlay(
          userPrompt,
          generatedEDL,
          intentRes.result?.intent,
          abortRef.current?.signal ?? undefined
        ).then((compRes: any) => {
          if (compRes.success && compRes.html) {
            console.log(`Composition generated via ${compRes.source}`);
            setCompositionHtml(compRes.html);
          }
        }).catch((compErr: any) => {
          console.warn("Composition generation failed (non-critical):", compErr);
        });
      }

      setThinkingData((prev) => ({
        ...prev,
        edlShots: styledEDL?.shots?.length ?? 0,
        scores: edlRes.scores,
        usedFallback: edlRes.usedFallback,
        edl: styledEDL,
        styleDirectives: (edlRes as any).styleDirectives,
        creativeDensity: (edlRes as any).creativeDensity,
        referenceSimilarity: (edlRes as any).referenceSimilarity,
      }));

      await applyGeneratedEDLToProject(styledEDL, workingFiles);

      setCurrentEDL(styledEDL);
      setCurrentEdlId(edlRes.edlId ?? null);
      setThinkingStage("complete");

      // Persist EDL in thread for Studio import
      updateThread(threadId, (t: ChatThread) => ({
        ...t,
        updatedAt: Date.now(),
        latestEdl: styledEDL,
        latestEdlId: edlRes.edlId,
        projectId: threadId,
      }));

      // Add assistant response
      const assistantMsg: ChatMessage = {
        id: cryptoId(),
        role: "assistant",
        content: generateSuccessMessage(edlRes),
        createdAt: Date.now(),
      };

      updateThread(threadId, (t: ChatThread) => ({
        ...t,
        updatedAt: Date.now(),
        messages: [...t.messages, assistantMsg],
      }));
    } catch (error: any) {
      if (error?.upgradeCta) {
        setUpgradeCta(error.upgradeCta);
        console.log("[ChatPage] HF rate limited, used browser fallback. Upgrade CTA shown.");
      } else {
        console.error("Generation error:", error);
        setThinkingStage("error");
        setThinkingData((prev: ThinkingData) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Unknown error",
        }));

        const errorMsg: ChatMessage = {
          id: cryptoId(),
          role: "assistant",
          content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
          createdAt: Date.now(),
        };

        updateThread(threadId, (t: ChatThread) => ({
          ...t,
          updatedAt: Date.now(),
          messages: [...t.messages, errorMsg],
        }));
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
      setTimeout(() => {
        setThinkingStage((s: ThinkingStage) => (s === "error" ? "idle" : s));
      }, 3000);
    }
  };

  function generateSuccessMessage(edlRes: { edl?: MonetEDL; scores?: { beatSyncScore: number }; usedFallback?: boolean }): string {
    const shots = edlRes.edl?.shots?.length ?? 0;
    const duration = edlRes.edl?.timeline?.duration ?? 30;
    const avgShot = shots > 0 ? (duration / shots).toFixed(1) : "0";
    const beatSync = edlRes.scores?.beatSyncScore != null
      ? Math.round(edlRes.scores.beatSyncScore * 100)
      : 0;

    let message = `✨ Edit complete!\n\n`;
    message += `📊 ${shots} shots, ${duration}s total (${avgShot}s avg)\n`;
    message += `🎵 Beat sync: ${beatSync}%\n`;
    if (edlRes.usedFallback) message += `\n⚠️ Generated with deterministic fallback (LLM busy)`;
    message += `\n\nReady to preview and refine!`;
    return message;
  }

  const handleDirectorFeedback = async (feedback: string) => {
    if (!feedback || isRefining) return;
    setIsRefining(true);
    setDirectorJobId(null);
    setDirectorRenderStatus(null);
    setDirectorPreviewUrl(null);
    setPatchSummary(null);

    try {
      // 1. Submit feedback to Director
      const res = await submitDirectorFeedback(
        threadId,
        feedback,
        currentEDL ?? undefined,
        [], // No keyframes for now to keep it fast, but could be added
        currentIntentId ?? undefined,
        currentAnalysisId ?? undefined
      );

      if (!res.success) {
        if (res.action === "GENERATE_FIRST_DRAFT") {
          // If no EDL, route to full generation
          await sendMessage(feedback);
          return;
        }
        throw new Error(formatApiError(res.error) || "Director feedback failed");
      }

      // 2. Instant patch summary display (<2s goal met by server)
      setPatchSummary(res.patchSummary ?? "Applying changes...");
      if (res.newEDL) {
        setCurrentEDL(res.newEDL);
        updateThread(threadId, (t: ChatThread) => ({
          ...t,
          latestEdl: res.newEDL,
          updatedAt: Date.now(),
        }));
      }

      // 3. Poll render progress if jobId exists
      if (res.jobId) {
        setDirectorJobId(res.jobId);
        setDirectorRenderStatus("queued");
        
        const poll = async () => {
          try {
            const status = await pollDirectorRender(res.jobId!);
            setDirectorRenderStatus(status.status);
            if (status.status === "done") {
              setDirectorPreviewUrl(status.downloadUrl ?? null);
              return true; // Stop polling
            }
            if (status.status === "error") {
              return true;
            }
            return false;
          } catch (err: any) {
            console.error("Polling error:", err);
            return true;
          }
        };

        const interval = setInterval(async () => {
          const stop = await poll();
          if (stop) clearInterval(interval);
        }, 2000);
      }

      // Add assistant message for feedback
      const msg: ChatMessage = {
        id: cryptoId(),
        role: "assistant",
        content: `🎬 Director: "${feedback}"\n${res.patchSummary}`,
        createdAt: Date.now(),
      };
      updateThread(threadId, (t: ChatThread) => ({
        ...t,
        messages: [...t.messages, msg],
      }));

    } catch (err: any) {
      console.error("Director loop error:", err);
    } finally {
      setIsRefining(false);
    }
  };

  const handleRefine = async () => {
    const feedback = refineFeedback.trim();
    if (!feedback || isRefining) return;
    
    // Redirect refine to Director loop if EDL exists
    if (currentEDL) {
      setRefineFeedback("");
      await handleDirectorFeedback(feedback);
      return;
    }

    setIsRefining(true);
    setRefineFeedback("");
    try {
      const res = await refineEDL(
        threadId,
        currentEdlId!,
        currentEDL as never,
        feedback,
        currentIntentId ?? undefined,
        currentAnalysisId ?? undefined,
        annotations,
        referenceStyle ?? undefined,
        referenceStyle ? "strict_replication" : "inspired"
      );

      if (!res.success) throw new Error(formatApiError(res.error) || "Refinement failed");

      const refined = res.edl as MonetEDL;
      setCurrentEDL(refined);
      setCurrentEdlId(res.edlId ?? currentEdlId);
      setThinkingData((prev) => ({ ...prev, edl: refined, scores: res.scores }));

      // Re-generate composition for the refined EDL
      const refinedPrompt = `${active?.messages[0]?.content ?? ""} — ${feedback}`;
      if (ENABLE_HYPERFRAMES) {
        generateCompositionOverlay(refinedPrompt, refined, currentIntent ?? undefined)
          .then((compRes: any) => {
            if (compRes.success && compRes.html) setCompositionHtml(compRes.html);
          })
          .catch(() => {/* non-critical */});
      }

      // Persist updated EDL
      updateThread(threadId, (t: ChatThread) => ({
        ...t,
        updatedAt: Date.now(),
        latestEdl: refined,
        latestEdlId: res.edlId,
      }));

      const msg: ChatMessage = {
        id: cryptoId(),
        role: "assistant",
        content: `✏️ Refined! "${feedback}"\n${res.edl?.shots?.length ?? 0} shots · ${(res.edl?.timeline?.duration ?? 0).toFixed(1)}s`,
        createdAt: Date.now(),
      };
      updateThread(threadId, (t: ChatThread) => ({
        ...t,
        messages: [...t.messages, msg],
      }));
    } catch (err: any) {
      console.error("Refinement error:", err);
    } finally {
      setIsRefining(false);
    }
  };

  const handleExport = async () => {
    if (!currentEDL || isExporting) return;
    setIsExporting(true);
    setExportProgress(null);

    try {
      setExportProgress({ percent: 0, stage: "Preparing assets..." } as any);

      // CRITICAL: Build server-accessible URLs for each clip.
      // Server-side FFmpeg can't read browser blob URLs — it needs HTTP URLs.
      // The clip already exists on the server at /api/media/<clipId>
      const serverMediaUrls = new Map<string, string>();

      const apiBase =
        ((import.meta as any).env?.VITE_API_BASE ||
          (typeof window !== "undefined" ? window.location.origin : ""))
          .replace(/\/$/, "");

      // Get all unique clip IDs from the EDL
      const uniqueClipIds = new Set<string>();
      for (const shot of currentEDL.shots) {
        const cid = shot.source?.clipId;
        if (cid) uniqueClipIds.add(cid);
      }

      // For each unique clip, generate the server media URL
      for (const clipId of uniqueClipIds) {
        const serverUrl = `${apiBase}/api/media/${encodeURIComponent(clipId)}`;
        serverMediaUrls.set(clipId, serverUrl);
      }

      console.log("[export] using server URLs for FFmpeg:", {
        count: serverMediaUrls.size,
        sample: Array.from(serverMediaUrls.entries()).slice(0, 2),
      });

      setExportProgress({ percent: 5, stage: "Sending to server..." } as any);

      const { exportEDLToMP4ViaServer } = await import("@/lib/export-engine");

      const blob = await exportEDLToMP4ViaServer(
        currentEDL,
        serverMediaUrls,
        (p) => {
          setExportProgress({ ...p, stage: p.stage } as any);
        }
      );

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `monet-edit-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      console.log("✨ Server export complete, MP4 downloading", { size: blob.size });
    } catch (err: any) {
      console.error("Export error:", err);
      alert(
        `Export failed: ${err.message || "Unknown error"}\n\n` +
        `Make sure FFmpeg is installed and the dev server is running.`
      );
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleTranscribe = async () => {
    const footageFile = uploadedFiles.find((f: UploadedFile) => f.type === "footage");
    if (!footageFile || isTranscribing) return;
    setIsTranscribing(true);
    try {
      const mediaId = footageFile.r2FileId ?? `dev-${footageFile.file.name}`;
      const res = await transcribeMedia(threadId, mediaId, "footage");
      if (res.success && res.result) {
        setTranscript({
          mediaId: res.result.mediaId,
          words: res.result.words,
          fullText: res.result.full_text,
          duration_ms: res.result.duration_ms,
          language: "en",
        } satisfies TranscriptResult);
        setShowTextTimeline(true);
      }
    } catch (err: any) {
      console.error("Transcription error:", err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleOpenInStudio = () => {
    if (currentEDL) {
      updateThread(threadId, (t: ChatThread) => ({ ...t, latestEdl: currentEDL, latestEdlId: currentEdlId ?? undefined }));
    }
    window.location.assign(`/studio?threadId=${encodeURIComponent(threadId)}`);
  };

  const handleAddTrackedText = () => {
    if (!currentEDL) return;
    const updated = addDemoTrackedTextOverlay(currentEDL, "TRACKED TITLE");
    setCurrentEDL(updated);
    setThinkingData((prev: ThinkingData) => ({ ...prev, edl: updated }));
    updateThread(threadId, (t: ChatThread) => ({
      ...t,
      updatedAt: Date.now(),
      latestEdl: updated,
    }));
  };

  const handleAutoFaceTrack = async () => {
    if (!currentEDL || isAutoTrackingFace) return;
    setIsAutoTrackingFace(true);
    try {
      const updated = await addAutoFaceTrack(currentEDL, mediaUrls);
      setCurrentEDL(updated);
      setThinkingData((prev: ThinkingData) => ({ ...prev, edl: updated }));
      updateThread(threadId, (t: ChatThread) => ({
        ...t,
        updatedAt: Date.now(),
        latestEdl: updated,
      }));
    } catch (error: any) {
      console.error("Auto face tracking failed:", error);
    } finally {
      setIsAutoTrackingFace(false);
    }
  };

  const handleAddWallText = () => {
    if (!currentEDL) return;
    const updated = addDemoPlanarTextOverlay(currentEDL, "WALL TEXT");
    setCurrentEDL(updated);
    setThinkingData((prev: ThinkingData) => ({ ...prev, edl: updated }));
    updateThread(threadId, (t: ChatThread) => ({
      ...t,
      updatedAt: Date.now(),
      latestEdl: updated,
    }));
  };

  const handleNew = () => {
    const t = createThread();
    navigate({ to: "/chat/$threadId", params: { threadId: t.id } } as any);
  };

  const handleDelete = (id: string) => {
    deleteThread(id);
    if (id === threadId) {
      const remaining = (threads as ChatThread[]).filter((t) => t.id !== id);
      if (remaining.length > 0) {
        navigate({ to: "/chat/$threadId", params: { threadId: remaining[0].id } } as any);
      } else {
        const t = createThread();
        navigate({ to: "/chat/$threadId", params: { threadId: t.id } } as any);
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
          {threads.map((t: ChatThread) => (
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
                  navigate({ to: "/chat/$threadId", params: { threadId: t.id } } as any)
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
          <a
            href={`/studio?threadId=${encodeURIComponent(threadId)}`}
            className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Film className="h-3.5 w-3.5" /> Open Studio
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
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
          <a
            href={`/studio?threadId=${encodeURIComponent(threadId)}`}
            className="text-xs text-muted-foreground hover:text-primary tracking-widest uppercase flex items-center gap-1.5"
          >
            Advanced <ArrowRight className="h-3 w-3" />
          </a>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-10">
            {active && active.messages.length === 0 && <EmptyChat />}
            {active?.messages.map((m: ChatMessage) => (
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

            {/* Show EDL preview after complete or when restored from storage */}
            {currentEDL && (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3 text-xs sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Shots</div>
                    <div className="mt-1 font-medium tabular-nums">{previewShotCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Duration</div>
                    <div className="mt-1 font-medium tabular-nums">{previewDuration.toFixed(1)}s</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Clips</div>
                    <div className="mt-1 font-medium tabular-nums">{previewClipCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Preview</div>
                    <div className={cn("mt-1 font-medium", previewReady ? "text-emerald-500" : "text-amber-500")}>
                      {previewReady ? "Ready" : "Media needed"}
                    </div>
                  </div>
                </div>

                {/* Engine routing breakdown */}
                {engineRouting && (
                  <div className="rounded-lg border border-border bg-card p-3 text-xs">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Film className="h-3 w-3 text-primary" />
                      Rendering Engines Dispatched
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(engineRouting.engineLoadCounts).map(([engine, count]) => {
                        if ((count as number) <= 0) return null;
                        return (
                          <div key={engine} className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-foreground border border-border">
                            <span>{engine}</span>{" "}
                            <span className="text-muted-foreground ml-1">×{String(count)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground flex gap-3">
                      <span>Avg Quality: {(engineRouting.avgQualityPerEffect || 0).toFixed(1)}×</span>
                      <span>Cost Efficiency: {(engineRouting.costEfficiency || 0).toFixed(1)}</span>
                    </div>
                  </div>
                )}

                <BlueprintPreview
                  edl={currentEDL as any}
                  creativeDensity={(thinkingData as any).creativeDensity}
                  referenceSimilarity={(thinkingData as any).referenceSimilarity}
                />

                {/* Video Preview — only when footage blob URLs are available */}
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-medium mb-3">Preview</h3>
                  {upgradeCta && (
                    <UpgradePrompt
                      cta={upgradeCta}
                      onDismiss={() => setUpgradeCta(null)}
                    />
                  )}
                  {previewReady ? (
                    <VideoPreview
                      edl={currentEDL}
                      mediaUrls={mediaUrls}
                      compositionHtml={ENABLE_HYPERFRAMES ? (compositionHtml ?? undefined) : undefined}
                      onAnnotation={(a: TimelineAnnotation) => setAnnotations((prev) => [...prev, a])}
                      annotations={annotations}
                      onTimeUpdate={setPreviewTimeMs}
                      seekToMs={seekToMs}
                      playing={false}
                    />
                  ) : (
                    <div className="rounded-lg border border-border bg-secondary/20 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-medium">Timeline restored</p>
                          <p className="text-xs text-muted-foreground">
                            The edit stays intact. Re-upload the source clips to bring back the player.
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {missingPreviewClips.length} missing clip{missingPreviewClips.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {missingPreviewClips.slice(0, 4).map((clipId: string) => (
                          <span
                            key={clipId}
                            className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
                          >
                            {clipId}
                          </span>
                        ))}
                        {missingPreviewClips.length > 4 && (
                          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                            +{missingPreviewClips.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action row */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleAddTrackedText}
                    disabled={!currentEDL}
                  >
                    Add Tracked Text
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleAutoFaceTrack}
                    disabled={!currentEDL || isAutoTrackingFace}
                  >
                    {isAutoTrackingFace ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Tracking Face...
                      </>
                    ) : (
                      "Auto Face Track"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleAddWallText}
                    disabled={!currentEDL}
                  >
                    Add Wall Text
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {exportProgress
                          ? `${exportProgress.percent}%`
                          : "Preparing…"}
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Export MP4
                      </>
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 text-xs bg-gradient-to-r from-yellow-500 to-orange-500 text-white"
                    onClick={async () => {
                      if (!currentEdlId) {
                        alert("No generated EDL ID found - please generate an edit first");
                        return;
                      }
                      const res = await fetch("/api/export", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "X-User-Tier": "pro",  // wire to real tier later
                        },
                        body: JSON.stringify({
                          edlId: currentEdlId,
                          threadId,
                          resolution: "1080p",
                          codec: "h264",
                        }),
                      });
                      const data = (await res.json()) as any;
                      if (data.success) {
                        alert(`HD render started! Job ID: ${data.jobId}\nWe'll email you when ready.`);
                      } else {
                        alert(`Failed: ${data.error}`);
                      }
                    }}
                  >
                    ⚡ HD Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      if (!currentEDL) return;
                      const flipped = {
                        ...currentEDL,
                        timeline: {
                          ...currentEDL.timeline,
                          sourceRotation: ((currentEDL.timeline as any)?.sourceRotation ?? 0) + 180,
                        },
                      };
                      setCurrentEDL(flipped as any);
                    }}
                  >
                    🔄 Flip 180°
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      if (!currentEDL) return;
                      const tinted = {
                        ...currentEDL,
                        globalEffects: { ...currentEDL.globalEffects, colorGrade: "cinematic" },
                      };
                      setCurrentEDL(tinted as any);
                    }}
                  >
                    🎨 Test Cinematic Grade
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleTranscribe}
                    disabled={isTranscribing || uploadedFiles.filter(f => f.type === "footage").length === 0}
                  >
                    {isTranscribing ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribing…</>
                    ) : (
                      <><Type className="h-3.5 w-3.5" /> Edit by Text</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={handleOpenInStudio}
                  >
                    <Film className="h-3.5 w-3.5" />
                    Open in Studio
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>

                {/* Text Timeline — Phase 7B */}
                {showTextTimeline && transcript && (
                  <div className="border-t border-border pt-4">
                    <TextTimeline
                      transcript={transcript}
                      edl={currentEDL}
                      currentTimeMs={previewTimeMs}
                      onEDLChange={(updated: MonetEDL) => {
                        setCurrentEDL(updated);
                        setThinkingData((prev: ThinkingData) => ({ ...prev, edl: updated }));
                        updateThread(threadId, (t: ChatThread) => ({ ...t, latestEdl: updated, updatedAt: Date.now() }));
                      }}
                      onSeek={(ms: number) => setSeekToMs(ms)}
                    />
                  </div>
                )}

              {/* Refinement section */}
                <div className="border-t border-border pt-4">
                  {patchSummary && (
                    <div className="mb-4 rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs font-medium text-primary flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3" />
                          Director Patch Applied
                        </div>
                        {directorRenderStatus && (
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {directorRenderStatus === "done" ? (
                              <span className="text-emerald-500">Render Ready</span>
                            ) : (
                              <>
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                Rendering...
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-foreground/80">{patchSummary}</p>
                      
                      {directorPreviewUrl && (
                        <div className="mt-3 rounded-md overflow-hidden border border-border bg-black aspect-video">
                          <video 
                            src={directorPreviewUrl} 
                            controls 
                            className="w-full h-full"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground mb-2 tracking-wider uppercase">
                    Refine with Director
                  </div>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {["Faster cuts", "Hit the drop harder", "More energy", "Calmer pace", "Add glow effect"].map((chip) => (
                      <button
                        key={chip}
                        onClick={() => setRefineFeedback(chip)}
                        className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  {/* Annotation chips */}
                  {annotations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {annotations.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                        >
                          <StickyNote className="h-2.5 w-2.5 shrink-0" />
                          <span className="font-mono">{Math.floor(a.timestamp / 60)}:{String(Math.floor(a.timestamp % 60)).padStart(2, "0")}</span>
                          <span className="max-w-[120px] truncate">{a.text}</span>
                          <button
                            onClick={() => setAnnotations((prev) => prev.filter((x) => x.id !== a.id))}
                            className="ml-0.5 text-amber-500/60 hover:text-amber-500 transition-colors"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Textarea
                      value={refineFeedback}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRefineFeedback(e.target.value)}
                      placeholder={annotations.length > 0 ? `${annotations.length} annotation${annotations.length !== 1 ? "s" : ""} queued — add global feedback or just hit Apply` : "What would you like to change? (e.g. 'make it more intense')"}
                      className="min-h-[56px] resize-none bg-background border-border text-sm"
                      disabled={isRefining}
                      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleRefine();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={handleRefine}
                      disabled={(!refineFeedback.trim() && annotations.length === 0) || isRefining}
                      className="self-end h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-background">
          <div className="mx-auto max-w-3xl px-6 py-4 space-y-4">
            {/* File uploader — always visible */}
            <VideoUploader
              key={threadId}
              onFilesChange={handleFilesChange}
              onYouTubeUrl={handleYouTubeUrl}
              disabled={isGenerating}
            />

            {/* Reference style status */}
            {isAnalyzingReference && (
              <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing reference style…
              </div>
            )}
            {referenceStyle && !isAnalyzingReference && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-primary mb-1 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    Style reference loaded
                  </div>
                  <div className="text-xs text-muted-foreground mb-1 capitalize">
                    {referenceStyle.intentMapping.genre.replace(/_/g, " ")} · 
                    {referenceStyle.intentMapping.pacing} · 
                    {referenceStyle.rhythm.avgShotDuration.toFixed(1)}s avg shot · 
                    {referenceStyle.rhythm.cutAlignment} sync
                  </div>
                  <div className="text-xs text-muted-foreground/70 italic line-clamp-2">
                    “{referenceStyle.editingPhilosophy.summary}”
                  </div>
                </div>
                <button
                  onClick={() => {
                    setReferenceStyle(null);
                    updateThread(threadId, (t: ChatThread) => ({
                      ...t,
                      updatedAt: Date.now(),
                      latestReferenceStyle: undefined,
                    }));
                  }}
                  className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors text-lg leading-none mt-0.5"
                  aria-label="Dismiss reference style"
                >
                  ×
                </button>
              </div>
            )}

            {/* Prompt input */}
            <div className="relative rounded-xl border border-border bg-card focus-within:border-primary/50 transition-colors">
              <Textarea
                ref={taRef}
                value={draft}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
                placeholder="Describe the edit you want… (e.g. ‘make a 30s anime AMV cut to the beat’)"
                className="min-h-[80px] resize-none border-0 bg-transparent px-4 py-3 pr-12 focus-visible:ring-0"
                disabled={isGenerating}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <div className="absolute right-2 bottom-2">
                <Button
                  size="icon"
                  onClick={() => sendMessage()}
                  disabled={!draft.trim() || isGenerating}
                  className="h-8 w-8 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">
              {uploadedFiles.length > 0
                ? `${uploadedFiles.filter(f => f.type === "footage").length} clip${uploadedFiles.filter(f => f.type === "footage").length !== 1 ? "s" : ""}${uploadedFiles.find(f => f.type === "music") ? " + music" : ""}${uploadedFiles.find(f => f.type === "reference") ? " + reference" : ""} ready`
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
        <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground text-sm leading-relaxed space-y-2">
          <div>{message.content}</div>
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {message.attachments.map((attachment: ChatAttachment) => (
                <span
                  key={`${attachment.id}-${attachment.name}`}
                  className="inline-flex items-center gap-1 rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-0.5 text-[11px] text-primary-foreground/90"
                  title={`${attachment.type} · ${formatSize(attachment.sizeBytes)}`}
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="max-w-[200px] truncate">{attachment.name}</span>
                </span>
              ))}
            </div>
          )}
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

