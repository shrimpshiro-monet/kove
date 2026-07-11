import React, { useState, useEffect, useRef, useCallback } from "react";
import { useEDL, useDuration, useProjectStore } from "../../../stores/project-store";
import { SimpleEditorPreview } from "../../../../../../src/components/SimpleEditorPreview";
import { ProgressPipeline, GENERATION_PIPELINE } from "./ProgressPipeline";
import type { EditorStage, UploadedFile } from "./types";

interface VideoPreviewProps {
  stage: EditorStage;
  error: string | null;
  hasEdit: boolean;
  uploadedFiles: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  pipelineStep: number;
  pipelineError?: string;
}

function PlayerControls({
  duration,
  currentTime,
  onPlayToggle,
  onSeek,
  playing,
  clipCount,
}: {
  duration: number;
  currentTime: number;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  playing: boolean;
  clipCount: number;
}) {
  const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 z-10">
      <div
        className="w-full h-1 bg-white/10 rounded-full mb-3 cursor-pointer group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onSeek(ratio * duration);
        }}
      >
        <div
          className="h-full bg-primary rounded-full transition-all group-hover:h-1.5"
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onPlayToggle} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            {playing ? (
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <span className="text-[11px] text-white/60 font-mono tabular-nums">{fmt(currentTime)} / {fmt(duration)}</span>
        </div>
        <span className="text-[10px] text-white/40 font-mono">{clipCount} clips</span>
      </div>
    </div>
  );
}

function SequentialPlayer({ edl, mediaUrls }: { edl: any; mediaUrls: Record<string, string> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentClipIdx, setCurrentClipIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const clips = edl?.timeline?.tracks?.[0]?.clips ?? [];
  const totalDuration = edl?.timeline?.duration ?? 0;

  const currentClip = clips[currentClipIdx];
  const asset = currentClip ? edl?.assets?.media?.[currentClip.mediaId] : null;
  const videoUrl = asset?.path ?? "";

  const play = useCallback(() => {
    if (!videoRef.current || !currentClip || !videoUrl) return;
    const video = videoRef.current;
    video.currentTime = currentClip.inPoint ?? 0;
    video.play().catch(() => {});
    setIsPlaying(true);
  }, [currentClip, videoUrl]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentClip) return;

    const onTimeUpdate = () => {
      const outPoint = currentClip.outPoint ?? (currentClip.inPoint ?? 0) + currentClip.duration;
      if (video.currentTime >= outPoint) {
        // Move to next clip
        if (currentClipIdx < clips.length - 1) {
          setCurrentClipIdx((i) => i + 1);
          setCurrentTime(currentClip.startTime + currentClip.duration);
        } else {
          // End of timeline
          pause();
          setCurrentTime(totalDuration);
        }
      } else {
        setCurrentTime(currentClip.startTime + (video.currentTime - (currentClip.inPoint ?? 0)));
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [currentClip, currentClipIdx, clips.length, pause, totalDuration]);

  // Auto-play when clip changes
  useEffect(() => {
    if (isPlaying && currentClip && videoUrl) {
      play();
    }
  }, [currentClipIdx, isPlaying, videoUrl]);

  if (clips.length === 0 || !videoUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full text-text-muted text-sm">
        No preview available
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black flex flex-col">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="max-w-full max-h-full object-contain"
          muted
          playsInline
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12 z-10">
        <div className="w-full h-1 bg-white/10 rounded-full mb-3">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              {isPlaying ? (
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <span className="text-[11px] text-white/60 font-mono tabular-nums">
              {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(1).padStart(4, "0")} / {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toFixed(1).padStart(4, "0")}
            </span>
          </div>
          <span className="text-[10px] text-white/40 font-mono">
            clip {currentClipIdx + 1}/{clips.length} · {currentClip?.id}
          </span>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="text-center space-y-3 animate-scale-in">
        <div className="w-12 h-12 rounded-[4px] bg-destructive/10 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm text-text-secondary font-mono">{"> "}{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="text-xs text-primary hover:underline font-mono">
            {"> "}try again
          </button>
        )}
      </div>
    </div>
  );
}

function TerminalStatus({ stage, uploadedFiles, pipelineStep }: { stage: EditorStage; uploadedFiles: UploadedFile[]; pipelineStep: number }) {
  const footageCount = uploadedFiles.filter(f => f.type === "footage").length;
  const musicCount = uploadedFiles.filter(f => f.type === "music").length;
  const refCount = uploadedFiles.filter(f => f.type === "reference").length;

  const lines: { prefix: string; text: string; done?: boolean }[] = [];

  if (uploadedFiles.length > 0) {
    if (footageCount > 0) lines.push({ prefix: "[x]", text: `${footageCount} footage file${footageCount > 1 ? "s" : ""} loaded`, done: true });
    if (musicCount > 0) lines.push({ prefix: "[x]", text: `${musicCount} audio file${musicCount > 1 ? "s" : ""} loaded`, done: true });
    if (refCount > 0) lines.push({ prefix: "[x]", text: `${refCount} reference${refCount > 1 ? "s" : ""} registered`, done: true });
  }

  if (stage === "idle") {
    if (uploadedFiles.length === 0) {
      lines.push({ prefix: "[·]", text: "waiting for footage…" });
    } else {
      lines.push({ prefix: "[·]", text: "ready — describe the edit" });
    }
  } else if (stage === "uploading") {
    lines.push({ prefix: "[>]", text: "uploading to director…" });
  } else if (stage === "analyzing") {
    lines.push({ prefix: "[>]", text: "analyzing footage structure…" });
  } else if (stage === "generating") {
    lines.push({ prefix: "[>]", text: "generating timeline…" });
  } else if (stage === "regenerating") {
    lines.push({ prefix: "[>]", text: "applying refinement…" });
  } else if (stage === "ready") {
    lines.push({ prefix: "[x]", text: "timeline ready" });
  } else if (stage === "error") {
    lines.push({ prefix: "[!]", text: "error — see log" });
  }

  return (
    <div className="font-mono text-[12px] space-y-1 px-6 max-w-[400px]">
      {lines.map((line, i) => (
        <div key={i} className={`flex items-center gap-2 ${line.done ? "text-text-tertiary" : "text-text-muted"}`}>
          <span className={`select-none ${line.done ? "text-emerald-500/70" : line.prefix === "[!]" ? "text-destructive" : "text-primary"}`}>{line.prefix}</span>
          <span>{line.text}</span>
        </div>
      ))}
    </div>
  );
}

export function VideoPreview({
  stage,
  error,
  hasEdit,
  uploadedFiles,
  onFilesChange,
  onGenerate,
  isGenerating,
  pipelineStep,
  pipelineError,
}: VideoPreviewProps) {
  const edl = useEDL();
  const duration = useDuration();
  const clipCount = edl?.timeline?.tracks?.[0]?.clips?.length ?? 0;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Build mediaUrls map from store assets
  const assets = useProjectStore((s) => s.project?.edl?.assets?.media ?? {});
  const mediaUrls: Record<string, string> = {};
  for (const [id, asset] of Object.entries(assets)) {
    if (asset.path) mediaUrls[id] = asset.path;
  }

  const showGenerating = stage === "uploading" || stage === "analyzing" || stage === "generating";
  const showError = stage === "error" && error;
  const showReady = hasEdit && stage === "ready";
  const showRegenerating = stage === "regenerating";

  // Auto-play when ready
  useEffect(() => {
    if (showReady && clipCount > 0 && !playing) {
      setPlaying(true);
    }
  }, [showReady, clipCount]);

  // Track playback time
  useEffect(() => {
    if (!playing || duration <= 0) return;
    const interval = setInterval(() => {
      setCurrentTime((t) => {
        const next = t + 1 / 30;
        return next >= duration ? 0 : next;
      });
    }, 1000 / 30);
    return () => clearInterval(interval);
  }, [playing, duration]);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const seek = useCallback((time: number) => setCurrentTime(time), []);

  return (
    <div className="relative h-full bg-background-secondary animate-fade-in">
      {showReady && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[4px] bg-background-secondary/80 backdrop-blur-sm text-[11px] text-text-muted border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono">timeline ready</span>
            <span className="text-text-tertiary">·</span>
            <span className="font-mono">{duration.toFixed(1)}s · {clipCount} clips</span>
          </div>
        </div>
      )}

      <div className="w-full h-full flex items-center justify-center">
        {clipCount > 0 && edl ? (
          <SimpleEditorPreview
            edl={edl as any}
            mediaUrls={mediaUrls}
            currentTime={currentTime}
            playing={playing}
            className="w-full h-full"
          />
        ) : showGenerating ? (
          <div className="flex flex-col items-center justify-center w-full h-full gap-6">
            <ProgressPipeline
              steps={GENERATION_PIPELINE}
              activeStep={pipelineStep}
              failedStep={pipelineError !== undefined ? pipelineStep : undefined}
              failReason={pipelineError}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full gap-6">
            <div className="w-16 h-16 rounded-[4px] bg-primary/[0.06] border border-primary/[0.12] flex items-center justify-center">
              <svg className="w-8 h-8 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <TerminalStatus stage={stage} uploadedFiles={uploadedFiles} pipelineStep={pipelineStep} />
          </div>
        )}
      </div>

      {showReady && clipCount > 0 && (
        <PlayerControls
          duration={duration}
          currentTime={currentTime}
          onPlayToggle={togglePlay}
          onSeek={seek}
          playing={playing}
          clipCount={clipCount}
        />
      )}
      {showError && <ErrorState error={error} onRetry={onGenerate} />}
      {showRegenerating && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-background-secondary/80 backdrop-blur-sm text-[11px] text-primary border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="font-mono">updating…</span>
        </div>
      )}
    </div>
  );
}
