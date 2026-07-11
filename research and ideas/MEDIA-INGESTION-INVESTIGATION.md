# Media Ingestion Investigation — Full Source Code

> Every file mentioned in the investigation, with full source code inline.

---

## Table of Contents

1. [Grep Results](#grep-results)
2. [src/components/chat/VideoUploader.tsx](#1-videouploader)
3. [src/components/chat/VideoPreview.tsx](#2-videopreview)
4. [src/lib/renderer/monet-renderer.ts](#3-monet-renderer)
5. [src/lib/renderer/media-loader.ts](#4-media-loader)
6. [src/lib/renderer/url-resolver.ts](#5-url-resolver)
7. [src/lib/renderer/simple-preview-fallback.ts](#6-simple-preview-fallback)
8. [src/lib/renderer/monet-edl-preview-normalizer.ts](#7-monet-edl-preview-normalizer)
9. [src/lib/renderer/types.ts](#8-renderer-types)
10. [apps/web/src/stores/project-store.ts](#9-project-store)
11. [apps/web/src/stores/shot-to-project-edl.ts](#10-shot-to-project-edl-converter)
12. [apps/web/src/stores/edl-adapter.ts](#11-edl-adapter)
13. [apps/web/src/lib/media/project-media-hydration.ts](#12-project-media-hydration)
14. [apps/web/src/engine/web-player.ts](#13-web-player)
15. [apps/web/src/engine/timeline-resolver.ts](#14-timeline-resolver)
16. [src/routes/chat_.$threadId.tsx (media URL building)](#15-chat-route-media-urls)

---

## Grep Results

### `grep -R "scene1.mp4" src`
**No results.** No hardcoded demo asset paths exist in the codebase.

### `grep -R "__monetStore" src`
```
src/routes/chat_.$threadId.tsx:35:  (window as any).__monetStore = useProjectStore;
src/routes/chat_.$threadId.tsx:36:  console.log("[monet] debug: store available at window.__monetStore");
```

### `grep -R "applyMonetEDLToProject" src`
```
src/routes/chat_.$threadId.tsx:578:    const applyResult = await useProjectStore.getState().applyMonetEDLToProject(generatedEdl);
```

---

## 1. VideoUploader

**Path:** `src/components/chat/VideoUploader.tsx`
**Purpose:** File upload UI — drag-drop, type classification, URL submission.

```tsx
import { useRef, useState } from "react";
import { Upload, X, Film, Music, Image, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  id: string;
  file: File;
  type: "footage" | "music" | "reference";
  preview?: string;
  r2FileId?: string;
  uploadProgress?: number;
}

interface VideoUploaderProps {
  onFilesChange: (files: UploadedFile[]) => void;
  onYouTubeUrl?: (url: string) => void;
  disabled?: boolean;
}

function defaultType(file: File): UploadedFile["type"] | null {
  if (file.type.startsWith("video/")) return "footage";
  if (file.type.startsWith("audio/")) return "music";
  if (file.type.startsWith("image/")) return "reference";
  return null;
}

const TYPE_LABEL: Record<UploadedFile["type"], string> = {
  footage: "Footage",
  music: "Music",
  reference: "Reference",
};

const TYPE_COLOR: Record<UploadedFile["type"], string> = {
  footage: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
  music: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25",
  reference: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
};

export function VideoUploader({ onFilesChange, onYouTubeUrl, disabled }: VideoUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addRawFiles = (rawFiles: File[]) => {
    if (disabled) return;
    const added: UploadedFile[] = [];
    for (const file of rawFiles) {
      const type = defaultType(file);
      if (!type) continue;
      const preview =
        file.type.startsWith("video/") || file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
      added.push({ id: crypto.randomUUID(), file, type, preview });
    }
    if (added.length === 0) return;
    const updated = [...files, ...added];
    setFiles(updated);
    onFilesChange(updated);
  };

  const setType = (id: string, type: UploadedFile["type"]) => {
    const updated = files.map((f) => (f.id === id ? { ...f, type } : f));
    setFiles(updated);
    onFilesChange(updated);
  };

  const removeFile = (id: string) => {
    const removed = files.find((f) => f.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    const updated = files.filter((f) => f.id !== id);
    setFiles(updated);
    onFilesChange(updated);
  };

  const submitUrl = () => {
    const url = urlDraft.trim();
    if (!url || !onYouTubeUrl) return;
    onYouTubeUrl(url);
    setUrlDraft("");
    setShowUrl(false);
  };

  const counts = { footage: 0, music: 0, reference: 0 };
  for (const f of files) counts[f.type]++;

  const summary = [
    counts.footage > 0 && `${counts.footage} clip${counts.footage !== 1 ? "s" : ""}`,
    counts.music > 0 && `${counts.music} music`,
    counts.reference > 0 && `${counts.reference} reference`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); addRawFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => { if (!disabled) fileInputRef.current?.click(); }}
        role="button" tabIndex={disabled ? -1 : 0} aria-label="Upload files"
        className={cn("rounded-lg border-2 border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-card/50",
          disabled && "opacity-50 cursor-not-allowed")}
      >
        <div className={cn("flex items-center justify-between px-4 py-3 gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{summary || "Drop footage, music, images here"}</span>
            {summary && <span className="text-xs text-muted-foreground/60">· add more</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onYouTubeUrl && (
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowUrl((v) => !v); }}
                disabled={disabled}
                className={cn("flex items-center gap-1 text-xs border rounded px-2 py-1 transition-colors",
                  showUrl ? "border-primary/50 text-primary bg-primary/5" : "border-border/60 text-muted-foreground hover:text-foreground")}>
                <Link className="h-3 w-3" />URL
              </button>
            )}
          </div>
        </div>
        <input ref={fileInputRef} type="file" multiple accept="video/*,audio/*,image/*"
          onChange={(e) => addRawFiles(Array.from(e.target.files ?? []))} disabled={disabled} className="hidden" />
      </div>
      {showUrl && (
        <div className="flex gap-2">
          <input type="url" value={urlDraft} autoFocus onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitUrl(); } if (e.key === "Escape") setShowUrl(false); }}
            placeholder="YouTube URL, Vimeo, or direct video link…"
            className="flex-1 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors min-w-0" />
          <Button variant="outline" size="sm" onClick={submitUrl} disabled={!urlDraft.trim() || disabled} className="text-xs h-8 shrink-0">Analyze</Button>
          <button onClick={() => setShowUrl(false)} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>
      )}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file) => (
            <FileCard key={file.id} file={file} onTypeChange={(t) => setType(file.id, t)} onRemove={() => removeFile(file.id)} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileCard({ file, onTypeChange, onRemove, disabled }: {
  file: UploadedFile; onTypeChange: (type: UploadedFile["type"]) => void; onRemove: () => void; disabled?: boolean;
}) {
  const isVideo = file.file.type.startsWith("video/");
  const isAudio = file.file.type.startsWith("audio/");
  const isImage = file.file.type.startsWith("image/");
  const sizeStr = (file.file.size / 1024 / 1024).toFixed(1) + " MB";
  const switchableTypes: UploadedFile["type"][] = isVideo ? ["footage", "reference"] : [];

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
      <div className="h-8 w-12 shrink-0 rounded overflow-hidden bg-secondary flex items-center justify-center">
        {file.preview && isImage ? (<img src={file.preview} alt="" className="h-full w-full object-cover" />)
          : file.preview && isVideo ? (<video src={file.preview} className="h-full w-full object-cover" muted playsInline />)
          : isAudio ? (<Music className="h-3.5 w-3.5 text-purple-500" />) : (<Film className="h-3.5 w-3.5 text-blue-500" />)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate leading-tight">{file.file.name}</p>
        <p className="text-[11px] text-muted-foreground leading-tight">{sizeStr}</p>
      </div>
      {switchableTypes.length > 1 ? (
        <div className="flex shrink-0 rounded-full border border-border overflow-hidden">
          {switchableTypes.map((t) => (
            <button key={t} onClick={() => onTypeChange(t)} disabled={disabled}
              className={cn("px-2.5 py-0.5 text-[10px] font-medium transition-colors leading-none",
                file.type === t ? TYPE_COLOR[t] : "text-muted-foreground/40 hover:text-muted-foreground")}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      ) : (
        <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium leading-none", TYPE_COLOR[file.type])}>
          {TYPE_LABEL[file.type]}
        </span>
      )}
      <button onClick={onRemove} disabled={disabled}
        className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground transition-colors disabled:opacity-30 ml-0.5">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

---

## 2. VideoPreview (Chat Route)

**Path:** `src/components/chat/VideoPreview.tsx`
**Purpose:** Canvas preview using `MonetRenderer` + external `mediaUrls` map.

```tsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { MonetEDL, Shot } from "../../server/types/edl";
import type { TimelineAnnotation } from "../../server/types/annotation";
import { MonetRenderer } from "../../lib/renderer/monet-renderer";
import { hashEdl } from "../../lib/renderer/edl-hash";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { CompositionOverlay } from "./CompositionOverlay";

function getShotAtTime(shots: Shot[], time: number): { shot: Shot; index: number } | null {
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (time >= s.timing.startTime && time < s.timing.startTime + s.timing.duration) {
      return { shot: s, index: i };
    }
  }
  return null;
}

interface VideoPreviewProps {
  edl: MonetEDL;
  mediaUrls?: Map<string, string>;
  className?: string;
  onAnnotation?: (annotation: TimelineAnnotation) => void;
  annotations?: TimelineAnnotation[];
  compositionHtml?: string;
  onTimeUpdate?: (timeMs: number) => void;
  seekToMs?: number;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

export function VideoPreview({
  edl, mediaUrls, className, onAnnotation, annotations,
  compositionHtml, onTimeUpdate, seekToMs, playing: externalPlaying,
  onPlayingChange,
}: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MonetRenderer | null>(null);
  const animationRef = useRef<number | null>(null);
  const hasPlayedRef = useRef(false);
  const timeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isScrubbingRef = useRef(false);

  const [isPlaying, _setIsPlaying] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnnotationOverlay, setShowAnnotationOverlay] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const annotationInputRef = useRef<HTMLInputElement>(null);

  const setIsPlaying = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    _setIsPlaying((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      isPlayingRef.current = next;
      onPlayingChange?.(next);
      return next;
    });
  }, [onPlayingChange]);

  const edlHash = useMemo(() => hashEdl(edl as any), [edl]);

  // Initialize renderer
  useEffect(() => {
    let disposed = false;
    const initRenderer = async () => {
      if (!canvasRef.current) return;
      setIsLoading(true);
      setError(null);
      try {
        const renderer = new MonetRenderer();
        await renderer.initialize(edl, canvasRef.current, mediaUrls);
        if (disposed) { renderer.cleanup(); return; }
        rendererRef.current = renderer;
        setDuration(renderer.getDuration());
        await renderer.renderFrame(timeRef.current);
        if (!disposed) setIsLoading(false);
      } catch (err) {
        if (!disposed) {
          console.error("Failed to initialize renderer:", err);
          setError(err instanceof Error ? err.message : "Failed to load preview");
          setIsLoading(false);
        }
      }
    };
    initRenderer();
    return () => {
      disposed = true;
      rendererRef.current?.cleanup();
      rendererRef.current = null;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [edlHash, mediaUrls]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !rendererRef.current || duration <= 0) return;
    let lastTimestamp: number | null = null;
    const animate = (timestamp: number) => {
      if (!isPlayingRef.current || !rendererRef.current || isScrubbingRef.current) return;
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const deltaTime = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      const newTime = timeRef.current + deltaTime;
      if (newTime >= duration) {
        timeRef.current = duration; setDisplayTime(duration); setIsPlaying(false);
        rendererRef.current.renderFrame(duration).catch(() => {});
        onTimeUpdate?.(Math.round(duration * 1000)); return;
      }
      timeRef.current = newTime; setDisplayTime(newTime);
      rendererRef.current.renderFrame(newTime).catch(() => {});
      onTimeUpdate?.(Math.round(newTime * 1000));
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; } };
  }, [isPlaying, duration, onTimeUpdate, setIsPlaying]);

  const handleSeek = useCallback(async (time: number) => {
    const clamped = Math.max(0, Math.min(time, duration));
    timeRef.current = clamped; setDisplayTime(clamped);
    if (rendererRef.current) {
      try { await rendererRef.current.renderFrame(clamped); onTimeUpdate?.(Math.round(clamped * 1000)); }
      catch (e) { console.error("Seek render failed", e); }
    }
  }, [duration, onTimeUpdate]);

  const handleScrubStart = useCallback(() => { isScrubbingRef.current = true; }, []);
  const handleScrubEnd = useCallback(() => { isScrubbingRef.current = false; }, []);

  const prevSeekRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (seekToMs !== undefined && seekToMs !== prevSeekRef.current) { prevSeekRef.current = seekToMs; handleSeek(seekToMs / 1000); }
  }, [seekToMs, handleSeek]);

  useEffect(() => {
    if (externalPlaying !== undefined && externalPlaying !== isPlayingRef.current) { _setIsPlaying(externalPlaying); isPlayingRef.current = externalPlaying; }
  }, [externalPlaying]);

  const handleAnnotationSubmit = () => {
    const text = annotationText.trim(); setShowAnnotationOverlay(false); setAnnotationText("");
    if (!text || !onAnnotation) return;
    const found = getShotAtTime(edl.shots, displayTime);
    onAnnotation({ id: crypto.randomUUID(), timestamp: displayTime, shotId: found?.shot.id ?? "", shotIndex: found?.index ?? 0, text, createdAt: Date.now() });
  };

  const togglePlay = () => {
    if (!isPlaying) {
      hasPlayedRef.current = true; setShowAnnotationOverlay(false);
      if (timeRef.current >= duration) { timeRef.current = 0; setDisplayTime(0); }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      if (hasPlayedRef.current && onAnnotation) { setAnnotationText(""); setShowAnnotationOverlay(true); setTimeout(() => annotationInputRef.current?.focus(), 50); }
    }
  };

  const skipForward = () => handleSeek(Math.min(displayTime + 5, duration));
  const skipBackward = () => handleSeek(Math.max(displayTime - 5, 0));
  const formatTime = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs.toString().padStart(2, "0")}`; };

  if (error) {
    return (<div className={className}><div className="bg-destructive/10 text-destructive p-4 rounded-lg"><p className="font-medium">Failed to load preview</p><p className="text-sm mt-1">{error}</p></div></div>);
  }

  return (
    <div className={className}>
      <div className="relative bg-black rounded-lg overflow-hidden">
        {isLoading && (<div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10"><div className="text-white">Loading preview...</div></div>)}
        <canvas ref={canvasRef} className="w-full h-auto" style={{ maxHeight: "60vh" }} />
        {compositionHtml && (<CompositionOverlay html={compositionHtml} currentTime={displayTime} visible={!isLoading} />)}
        {showAnnotationOverlay && !isLoading && (
          <div className="absolute bottom-[72px] left-4 right-4 z-20">
            <div className="bg-black/90 backdrop-blur-sm rounded-lg border border-white/20 p-3 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/50 font-mono">{formatTime(displayTime)}{(() => { const found = getShotAtTime(edl.shots, displayTime); return found ? ` · Shot ${found.index + 1}/${edl.shots.length}` : ""; })()}</span>
                <button onClick={() => setShowAnnotationOverlay(false)} className="text-white/40 hover:text-white transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex gap-2">
                <input ref={annotationInputRef} type="text" value={annotationText} onChange={(e) => setAnnotationText(e.target.value)} placeholder="What do you want here?"
                  className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 min-w-0"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAnnotationSubmit(); if (e.key === "Escape") setShowAnnotationOverlay(false); }} />
                <button onClick={handleAnnotationSubmit} disabled={!annotationText.trim()}
                  className="shrink-0 px-3 py-1.5 rounded bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Save</button>
              </div>
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="relative mb-3">
            {annotations && annotations.length > 0 && duration > 0 && (
              <div className="absolute -top-3 left-0 right-0 h-3 pointer-events-none">
                {annotations.map((a) => (<div key={a.id} className="absolute w-2 h-2 rounded-full bg-amber-400 -translate-x-1/2 top-0.5 shadow-sm" style={{ left: `${(a.timestamp / duration) * 100}%` }} title={`${formatTime(a.timestamp)}: ${a.text}`} />))}
              </div>
            )}
            <Slider value={[displayTime]} min={0} max={duration || 1} step={0.1} onPointerDown={handleScrubStart} onPointerUp={handleScrubEnd} onValueChange={([value]) => handleSeek(value)} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={skipBackward} className="text-white hover:bg-white/20"><SkipBack className="h-5 w-5" /></Button>
              <Button size="icon" variant="ghost" onClick={togglePlay} className="text-white hover:bg-white/20">{isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}</Button>
              <Button size="icon" variant="ghost" onClick={skipForward} className="text-white hover:bg-white/20"><SkipForward className="h-5 w-5" /></Button>
            </div>
            <div className="flex items-center gap-3">
              {annotations && annotations.length > 0 && (<span className="text-amber-400 text-xs font-medium">{annotations.length} note{annotations.length !== 1 ? "s" : ""}</span>)}
              <div className="text-white text-sm">{formatTime(displayTime)} / {formatTime(duration)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div><div className="text-muted-foreground">Resolution</div><div className="font-medium">{edl.timeline?.resolution?.width ?? 1920}×{edl.timeline?.resolution?.height ?? 1080}</div></div>
        <div><div className="text-muted-foreground">FPS</div><div className="font-medium">{edl.timeline?.fps ?? 30}</div></div>
        <div><div className="text-muted-foreground">Shots</div><div className="font-medium">{edl.shots.length}</div></div>
      </div>
    </div>
  );
}
```

---

## 3. MonetRenderer (key section)

**Path:** `src/lib/renderer/monet-renderer.ts`
**Purpose:** Canvas2D renderer — loads assets from `mediaUrls` map, NOT from `edl.assets.media`.

The critical section (lines 195-284):

```typescript
// Inside loadMediaAssets():
for (const shot of this.edl.shots ?? []) {
  const cid = shot.source?.clipId ?? shot.clipId;
  if (!cid) continue;
  if (mediaUrls && !mediaUrls.has(cid)) {
    console.warn("[MonetRenderer] Skipping clipId not in media map (likely reference/music leak):", cid);
    continue;
  }
  clipIds.add(cid);
}

if (clipIds.size === 0) {
  console.error("[MonetRenderer] No valid footage clipIds found in EDL — all shots may reference non-footage assets");
}

const loadPromises = clipIdList.map(async (clipId) => {
  let url = mediaUrls?.get(clipId) || `/api/media/${clipId}`;
  if (url.startsWith("blob:") && mediaUrls?.get(`${clipId}_http`)) {
    url = mediaUrls.get(`${clipId}_http`)!;
  }
  return this.mediaLoader.loadAsset(clipId, url, "video");
});
```

**Key insight:** This renderer uses the `mediaUrls` Map passed from the chat route. It does NOT read `edl.assets.media`. The SimpleEditor uses a different renderer (`web-player.ts`) that does read `edl.assets.media`.

---

## 4. MediaLoader

**Path:** `src/lib/renderer/media-loader.ts`
**Purpose:** Loads video/audio/image elements from URLs. Full source:

```typescript
import type { MediaAsset } from "./types";
import { mediaLoaderCache } from "./media-loader-cache";

export type MediaAssetType = "video" | "audio" | "image";

export interface LoadedMediaAsset extends MediaAsset {
  id: string;
  type: MediaAssetType;
  url: string;
  duration: number;
  element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  loaded: boolean;
  objectUrl?: string;
  ownsObjectUrl: boolean;
  mimeType?: string;
  failed?: boolean;
  error?: string;
}

function isObjectUrl(url: string): boolean { return url.startsWith("blob:"); }
function isDataUrl(url: string): boolean { return url.startsWith("data:"); }
function isHttpUrl(url: string): boolean { return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/"); }

function normalizeMimeType(value: string | null | undefined, fallback: string): string {
  if (!value || typeof value !== "string") return fallback;
  return value.trim().toLowerCase().split(";")[0] || fallback;
}

async function fetchAsObjectUrl(params: { url: string; fallbackMimeType: string }): Promise<{ objectUrl: string; mimeType: string }> {
  const response = await fetch(params.url, { method: "GET", cache: "force-cache" });
  if (!response.ok) throw new Error(`Failed to fetch media: HTTP ${response.status}`);
  const contentType = normalizeMimeType(response.headers.get("content-type"), params.fallbackMimeType);
  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: contentType });
  return { objectUrl: URL.createObjectURL(blob), mimeType: contentType };
}

export class MediaLoader {
  private readonly assets = new Map<string, LoadedMediaAsset>();
  private readonly loadPromises = new Map<string, Promise<LoadedMediaAsset>>();
  private readonly videoElementCache = new Map<string, HTMLVideoElement>();

  async loadAsset(id: string, url: string, type: MediaAssetType, mimeType?: string): Promise<LoadedMediaAsset> {
    if (type !== "video" && type !== "image") {
      return { id, type, url, duration: 0, loaded: false, ownsObjectUrl: false, element: null as any, failed: true, error: `Non-renderable type: ${type}` } as any;
    }
    if (id.startsWith("ref-") || id.startsWith("music-")) {
      return { id, type, url, duration: 0, loaded: false, ownsObjectUrl: false, element: null as any, failed: true, error: `Reference/music id rejected: ${id}` } as any;
    }
    const existing = this.assets.get(id);
    if (existing && !existing.failed) return existing;
    const existingPromise = this.loadPromises.get(id);
    if (existingPromise) return existingPromise;
    // ... loads via loadAssetInternal, creates HTMLVideoElement, sets src, waits for metadata
  }

  private async loadAssetInternal(id: string, url: string, type: MediaAssetType, mimeType?: string): Promise<LoadedMediaAsset> {
    const shouldFetch = isHttpUrl(url) && !isObjectUrl(url) && !isDataUrl(url);
    let src = url;
    if (shouldFetch) {
      const fetched = await fetchAsObjectUrl({ url, fallbackMimeType: "video/mp4" });
      src = fetched.objectUrl;
    }
    if (type === "video") {
      let video = this.videoElementCache.get(src);
      if (!video) {
        video = document.createElement("video");
        video.preload = "auto"; video.muted = true; video.playsInline = true;
        this.videoElementCache.set(src, video);
      }
      video.src = src;
      await waitForVideoReady(video, { timeoutMs: 120000 });
      return { id, type, url, duration: video.duration, loaded: true, ownsObjectUrl: true, element: video };
    }
    // ... similar for audio and image
  }

  getAsset(id: string): LoadedMediaAsset | null { return this.assets.get(id) ?? null; }
  cleanup(): void { /* clears all caches and revokes object URLs */ }
}
```

---

## 5. URL Resolver

**Path:** `src/lib/renderer/url-resolver.ts`
**Purpose:** Picks best URL — prefers HTTP over blob.

```typescript
export interface MediaUrlOptions {
  blob?: string;
  url?: string;
  preferred?: "auto" | "blob" | "url";
}

export async function resolveMediaUrl(opts: MediaUrlOptions): Promise<{ url: string; kind: "blob" | "url"; blobHealthy?: boolean }> {
  if (opts.preferred === "url" && opts.url) return { url: opts.url, kind: "url" };
  if (opts.preferred === "blob" && opts.blob) return { url: opts.blob, kind: "blob" };
  if (opts.url) return { url: opts.url, kind: "url" };
  if (opts.blob) {
    const healthy = await checkBlobHealth(opts.blob, 1500);
    if (healthy) return { url: opts.blob, kind: "blob", blobHealthy: true };
    throw new Error(`Blob URL is dead and no HTTP URL fallback available`);
  }
  throw new Error("No media URL provided");
}

async function checkBlobHealth(blobUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch(blobUrl, { method: "HEAD", signal: ac.signal }).catch(() => null);
    clearTimeout(to);
    return !!r && r.ok;
  } catch { return false; }
}
```

---

## 6. Simple Preview Fallback

**Path:** `src/lib/renderer/simple-preview-fallback.ts`
**Purpose:** Draws "Preview Structure" canvas when no video assets load.

```typescript
import type { MonetEDL, Shot } from "../../server/types/edl";

export function drawSimplePreviewFallback(ctx: CanvasRenderingContext2D, edl: MonetEDL, options: { reason: string; currentTime: number; width: number; height: number }): void {
  const { width, height, reason, currentTime } = options;
  ctx.save(); ctx.clearRect(0, 0, width, height);
  // Dark gradient background
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#05060a"); bg.addColorStop(0.55, "#10131c"); bg.addColorStop(1, "#030305");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  // Title + reason
  ctx.fillStyle = "rgba(255,255,255,0.96)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "700 42px system-ui"; ctx.fillText("Preview Structure", width / 2, height * 0.28);
  ctx.font = "500 18px system-ui"; ctx.fillStyle = "rgba(255,255,255,0.68)"; ctx.fillText(reason, width / 2, height * 0.36);
  // Timeline visualization with shot blocks + playhead
  // ...
  ctx.restore();
}
```

---

## 7. MonetEDL Preview Normalizer

**Path:** `src/lib/renderer/monet-edl-preview-normalizer.ts`
**Purpose:** Normalizes shot timestamps, handles speed ramps. Pure math — no asset injection.

Key exports:
- `normalizeEDLForPreview(edl)` — rebases shots, normalizes timestamps
- `findActiveShot(edl, time)` — finds active shot at given time
- `getSourceTimeForShot(shot, time)` — computes source clip time with speed ramps
- `resolvePreviewTime(edl, requestedTime)` — wraps time to valid range

Full source is 336 lines (see file directly). This file does NOT inject demo assets — it's purely mathematical normalization of shot timing.

---

## 8. Renderer Types

**Path:** `src/lib/renderer/types.ts`
**Purpose:** Shared types for the renderer layer.

---

## 9. Project Store

**Path:** `apps/web/src/stores/project-store.ts`
**Purpose:** Zustand store — project state, EDL application, media library.

Key function:
```typescript
applyMonetEDLToProject: async (edlInput, mediaItems?, mediaUrlMap?) => {
  const project = get().project ?? createEmptyProject();
  // Auto-detect shot-based EDL and convert to ProjectEDL format
  let edl = edlInput;
  if (edlInput?.shots && Array.isArray(edlInput.shots) && !edlInput.timeline?.tracks) {
    edl = convertShotEDLToProjectEDL(edlInput, mediaUrlMap ?? {});
  }
  const updated = {
    ...project,
    edl,
    ...(mediaItems ? { mediaLibrary: { items: mediaItems } } : {}),
    modifiedAt: Date.now(),
  };
  set({ project: updated, ...pushHistory(get(), updated) });
  return { success: true };
},
```

---

## 10. Shot → ProjectEDL Converter

**Path:** `apps/web/src/stores/shot-to-project-edl.ts`
**Purpose:** Converts server shot-based EDL to ProjectEDL format that the web player expects.

```typescript
import type { ProjectEDL, Clip, MediaAsset } from "@monet/edl";

export function convertShotEDLToProjectEDL(shotEdl: any, mediaUrlMap: Record<string, string> = {}): ProjectEDL {
  const shots = shotEdl.shots ?? [];
  const duration = shotEdl.timeline?.duration ?? 0;
  const fps = shotEdl.timeline?.fps ?? 30;
  const resolution = shotEdl.timeline?.resolution ?? { width: 1920, height: 1080 };
  const assets: Record<string, MediaAsset> = {};
  const clips: Clip[] = [];

  for (const shot of shots) {
    const clipId = shot.source?.clipId ?? shot.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = shot.timing?.startTime ?? 0;
    const shotDuration = shot.timing?.duration ?? Math.max((shot.source?.outPoint ?? 1) - (shot.source?.inPoint ?? 0), 0.05);
    const inPoint = shot.source?.inPoint ?? 0;
    const outPoint = shot.source?.outPoint ?? shotDuration;
    const speed = shot.timing?.speed ?? 1;

    if (!assets[clipId]) {
      assets[clipId] = {
        id: clipId,
        path: mediaUrlMap[clipId] ?? mediaUrlMap[shot.source?.clipId] ?? "",
        duration: shotDuration,
        width: resolution.width,
        height: resolution.height,
      };
    }

    clips.push({
      id: shot.id ?? `clip-${clips.length}`,
      mediaId: clipId,
      startTime, duration: shotDuration, inPoint, outPoint, speed,
      transforms: { position: [{ time: 0, x: 0, y: 0 }], scale: [{ time: 0, value: 1 }], rotation: [{ time: 0, value: 0 }] },
      audio: { gain: 1 },
      effects: (shot.effects ?? []).map((fx: any) => ({ id: fx.id ?? `fx-${Math.random().toString(36).slice(2, 8)}`, type: fx.type ?? "color_grade", start: fx.startTime ?? 0, duration: fx.duration ?? shotDuration, params: fx.params ?? {} })),
      meta: { ...shot.meta, aiRationale: shot.aiRationale, transition: shot.transition },
    });
  }

  for (const [id, url] of Object.entries(mediaUrlMap)) {
    if (!assets[id]) assets[id] = { id, path: url, duration: 0, width: resolution.width, height: resolution.height };
  }

  return {
    version: 1, id: shotEdl.metadata?.projectId ?? shotEdl.id ?? `edl-${Date.now()}`,
    meta: { createdAt: shotEdl.metadata?.createdAt ?? Date.now(), updatedAt: Date.now(), aspectRatio: resolution.width > resolution.height ? "16:9" : "9:16", fps, sampleRate: 44100 },
    timeline: { duration, tracks: [{ id: "video-main", type: "video", clips, order: 0, locked: false, hidden: false }], markers: [] },
    assets: { media: assets, audio: {}, overlays: {} },
  } as ProjectEDL;
}
```

---

## 11. EDL Adapter

**Path:** `apps/web/src/stores/edl-adapter.ts`
**Purpose:** Adapts OpenReel projects to the project store format.

```typescript
import type { ProjectEDL as MonetEDL } from "@monet/edl";

export async function applyEDLToProject(edl: MonetEDL, get: any, set: any): Promise<ActionResult> {
  if (!edl) return { success: false, error: { code: "INVALID_EDL", message: "EDL missing" } };
  const existing = get().project;
  set({ project: { ...existing, edl, modifiedAt: Date.now() } });
  return { success: true };
}

export function hydrateFromOpenReelProject(openReelProject: any, get: any, set: any): ActionResult {
  // Extracts mediaLibrary.items from OpenReel project
  // Builds EDL-compatible clips from OpenReel clips
  // Sets project with both edl and mediaLibrary
}
```

---

## 12. Project Media Hydration

**Path:** `apps/web/src/lib/media/project-media-hydration.ts`
**Purpose:** Syncs uploaded files + EDL into `project.mediaLibrary.items`.

Key function:
```typescript
export function syncUploadedFilesAndEDLToProject({ project, uploadedFiles, edl, buildMediaUrl }: SyncUploadedFilesAndEDLToProjectInput): any {
  const items = project.mediaLibrary?.items ? [...project.mediaLibrary.items] : [];
  for (const file of uploadedFiles) {
    const canonicalId = file.r2FileId || file.id;
    const pathUrl = file.preview || (file.type === "footage" && file.r2FileId ? buildMediaUrl(`${file.r2FileId}_proxy`) : buildMediaUrl(file.r2FileId ?? file.id));
    items.push({ id: canonicalId, name: file.file.name, type: file.type === "music" ? "audio" : "video", url: pathUrl, src: pathUrl, path: pathUrl, ... });
  }
  const updatedProject = { ...project, mediaLibrary: { ...(project.mediaLibrary ?? {}), items } };
  return hydrateProjectMediaFromEDL(updatedProject, edl);
}
```

**Only called from:** `chat_.$threadId.tsx:561`. NOT called from SimpleEditor.

---

## 13. Web Player (SimpleEditor renderer)

**Path:** `apps/web/src/engine/web-player.ts`
**Purpose:** Canvas player used by SimpleEditor's `LivePreview`.

Critical section (line 170):
```typescript
const asset = edl.assets.media[frame.clip.mediaId];
if (!asset) {
  drawPlaceholder(`Missing asset: ${frame.clip.mediaId}`);
  return;
}
const entry = getVideo(asset.id, asset.path);
```

**This is the different renderer from MonetRenderer.** It reads `edl.assets.media` directly, NOT from a `mediaUrls` map.

---

## 14. Timeline Resolver

**Path:** `apps/web/src/engine/timeline-resolver.ts`
**Purpose:** Binary-searches `edl.timeline.tracks` to find active clip at given time.

```typescript
export function resolveFrame(edl: MonetEDL, time: number): ResolvedFrame | null {
  let idx = indexCache.get(edl);
  if (!idx) { idx = buildIndex(edl); indexCache.set(edl, idx); }
  for (const track of idx) {
    const clip = findClipAt(track, time);
    if (clip) return { clip, localTime: (time - clip.startTime) * (clip.speed || 1), globalTime: time };
  }
  return null;
}
```

Requires `edl.timeline.tracks` — which only exists in ProjectEDL format, NOT in shot-based EDL.

---

## 15. Chat Route Media URL Building

**Path:** `src/routes/chat_.$threadId.tsx` (lines 200-370)

```typescript
const buildMediaUrl = (mediaId: string) =>
  mediaApiBase ? `${mediaApiBase}/api/media/${encodeURIComponent(mediaId)}` : `/api/media/${encodeURIComponent(mediaId)}`;

const buildPreviewMediaUrl = (mediaId: string) => {
  if (mediaId.endsWith("_proxy")) return buildMediaUrl(mediaId);
  return buildMediaUrl(`${mediaId}_proxy`);
};

// Builds mediaUrls Map from uploadedFiles + EDL + persisted attachments
useEffect(() => {
  const urls = new Map<string, string>();
  for (const f of uploadedFiles) {
    if (f.type === "footage" && f.r2FileId) urls.set(f.r2FileId, f.preview || buildMediaUrl(`${f.r2FileId}_proxy`));
    if (f.type === "music" && f.r2FileId) urls.set(f.r2FileId, f.preview || buildMediaUrl(f.r2FileId));
  }
  // Fallback: if one footage source, map all unresolved EDL clipIds to it
  if (currentEDL && footageWithPreview.length === 1) {
    const fallbackPreview = buildMediaUrl(`${firstFootage.r2FileId}_proxy`);
    for (const shot of currentEDL.shots) {
      if (!urls.has(shot.source.clipId)) urls.set(shot.source.clipId, fallbackPreview);
    }
  }
  // Also map EDL clipIds directly
  if (currentEDL) {
    for (const shot of currentEDL.shots) {
      const mediaId = shot.source.clipId;
      if (!urls.has(mediaId)) urls.set(mediaId, buildPreviewMediaUrl(mediaId));
    }
  }
  setMediaUrls(urls);
}, [uploadedFiles, currentEDL, active?.messages, mediaApiBase]);
```

**This is what the working chat route does.** The SimpleEditor was missing this entire media URL building step.

---

## Summary: Two Rendering Paths

| | Chat Route (working) | SimpleEditor (was broken) |
|---|---|---|
| **Renderer** | `MonetRenderer` (src/lib/renderer/) | `web-player.ts` (apps/web/src/engine/) |
| **Asset source** | `mediaUrls: Map<string, string>` | `edl.assets.media[id].path` |
| **URL building** | `chat_.$threadId.tsx` useEffect | `shot-to-project-edl.ts` converter |
| **EDL format** | Shot-based (shots[]) | Shot-based → converted to ProjectEDL |
| **mediaLibrary** | `syncUploadedFilesAndEDLToProject` | `applyMonetEDLToProject(edl, mediaItems)` |
