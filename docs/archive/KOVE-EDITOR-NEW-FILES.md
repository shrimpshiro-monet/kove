# Kove Editor — Everything In One Place

## Pipeline

```
Upload footage + music → R2
    ↓
Analyze (Cloudflare Vision + Cerebras) → analysisId
    ↓
Decode Intent (Cerebras) → intentId
    ↓
Generate EDL (Cerebras skeleton → onset alignment) → MonetEDL
    ↓
edl-to-openreel.ts → OpenReel Project
    ↓
OpenReelBridge → postMessage → iframe (OpenReel NLE at :5173)
    ↓
User tweaks in OpenReel (inspector, keyframes, effects, audio mixer)
    ↓
monet-project-updated → postMessage back
    ↓
openreel-to-edl.ts → updated MonetEDL
    ↓
Chat: "add glow at the drop" → POST /api/refine-edl → Groq streams SSE → EDL updates → OpenReel reloads
```

---

## FILE 1: `apps/web/src/components/editor/VibeEditor.tsx`

```tsx
/**
 * VibeEditor — AI-powered NLE with OpenReel as the editing engine.
 *
 * Pipeline:
 *   1. Upload footage + music → R2
 *   2. AI analyzes media → decode intent → generate beat-synced EDL
 *   3. EDL loads into OpenReel (full NLE: inspector, keyframes, effects, audio mixer)
 *   4. User tweaks anything in OpenReel — changes sync back to EDL
 *   5. User chats with AI → AI modifies the OpenReel project → live updates
 *   6. Export from OpenReel
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useProjectStore, useEDL } from "../../stores/project-store";
import { useRefineEDL } from "../../hooks/useRefineEDL";
import { OpenReelBridge } from "./OpenReelBridge";
import { ErrorBoundary } from "../ErrorBoundary";
import { VideoUploader, type UploadedFile } from "../../../../src/components/chat/VideoUploader";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// ─── API helpers ───────────────────────────────────────────────────────────

async function uploadToR2(file: File, projectId: string, type: string): Promise<{ fileId: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("projectId", projectId);
  form.append("type", type);
  const res = await fetch(`${API_BASE}/api/upload/direct`, { method: "POST", body: form });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Upload failed");
  return { fileId: json.fileId };
}

async function callAnalyzeMedia(projectId: string, footageIds: string[], musicId?: string) {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, footageIds, musicId }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Analysis failed");
  return json;
}

async function callDecodeIntent(projectId: string, prompt: string) {
  const res = await fetch(`${API_BASE}/api/decode-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, prompt }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Intent decode failed");
  return json;
}

async function callGenerateEDL(projectId: string, intentId: string, analysisId: string, opts?: Record<string, any>) {
  const res = await fetch(`${API_BASE}/api/generate-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, intentId, analysisId, ...opts }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "EDL generation failed");
  return json;
}

// ─── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    idle: "bg-muted text-muted-foreground",
    uploading: "bg-blue-500/10 text-blue-500",
    analyzing: "bg-amber-500/10 text-amber-500",
    generating: "bg-purple-500/10 text-purple-500",
    editing: "bg-emerald-500/10 text-emerald-500",
    error: "bg-red-500/10 text-red-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[stage] || colors.idle}`}>
      {stage === "editing" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {stage}
    </span>
  );
}

// ─── Chat bubble ───────────────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
        isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
      }`}>
        {msg.text}
      </div>
    </div>
  );
}

// ─── Main Editor ───────────────────────────────────────────────────────────

export function VibeEditor() {
  const project = useProjectStore((s) => s.project);
  const edl = useEDL();
  const bootstrapProject = useProjectStore((s) => s.bootstrapEmptyProject);
  const applyEDL = useProjectStore((s) => s.applyMonetEDLToProject);

  const [view, setView] = useState<"landing" | "editor">("landing");
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const projectIdRef = useRef(`proj-${Date.now()}`);
  const { start: startRefine, cancel: cancelRefine, streaming, partial } = useRefineEDL();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, partial]);

  useEffect(() => {
    if (!project) bootstrapProject();
  }, [project, bootstrapProject]);

  const handleGenerate = useCallback(async (prompt: string) => {
    if (!prompt.trim() || uploadedFiles.length === 0) return;

    const pid = projectIdRef.current;
    setStage("uploading");
    setError(null);
    setChatMessages([{ role: "user", text: prompt, timestamp: Date.now() }]);

    try {
      const footageIds: string[] = [];
      let musicId: string | undefined;

      for (const f of uploadedFiles) {
        const result = await uploadToR2(f.file, pid, f.type);
        f.r2FileId = result.fileId;
        if (f.type === "footage") footageIds.push(result.fileId);
        if (f.type === "music") musicId = result.fileId;
      }

      setStage("analyzing");
      const analysis = await callAnalyzeMedia(pid, footageIds, musicId);
      const intent = await callDecodeIntent(pid, prompt);

      setStage("generating");
      const edlResult = await callGenerateEDL(
        pid,
        intent.result?.intentId || intent.intentId,
        analysis.analysisId || analysis.result?.analysisId,
        { targetDuration: 30, style: "auto" }
      );

      const generatedEdl = edlResult.edl || edlResult.result?.edl;
      if (!generatedEdl) throw new Error("No EDL returned");

      await applyEDL(generatedEdl);
      setView("editor");
      setStage("editing");

      const clipCount = generatedEdl.timeline?.tracks?.[0]?.clips?.length ?? 0;
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Loaded ${clipCount} clips into OpenReel. You can now drag clips, adjust effects, tweak keyframes, and fine-tune everything in the editor. Ask me to make changes too.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      setStage("error");
      setError(err.message);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${err.message}`, timestamp: Date.now() },
      ]);
    }
  }, [uploadedFiles, applyEDL]);

  const handleRefine = useCallback(async (feedback: string) => {
    if (!feedback.trim() || !edl) return;

    setChatMessages((prev) => [...prev, { role: "user", text: feedback, timestamp: Date.now() }]);
    setChatInput("");

    await startRefine({
      projectId: projectIdRef.current,
      edl,
      feedback,
    });
  }, [edl, startRefine]);

  const handleSend = useCallback(() => {
    if (view === "landing") handleGenerate(chatInput);
    else handleRefine(chatInput);
  }, [view, chatInput, handleGenerate, handleRefine]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-background text-foreground">
        <header className="flex items-center justify-between border-b px-4 py-2 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold tracking-tight">Kove</h1>
            <StatusBadge stage={stage} />
          </div>
          {view === "editor" && edl && (
            <div className="text-[10px] text-muted-foreground font-mono">
              {edl.timeline?.tracks?.[0]?.clips?.length ?? 0} clips · {(edl.timeline?.duration ?? 0).toFixed(1)}s
            </div>
          )}
        </header>

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 flex flex-col overflow-hidden">
            {view === "landing" ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 max-w-xl mx-auto w-full">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold">What do you want to edit?</h2>
                  <p className="text-sm text-muted-foreground">
                    Upload footage + music, describe your vision. AI creates a beat-synced edit in the full NLE.
                  </p>
                </div>

                <VideoUploader
                  onFilesChange={setUploadedFiles}
                  disabled={stage !== "idle" && stage !== "error"}
                />

                {uploadedFiles.length > 0 && (
                  <div className="w-full">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe your edit… e.g. 'cinematic sports edit, 30 seconds, heavy cuts on the beat drops'"
                      className="w-full h-24 rounded-xl border bg-muted/30 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                      disabled={stage !== "idle" && stage !== "error"}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => handleGenerate(chatInput)}
                        disabled={!chatInput.trim() || (stage !== "idle" && stage !== "error")}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40"
                      >
                        {stage !== "idle" && stage !== "error" ? "Generating…" : "Generate Edit"}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="w-full rounded-xl border border-red-400/30 bg-red-500/5 p-3 text-xs text-red-400">
                    {error}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <OpenReelBridge className="w-full h-full" />
              </div>
            )}
          </main>

          <aside className="w-80 border-l flex flex-col shrink-0">
            <div className="flex-1 overflow-auto p-3 space-y-1">
              {chatMessages.length === 0 && !streaming && (
                <div className="text-center text-[10px] text-muted-foreground mt-8">
                  {view === "landing"
                    ? "Upload files and describe your edit"
                    : "Chat with AI to refine — or edit directly in OpenReel"}
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <ChatBubble key={i} msg={msg} />
              ))}
              {streaming && partial && (
                <ChatBubble msg={{ role: "assistant", text: partial, timestamp: Date.now() }} />
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t p-3 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={view === "landing" ? "Describe your edit…" : "Refine: 'add glow at the drop'"}
                  className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={streaming}
                />
                <button
                  onClick={streaming ? cancelRefine : handleSend}
                  className="px-3 py-2 rounded-lg text-xs font-medium shrink-0"
                  disabled={view === "landing" && uploadedFiles.length === 0}
                >
                  {streaming ? (
                    <span className="text-red-400">Cancel</span>
                  ) : (
                    <span className="bg-primary text-primary-foreground px-2 py-1 rounded">
                      {view === "landing" ? "Generate" : "Send"}
                    </span>
                  )}
                </button>
              </div>
              {streaming && (
                <div className="mt-1.5 text-[10px] text-muted-foreground animate-pulse">
                  AI is refining your edit…
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </ErrorBoundary>
  );
}
```

---

## FILE 2: `apps/web/src/components/editor/OpenReelBridge.tsx`

```tsx
/**
 * OpenReelBridge — Embeds OpenReel NLE in an iframe with bidirectional postMessage.
 *
 * Protocol:
 *   Outbound (our app → OpenReel iframe):
 *     { type: "monet-load-project", project: ORProject }
 *     { type: "monet-chat-message", message: string }
 *
 *   Inbound (OpenReel iframe → our app):
 *     { type: "monet-editor-ready" }
 *     { type: "monet-project-updated", project: ORProject }
 *     { type: "monet-chat-message", message: string }
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import { edlToOpenReelProject } from "../../lib/openreel/edl-to-openreel";
import { openReelProjectToEDL } from "../../lib/openreel/openreel-to-edl";
import { useProjectStore, useEDL } from "../../stores/project-store";

const OPENREEL_URL = import.meta.env.VITE_OPENREEL_EDITOR_URL || "http://localhost:5173";

interface OpenReelBridgeProps {
  onProjectSync?: (edl: any) => void;
  className?: string;
}

export function OpenReelBridge({ onProjectSync, className }: OpenReelBridgeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const edl = useEDL();
  const applyEDL = useProjectStore((s) => s.applyMonetEDLToProject);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !edl || !iframeRef.current) return;
    const orProject = edlToOpenReelProject(edl);
    iframeRef.current.contentWindow?.postMessage(
      { type: "monet-load-project", project: orProject },
      OPENREEL_URL
    );
  }, [edl, ready]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== new URL(OPENREEL_URL).origin) return;
      const data = event.data;
      if (!data || typeof data.type !== "string") return;

      switch (data.type) {
        case "monet-editor-ready":
          setReady(true);
          setLoading(false);
          if (edl && iframeRef.current) {
            const orProject = edlToOpenReelProject(edl);
            iframeRef.current.contentWindow?.postMessage(
              { type: "monet-load-project", project: orProject },
              OPENREEL_URL
            );
          }
          break;
        case "monet-project-updated":
          if (data.project) {
            const updatedEDL = openReelProjectToEDL(data.project);
            applyEDL(updatedEDL);
            onProjectSync?.(updatedEDL);
          }
          break;
        case "monet-chat-message":
          console.log("[OpenReelBridge] chat:", data.message);
          break;
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [edl, applyEDL, onProjectSync]);

  const sendChatMessage = useCallback((message: string) => {
    if (!ready || !iframeRef.current) return;
    iframeRef.current.contentWindow?.postMessage(
      { type: "monet-chat-message", message },
      OPENREEL_URL
    );
  }, [ready]);

  return (
    <div className={`relative ${className ?? ""}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground">Loading OpenReel editor…</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={OPENREEL_URL}
        className="w-full h-full border-0 rounded-lg"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
```

---

## FILE 3: `apps/web/src/lib/openreel/edl-to-openreel.ts`

```ts
/**
 * MonetEDL → OpenReel Project converter.
 * Maps our EDL format to OpenReel's NLE project format.
 */

import type { ProjectEDL as MonetEDL, Clip as EDLClip, Track as EDLTrack } from "@monet/edl";

interface ORProject {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  settings: { width: number; height: number; frameRate: number; sampleRate: number; channels: number };
  mediaLibrary: { items: ORMediaItem[] };
  timeline: ORTimeline;
}

interface ORMediaItem {
  id: string;
  name: string;
  type: "video" | "audio" | "image";
  fileHandle: null;
  blob: null;
  metadata: {
    duration: number;
    width: number;
    height: number;
    frameRate: number;
    codec: string;
    sampleRate: number;
    channels: number;
    fileSize: number;
  };
  thumbnailUrl: string | null;
  waveformData: null;
  originalUrl?: string;
}

interface ORTimeline {
  tracks: ORTrack[];
  subtitles: any[];
  duration: number;
  markers: ORMarker[];
  beatMarkers?: any[];
}

interface ORTrack {
  id: string;
  type: "video" | "audio" | "image" | "text" | "graphics";
  name: string;
  clips: ORClip[];
  transitions: any[];
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
}

interface ORClip {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  effects: any[];
  audioEffects: any[];
  transform: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    anchor: { x: number; y: number };
    opacity: number;
  };
  volume: number;
  keyframes: any[];
  speed?: number;
}

interface ORMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

function mapTrackType(edlType: string): ORTrack["type"] {
  if (edlType === "video") return "video";
  if (edlType === "audio") return "audio";
  if (edlType === "text") return "text";
  return "video";
}

function mapClip(clip: EDLClip, trackId: string): ORClip {
  return {
    id: clip.id,
    mediaId: clip.mediaId,
    trackId,
    startTime: clip.startTime,
    duration: clip.duration,
    inPoint: clip.inPoint ?? 0,
    outPoint: clip.outPoint ?? clip.duration,
    effects: (clip.effects ?? []).map((fx) => ({
      id: fx.id,
      type: fx.type,
      params: fx.params ?? {},
      enabled: true,
    })),
    audioEffects: [],
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
      opacity: 1,
    },
    volume: clip.audio?.gain ?? 1,
    keyframes: [],
    speed: clip.speed ?? 1,
  };
}

function mapTrack(track: EDLTrack, trackIndex: number): ORTrack {
  return {
    id: track.id,
    type: mapTrackType(track.type),
    name: `${track.type}-${trackIndex}`,
    clips: track.clips.map((c) => mapClip(c, track.id)),
    transitions: [],
    locked: track.locked ?? false,
    hidden: track.hidden ?? false,
    muted: false,
    solo: false,
  };
}

function mapMarkers(markers: MonetEDL["timeline"]["markers"]): ORMarker[] {
  return (markers ?? []).map((m) => ({
    id: m.id,
    time: m.time,
    label: m.label ?? m.type ?? "",
    color: m.type === "beat" ? "#f59e0b" : m.type === "impact" ? "#ef4444" : "#6b7280",
  }));
}

function getResolution(edl: MonetEDL): { width: number; height: number } {
  const ar = edl.meta?.aspectRatio ?? "9:16";
  if (ar === "9:16") return { width: 1080, height: 1920 };
  if (ar === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1080 };
}

export function edlToOpenReelProject(edl: MonetEDL): ORProject {
  const res = getResolution(edl);

  const mediaItems: ORMediaItem[] = Object.values(edl.assets?.media ?? {}).map((m) => ({
    id: m.id,
    name: m.id,
    type: "video" as const,
    fileHandle: null,
    blob: null,
    metadata: {
      duration: m.duration ?? 0,
      width: m.width ?? res.width,
      height: m.height ?? res.height,
      frameRate: edl.meta?.fps ?? 30,
      codec: "h264",
      sampleRate: edl.meta?.sampleRate ?? 44100,
      channels: 2,
      fileSize: 0,
    },
    thumbnailUrl: null,
    waveformData: null,
    originalUrl: m.path,
  }));

  const audioItems: ORMediaItem[] = Object.values(edl.assets?.audio ?? {}).map((a) => ({
    id: a.id,
    name: a.id,
    type: "audio" as const,
    fileHandle: null,
    blob: null,
    metadata: {
      duration: a.duration ?? 0,
      width: 0,
      height: 0,
      frameRate: 0,
      codec: "aac",
      sampleRate: edl.meta?.sampleRate ?? 44100,
      channels: 2,
      fileSize: 0,
    },
    thumbnailUrl: null,
    waveformData: null,
    originalUrl: a.path,
  }));

  return {
    id: edl.id ?? `or-${Date.now()}`,
    name: "AI Generated Edit",
    createdAt: edl.meta?.createdAt ?? Date.now(),
    modifiedAt: Date.now(),
    settings: {
      width: res.width,
      height: res.height,
      frameRate: edl.meta?.fps ?? 30,
      sampleRate: edl.meta?.sampleRate ?? 44100,
      channels: 2,
    },
    mediaLibrary: { items: [...mediaItems, ...audioItems] },
    timeline: {
      tracks: edl.timeline.tracks.map((t, i) => mapTrack(t, i)),
      subtitles: [],
      duration: edl.timeline.duration,
      markers: mapMarkers(edl.timeline.markers),
    },
  };
}
```

---

## FILE 4: `apps/web/src/lib/openreel/openreel-to-edl.ts`

```ts
/**
 * OpenReel Project → MonetEDL converter.
 * Preserves all user edits (clip timing, effects, transforms, speed).
 */

import type { ProjectEDL as MonetEDL, Clip as EDLClip, Track as EDLTrack } from "@monet/edl";

interface ORProject {
  id: string;
  name: string;
  createdAt?: number;
  settings: { width: number; height: number; frameRate: number; sampleRate: number };
  mediaLibrary: { items: any[] };
  timeline: {
    tracks: any[];
    duration: number;
    markers: any[];
    subtitles?: any[];
  };
}

function mapORClip(orClip: any, trackType: string): EDLClip {
  return {
    id: orClip.id,
    mediaId: orClip.mediaId,
    startTime: orClip.startTime,
    duration: orClip.duration,
    inPoint: orClip.inPoint ?? 0,
    outPoint: orClip.outPoint ?? orClip.duration,
    speed: orClip.speed ?? 1,
    transforms: {
      position: orClip.transform?.position
        ? [{ time: 0, x: orClip.transform.position.x, y: orClip.transform.position.y }]
        : [],
      scale: orClip.transform?.scale
        ? [{ time: 0, value: orClip.transform.scale.x }]
        : [],
      rotation: orClip.transform?.rotation
        ? [{ time: 0, value: orClip.transform.rotation }]
        : [],
      crop: orClip.transform?.fitMode === "cover"
        ? [{ time: 0, x: 0, y: 0, width: 1, height: 1 }]
        : undefined,
    },
    audio: { gain: orClip.volume ?? 1 },
    effects: (orClip.effects ?? []).map((fx: any) => ({
      id: fx.id,
      type: fx.type,
      start: orClip.startTime,
      duration: orClip.duration,
      params: fx.params ?? {},
    })),
    meta: orClip.metadata,
  };
}

function mapORTrack(orTrack: any, index: number): EDLTrack {
  return {
    id: orTrack.id,
    type: orTrack.type === "video" ? "video" : orTrack.type === "audio" ? "audio" : "video",
    clips: orTrack.clips.map((c: any) => mapORClip(c, orTrack.type)),
    order: index,
    locked: orTrack.locked ?? false,
    hidden: orTrack.hidden ?? false,
  };
}

export function openReelProjectToEDL(project: ORProject): MonetEDL {
  const s = project.settings;
  const aspectRatio = s.width > s.height ? "16:9" : s.width < s.height ? "9:16" : "1:1";

  const media: Record<string, any> = {};
  const audio: Record<string, any> = {};

  for (const item of project.mediaLibrary.items) {
    if (item.type === "audio") {
      audio[item.id] = { id: item.id, path: item.originalUrl ?? "", duration: item.metadata.duration };
    } else {
      media[item.id] = {
        id: item.id,
        path: item.originalUrl ?? "",
        duration: item.metadata.duration,
        width: item.metadata.width,
        height: item.metadata.height,
      };
    }
  }

  return {
    version: 1,
    id: project.id,
    meta: {
      createdAt: project.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      aspectRatio: aspectRatio as any,
      fps: s.frameRate,
      sampleRate: s.sampleRate,
    },
    assets: { media, audio, overlays: {} },
    timeline: {
      duration: project.timeline.duration,
      tracks: project.timeline.tracks.map((t, i) => mapORTrack(t, i)),
      markers: (project.timeline.markers ?? []).map((m) => ({
        id: m.id,
        time: m.time,
        label: m.label,
        type: "beat" as const,
      })),
    },
  } as MonetEDL;
}
```

---

## FILE 5: `apps/web/src/stores/project-store.ts`

```ts
import type { ProjectEDL as MonetEDL, Clip, Track } from "@monet/edl";
import { create } from "zustand";
import { produce } from "immer";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
};

export interface Project {
  id: string;
  name: string;
  edl: MonetEDL;
  mediaLibrary: { items: MediaItem[] };
  settings: Record<string, unknown>;
  modifiedAt: number;
}

export interface MediaItem {
  id: string;
  path: string;
  duration: number;
  type: "video" | "audio" | "image";
}

interface ProjectStoreState {
  project: Project | null;
  actionExecutors: Record<string, any>;
  history: Project[];
  historyIndex: number;

  getDuration: () => number;
  getTracks: () => Track[];
  getClipById: (clipId: string) => { clip: Clip; trackId: string } | null;

  bootstrapEmptyProject: () => Project;
  registerActionExecutor: (id: string, executor: any) => void;
  getActionExecutor: (id: string) => any;
  applyMonetEDLToProject: (edl: any) => Promise<ActionResult>;

  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  moveClip: (clipId: string, newStart: number) => void;
  splitClip: (clipId: string, atTime: number) => void;
  deleteClip: (clipId: string) => void;
  trimClip: (clipId: string, edge: "start" | "end", newTime: number) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export function createEmptyEDL(): MonetEDL {
  return {
    version: 1,
    id: `edl-${Date.now()}`,
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspectRatio: "9:16",
      fps: 30,
      sampleRate: 44100,
    },
    assets: { media: {}, audio: {}, overlays: {} },
    timeline: {
      duration: 0,
      tracks: [
        { id: "video-main", type: "video", clips: [], order: 0, locked: false, hidden: false },
        { id: "audio-main", type: "audio", clips: [], order: 1, locked: false, hidden: false },
      ],
      markers: [],
    },
  } as MonetEDL;
}

export function createEmptyProject(): Project {
  return {
    id: `project-${Date.now()}`,
    name: "New Kove Project",
    edl: createEmptyEDL(),
    mediaLibrary: { items: [] },
    settings: {},
    modifiedAt: Date.now(),
  };
}

function recomputeDuration(edl: MonetEDL): number {
  let max = 0;
  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

const MAX_HISTORY = 50;

function pushHistory(state: ProjectStoreState, project: Project): Partial<ProjectStoreState> {
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(structuredClone(project));
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  return { history: newHistory, historyIndex: newHistory.length - 1 };
}

export const useProjectStore = create<ProjectStoreState>()((set, get) => ({
  project: null,
  actionExecutors: {},
  history: [],
  historyIndex: -1,

  getDuration: () => get().project?.edl.timeline.duration ?? 0,
  getTracks: () => get().project?.edl.timeline.tracks ?? [],
  getClipById: (clipId) => {
    const tracks = get().project?.edl.timeline.tracks ?? [];
    for (const t of tracks) {
      const c = t.clips.find((cl) => cl.id === clipId);
      if (c) return { clip: c, trackId: t.id };
    }
    return null;
  },

  bootstrapEmptyProject: () => {
    const empty = createEmptyProject();
    set({ project: empty, history: [structuredClone(empty)], historyIndex: 0 });
    return empty;
  },

  registerActionExecutor: (id, executor) =>
    set((s) => ({ actionExecutors: { ...s.actionExecutors, [id]: executor } })),

  getActionExecutor: (id) => get().actionExecutors[id],

  applyMonetEDLToProject: async (edlInput) => {
    const project = get().project ?? createEmptyProject();
    const updated = { ...project, edl: edlInput, modifiedAt: Date.now() };
    set({ project: updated, ...pushHistory(get(), updated) });
    return { success: true, data: { appliedShots: edlInput.timeline?.tracks?.length ?? 0, duration: edlInput.timeline?.duration ?? 0 } };
  },

  updateClip: (clipId, patch) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) { Object.assign(clip, patch); break; }
        }
        draft.edl.timeline.duration = recomputeDuration(draft.edl);
        draft.modifiedAt = Date.now();
      });
      return { project: updated, ...pushHistory(state, updated) };
    }),

  moveClip: (clipId, newStart) =>
    get().updateClip(clipId, { startTime: Math.max(0, newStart) }),

  trimClip: (clipId, edge, newTime) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) continue;
          if (edge === "start") {
            const delta = newTime - clip.startTime;
            const newDur = clip.duration - delta;
            if (newDur < 0.05) return;
            clip.startTime = newTime;
            clip.duration = newDur;
          } else {
            const newDur = newTime - clip.startTime;
            if (newDur < 0.05) return;
            clip.duration = newDur;
          }
          break;
        }
        draft.edl.timeline.duration = recomputeDuration(draft.edl);
        draft.modifiedAt = Date.now();
      });
      return { project: updated, ...pushHistory(state, updated) };
    }),

  splitClip: (clipId, atTime) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === clipId);
          if (idx === -1) continue;
          const clip = track.clips[idx];
          const localSplit = atTime - clip.startTime;
          if (localSplit <= 0.05 || localSplit >= clip.duration - 0.05) return;
          const right: Clip = {
            ...structuredClone(clip),
            id: `${clip.id}-r-${crypto.randomUUID().slice(0, 6)}`,
            startTime: atTime,
            duration: clip.duration - localSplit,
          };
          clip.duration = localSplit;
          track.clips.splice(idx + 1, 0, right);
          break;
        }
        draft.modifiedAt = Date.now();
      });
      return { project: updated, ...pushHistory(state, updated) };
    }),

  deleteClip: (clipId) =>
    set((state) => {
      if (!state.project) return state;
      const updated = produce(state.project, (draft) => {
        for (const track of draft.edl.timeline.tracks) {
          const idx = track.clips.findIndex((c) => c.id === clipId);
          if (idx !== -1) { track.clips.splice(idx, 1); break; }
        }
        draft.edl.timeline.duration = recomputeDuration(draft.edl);
        draft.modifiedAt = Date.now();
      });
      return { project: updated, ...pushHistory(state, updated) };
    }),

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({ project: structuredClone(prev), historyIndex: historyIndex - 1 });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({ project: structuredClone(next), historyIndex: historyIndex + 1 });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
}));

export const useEDL = () => useProjectStore((s) => s.project?.edl);
export const useTracks = () => useProjectStore((s) => s.project?.edl.timeline.tracks ?? []);
export const useDuration = () => useProjectStore((s) => s.project?.edl.timeline.duration ?? 0);
```

---

## FILE 6: `apps/web/src/engine/web-player.ts`

```ts
import type { ProjectEDL as MonetEDL } from "@monet/edl";
import { createAudioTimelineEngine } from "./audio/audio-timeline-engine";
import type { AudioTimelineEngine } from "./audio/audio-types";
import { createBeatEngine } from "./audio/beat-engine";
import { runLayeredEffects } from "./effects/layered-effect-runner";
import { resolveFrame } from "./timeline-resolver";

export interface PlayerControls {
  load(): Promise<{ success: boolean; error?: any }>;
  play(): Promise<{ success: boolean; error?: any }>;
  pause(): { success: boolean };
  stop(): { success: boolean };
  seek(time: number): { success: boolean };
  setSpeed(speed: number): { success: boolean };
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  dispose(): { success: boolean };
  onTimeUpdate(cb: (t: number) => void): () => void;
}

interface VideoEntry {
  video: HTMLVideoElement;
  ready: boolean;
  error: string | null;
  tainted: boolean;
}

const FPS_CAP = 60;
const MIN_FRAME_MS = 1000 / FPS_CAP;
const SEEK_DRIFT_THRESHOLD = 0.25;

function createVideoElement(src: string): VideoEntry {
  const video = document.createElement("video");
  video.src = src;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const entry: VideoEntry = { video, ready: false, error: null, tainted: false };
  video.addEventListener("loadedmetadata", () => { entry.ready = true; });
  video.addEventListener("error", () => { entry.error = `Failed to load: ${src}`; });
  video.load();
  return entry;
}

export function createWebPlayer(canvas: HTMLCanvasElement, edl: MonetEDL): PlayerControls {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const videos = new Map<string, VideoEntry>();
  const audioEngineResult = createAudioTimelineEngine({ edl });
  const audioEngine: AudioTimelineEngine | null = audioEngineResult.success
    ? audioEngineResult.data ?? null
    : null;
  const beatEngine = createBeatEngine(edl);

  let playing = false;
  let disposed = false;
  let manualTime = 0;
  let speed = 1;
  let lastFrameTimestamp = 0;
  let lastRenderMs = 0;
  let animationFrameId: number | null = null;
  let currentClipId: string | null = null;
  const timeListeners = new Set<(t: number) => void>();

  function readCurrentTime(): number {
    if (audioEngine) return audioEngine.getTimelineTime();
    return manualTime;
  }

  function getVideo(mediaId: string, src: string): VideoEntry {
    const existing = videos.get(mediaId);
    if (existing) return existing;
    const created = createVideoElement(src);
    videos.set(mediaId, created);
    return created;
  }

  function pruneVideos() {
    const referenced = new Set<string>();
    for (const track of edl.timeline.tracks) {
      if (track.type !== "video") continue;
      for (const clip of track.clips) referenced.add(clip.mediaId);
    }
    for (const [id, entry] of videos) {
      if (!referenced.has(id)) {
        try { entry.video.pause(); entry.video.removeAttribute("src"); entry.video.load(); } catch {}
        videos.delete(id);
      }
    }
  }

  function detectTaint(entry: VideoEntry): boolean {
    if (entry.tainted) return true;
    try { ctx.getImageData(0, 0, 1, 1); return false; }
    catch { entry.tainted = true; return true; }
  }

  function drawPlaceholder(message: string): void {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "600 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  function drawVideoFrame(video: HTMLVideoElement, clipCrop: { x: number; y: number; width: number; height: number } | undefined): void {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) { drawPlaceholder("Loading…"); return; }
    if (clipCrop) {
      const sx = video.videoWidth * clipCrop.x;
      const sy = video.videoHeight * clipCrop.y;
      const sw = video.videoWidth * clipCrop.width;
      const sh = video.videoHeight * clipCrop.height;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  function render(timestamp: number): void {
    if (!playing || disposed) return;
    animationFrameId = requestAnimationFrame(render);
    if (timestamp - lastRenderMs < MIN_FRAME_MS) return;
    lastRenderMs = timestamp;

    if (!audioEngine) {
      const delta = lastFrameTimestamp === 0 ? 0 : (timestamp - lastFrameTimestamp) / 1000;
      manualTime += delta * speed;
    }
    lastFrameTimestamp = timestamp;

    const timelineTime = readCurrentTime();
    timeListeners.forEach((cb) => cb(timelineTime));

    const frame = resolveFrame(edl, timelineTime);
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!frame) { drawPlaceholder("No active clip"); ctx.restore(); currentClipId = null; return; }

    const asset = edl.assets.media[frame.clip.mediaId];
    if (!asset) { drawPlaceholder(`Missing asset: ${frame.clip.mediaId}`); ctx.restore(); return; }

    const entry = getVideo(asset.id, asset.path);
    if (entry.error) { drawPlaceholder(entry.error); ctx.restore(); return; }

    const clipChanged = currentClipId !== frame.clip.id;
    currentClipId = frame.clip.id;

    const safeLocalTime = Math.max(0, Math.min(frame.localTime, Math.max(0, asset.duration - 0.02)));
    if (Number.isFinite(safeLocalTime)) {
      const drift = Math.abs(entry.video.currentTime - safeLocalTime);
      if (clipChanged || drift > SEEK_DRIFT_THRESHOLD) {
        try { entry.video.currentTime = safeLocalTime; } catch (e) { console.error("[WebPlayer] seek failed", e); }
      }
      if (playing && entry.video.paused && entry.ready) {
        entry.video.playbackRate = speed;
        entry.video.play().catch(() => {});
      } else if (entry.ready) {
        entry.video.playbackRate = speed;
      }
    }

    const layers = runLayeredEffects(frame.clip.effects ?? [], {
      time: timelineTime, localTime: frame.localTime, duration: frame.clip.duration,
      ctx, canvasWidth: canvas.width, canvasHeight: canvas.height, beatEngine,
    });
    layers.runBackground();
    drawVideoFrame(entry.video, frame.clip.transforms?.crop?.[0]);
    if (detectTaint(entry)) console.warn("[WebPlayer] canvas tainted — CORS missing on", asset.path);
    layers.runForeground();
    ctx.restore();
  }

  return {
    async load() { pruneVideos(); return { success: true }; },
    async play() {
      if (disposed) return { success: false, error: { code: "DISPOSED" } };
      playing = true; lastFrameTimestamp = 0; lastRenderMs = 0;
      if (audioEngine) await audioEngine.play();
      animationFrameId = requestAnimationFrame(render);
      return { success: true };
    },
    pause() {
      playing = false;
      if (audioEngine) audioEngine.pause();
      for (const e of videos.values()) e.video.pause();
      if (animationFrameId !== null) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      return { success: true };
    },
    stop() {
      playing = false; manualTime = 0;
      if (audioEngine) { audioEngine.pause(); audioEngine.seek(0); }
      for (const e of videos.values()) { e.video.pause(); try { e.video.currentTime = 0; } catch {} }
      currentClipId = null;
      if (animationFrameId !== null) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      drawPlaceholder("Stopped");
      return { success: true };
    },
    seek(time: number) {
      manualTime = Math.max(0, time);
      if (audioEngine) audioEngine.seek(time);
      if (!playing) {
        playing = true;
        animationFrameId = requestAnimationFrame((ts) => { render(ts); playing = false; });
      }
      return { success: true };
    },
    setSpeed(s: number) {
      speed = Math.max(0.1, Math.min(4, s));
      if (audioEngine) (audioEngine as any).setPlaybackRate?.(speed);
      return { success: true };
    },
    getCurrentTime: readCurrentTime,
    getDuration: () => edl.timeline.duration ?? 0,
    isPlaying: () => playing,
    dispose() {
      disposed = true; playing = false;
      if (animationFrameId !== null) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      if (audioEngine) audioEngine.dispose?.();
      for (const e of videos.values()) { try { e.video.pause(); e.video.removeAttribute("src"); e.video.load(); } catch {} }
      videos.clear(); timeListeners.clear();
      return { success: true };
    },
    onTimeUpdate(cb) { timeListeners.add(cb); return () => timeListeners.delete(cb); },
  };
}
```

---

## FILE 7: `apps/web/src/engine/timeline-resolver.ts`

```ts
import type { ProjectEDL as MonetEDL, Clip } from "@monet/edl";

export interface ResolvedFrame {
  clip: Clip;
  localTime: number;
  globalTime: number;
}

const indexCache = new WeakMap<MonetEDL, IndexedTrack[]>();

interface IndexedTrack {
  starts: number[];
  clips: Clip[];
}

function buildIndex(edl: MonetEDL): IndexedTrack[] {
  const out: IndexedTrack[] = [];
  for (const t of edl.timeline.tracks) {
    if (t.type !== "video") continue;
    const sorted = [...t.clips].sort((a, b) => a.startTime - b.startTime);
    out.push({ starts: sorted.map((c) => c.startTime), clips: sorted });
  }
  return out;
}

function findClipAt(track: IndexedTrack, time: number): Clip | null {
  let lo = 0, hi = track.starts.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track.starts[mid] <= time) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (idx === -1) return null;
  const c = track.clips[idx];
  if (time <= c.startTime + c.duration) return c;
  return null;
}

export function resolveFrame(edl: MonetEDL, time: number): ResolvedFrame | null {
  let idx = indexCache.get(edl);
  if (!idx) { idx = buildIndex(edl); indexCache.set(edl, idx); }
  for (const track of idx) {
    const clip = findClipAt(track, time);
    if (clip) return { clip, localTime: (time - clip.startTime) * (clip.speed || 1), globalTime: time };
  }
  return null;
}

export function invalidateResolverCache(edl: MonetEDL) { indexCache.delete(edl); }
```

---

## FILE 8: `apps/web/src/hooks/useRefineEDL.ts`

```ts
import { useCallback, useRef, useState } from "react";
import { refineEDL } from "../lib/api-client";
import { useProjectStore } from "../stores/project-store";

export function useRefineEDL() {
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const applyEDL = useProjectStore((s) => s.applyMonetEDLToProject);

  const start = useCallback(
    async (input: { projectId: string; edl: any; feedback: string; edlId?: string }) => {
      setStreaming(true); setPartial(""); setError(null);
      ctrlRef.current = new AbortController();
      await refineEDL(input, {
        onChunk: (c) => setPartial((p) => p + c),
        onClarification: (q) => setError(`Clarify: ${q}`),
        onDone: async ({ edl }) => { await applyEDL(edl); setStreaming(false); },
        onError: (e) => { setError(e.message || e.code); setStreaming(false); },
      }, ctrlRef.current.signal);
    },
    [applyEDL]
  );

  const cancel = useCallback(() => ctrlRef.current?.abort(), []);
  return { start, cancel, streaming, partial, error };
}
```

---

## FILE 9: `apps/web/src/hooks/useKeyboardShortcuts.ts`

```ts
import { useEffect } from "react";
import { useProjectStore } from "../stores/project-store";

export interface ShortcutHandlers {
  onPlayPause?: () => void;
  onSeekBy?: (deltaSec: number) => void;
  selectedClipId?: string | null;
  playhead?: number;
}

export function useKeyboardShortcuts(h: ShortcutHandlers) {
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const splitClip = useProjectStore((s) => s.splitClip);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.code === "Space") { e.preventDefault(); h.onPlayPause?.(); }
      else if (e.code === "ArrowLeft") h.onSeekBy?.(e.shiftKey ? -1 : -0.1);
      else if (e.code === "ArrowRight") h.onSeekBy?.(e.shiftKey ? 1 : 0.1);
      else if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (h.selectedClipId) deleteClip(h.selectedClipId); }
      else if (e.key.toLowerCase() === "s") { if (h.selectedClipId && typeof h.playhead === "number") splitClip(h.selectedClipId, h.playhead); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h.onPlayPause, h.onSeekBy, h.selectedClipId, h.playhead, deleteClip, splitClip, undo, redo]);
}
```

---

## FILE 10: `apps/web/src/lib/api-client.ts`

```ts
import type { ProjectEDL as MonetEDL } from "@monet/edl";

export interface RefineEDLStreamEvents {
  onChunk?: (text: string) => void;
  onClarification?: (q: string) => void;
  onDone?: (payload: { edl: any; edlId: string; scores: any }) => void;
  onError?: (err: { code: string; message: string }) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function refineEDL(
  params: {
    projectId: string;
    edlId?: string;
    edl: any;
    feedback: string;
    intentId?: string;
    analysisId?: string;
    annotations?: any;
    referenceStyle?: any;
    referenceMode?: "strict_replication" | "inspired";
  },
  events: RefineEDLStreamEvents = {},
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/refine-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referenceMode: "strict_replication", ...params }),
    signal,
  });

  if (!res.ok || !res.body) {
    events.onError?.({ code: "HTTP_ERROR", message: `Server returned ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const obj = JSON.parse(payload);
            if (obj.chunk) events.onChunk?.(obj.chunk);
            else if (obj.clarification) events.onClarification?.(obj.clarification);
            else if (obj.error) events.onError?.({ code: obj.error, message: obj.message ?? "" });
            else if (obj.done) events.onDone?.({ edl: obj.edl, edlId: obj.edlId, scores: obj.scores });
          } catch {}
        }
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") events.onError?.({ code: "ABORTED", message: "User cancelled" });
    else events.onError?.({ code: "STREAM_ERROR", message: String(err) });
  } finally { reader.releaseLock(); }
}
```

---

## FILE 11: `apps/web/src/components/editor/AudioWaveform.tsx`

```tsx
import React, { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  duration: number;
  height?: number;
}

export function AudioWaveform({ src, duration, height = 48 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AC();
        const audioBuf = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const cctx = canvas.getContext("2d")!;
        const w = canvas.width = canvas.clientWidth * devicePixelRatio;
        const h = canvas.height = height * devicePixelRatio;
        cctx.clearRect(0, 0, w, h);
        const channel = audioBuf.getChannelData(0);
        const samplesPerPx = Math.max(1, Math.floor(channel.length / w));
        cctx.fillStyle = "rgba(16,185,129,0.7)";
        for (let x = 0; x < w; x++) {
          let min = 1, max = -1;
          const start = x * samplesPerPx;
          const end = Math.min(channel.length, start + samplesPerPx);
          for (let i = start; i < end; i++) { const v = channel[i]; if (v < min) min = v; if (v > max) max = v; }
          const y1 = ((1 + min) * h) / 2;
          const y2 = ((1 + max) * h) / 2;
          cctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
        }
        setLoaded(true);
        ctx.close();
      } catch (e) { console.error("[Waveform] decode failed", e); }
    })();
    return () => { cancelled = true; };
  }, [src, height]);

  return (
    <div className="w-full bg-muted/10 border rounded relative" style={{ height }}>
      <canvas ref={canvasRef} className="w-full h-full" />
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          decoding waveform…
        </span>
      )}
    </div>
  );
}
```

---

## FILE 12: `apps/web/src/components/ErrorBoundary.tsx`

```tsx
import React from "react";

interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="m-6 p-4 border border-red-400/30 rounded bg-red-500/5 text-red-300">
          <div className="font-semibold mb-2">Editor crashed</div>
          <pre className="text-xs whitespace-pre-wrap">{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} className="mt-3 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

## FILE 13: `src/server/api/refine-edl.ts`

```ts
import type { Env } from "../types/env";
import { getAIService } from "../services/ai-service";
import { scoreNewPipelineEDL } from "../lib/edl-scoring";
import { apiError, ApiErrorCode } from "../lib/api-response";
import { z } from "zod";

const EDLSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  timeline: z.object({
    duration: z.number(),
    tracks: z.array(z.any()),
    markers: z.array(z.any()).optional(),
  }),
  assets: z.object({ media: z.record(z.string(), z.any()) }).optional(),
  music: z.any().optional(),
});

const REFINE_SYSTEM =
  "You refine an existing EDL based on user feedback. " +
  "Return the COMPLETE updated EDL as JSON matching the EDL schema. Preserve shot ids when possible. " +
  'If feedback is vague, ask a clarifying question by returning {"clarification":"..."} instead of an EDL.';

export async function handleRefineEDL(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { projectId: string; edlId?: string; edl: any; feedback: string };
    const { projectId, edl, feedback } = body;
    if (!edl || !feedback) return apiError(ApiErrorCode.InvalidRequest, "edl and feedback are required", 400);

    const ai = getAIService(env);
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 25_000);

    const stream = new ReadableStream({
      async start(controller) {
        const enc = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        let accumulated = "";

        try {
          for await (const chunk of ai.runStream({
            systemPrompt: REFINE_SYSTEM,
            prompt: `Current EDL:\n${JSON.stringify(edl)}\n\nUser feedback: "${feedback}"\n\nReturn updated EDL JSON.`,
            maxTokens: 6144,
            signal: abortController.signal,
          })) { accumulated += chunk; enc({ chunk }); }
          clearTimeout(timeoutId);

          let parsed: any;
          try {
            const trimmed = accumulated.trim();
            const match = trimmed.match(/```json?\s*([\s\S]*?)```/);
            parsed = JSON.parse(match ? match[1] : trimmed);
          } catch { enc({ error: "PARSE_FAILED", message: "AI returned invalid JSON" }); controller.close(); return; }

          if (parsed.clarification) { enc({ clarification: parsed.clarification }); controller.close(); return; }

          const validation = EDLSchema.safeParse(parsed);
          if (!validation.success) { enc({ error: "SCHEMA_INVALID", message: validation.error.message.slice(0, 500) }); controller.close(); return; }

          let scores: any = null;
          try { scores = scoreNewPipelineEDL(parsed, parsed.music ?? edl.music); } catch (e) { enc({ error: "SCORE_FAILED", message: (e as Error).message }); }

          const edlId = crypto.randomUUID();
          let persisted = true;
          if (env.DB) {
            try {
              await env.DB.prepare(
                `INSERT INTO edls (id, project_id, data, beat_sync_score, pacing_variance, overall_confidence, used_fallback, feedback_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(edlId, projectId, JSON.stringify(parsed), scores?.beatSyncScore ?? null, scores?.pacingVariance ?? null, scores?.overallConfidence ?? null, 0, feedback, Date.now()).run();
            } catch (e) { persisted = false; console.warn("[refine-edl] D1 insert failed:", (e as Error).message); }
          }

          enc({ done: true, edlId, edl: parsed, scores, persisted, generationMode: "ai_director" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) { clearTimeout(timeoutId); enc({ error: "REFINE_FAILED", message: (err as Error).message }); controller.close(); }
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  } catch (error: any) {
    console.error("[refine-edl] Error:", error);
    return apiError(ApiErrorCode.EDLGenerationFailed, error.message || "Refine failed", 500);
  }
}
```

---

## What's NOT wired yet

| Gap | Fix needed |
|-----|-----------|
| OpenReel postMessage listener | Add `window.addEventListener("message")` in OpenReel's `main.tsx` to handle `monet-load-project` and send `monet-editor-ready` + `monet-project-updated` |
| Media blob loading | `edl-to-openreel.ts` sets `blob: null` — need to fetch from R2 and create object URLs, or OpenReel needs to accept `originalUrl` and load itself |
| Refine → OpenReel hot reload | When `useRefineEDL.onDone` fires, the bridge's `useEffect([edl])` should re-post the updated project to the iframe |
| ClipInspector uses `project.timeline` | Line 21: `project.timeline.tracks` → `project.edl.timeline.tracks` |
| Route wiring | Need a route that renders `<VibeEditor />` |
| OpenReel dev server | `cd openreel-video && pnpm dev` (port 5173) |

## How to run

```bash
bun add immer
cd openreel-video && pnpm dev    # terminal 1: OpenReel on :5173
bun run dev                       # terminal 2: Kove on :8787
```
