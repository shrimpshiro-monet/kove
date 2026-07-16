import { useState, useRef, useCallback, useEffect } from "react"
import { analyzeReference, getAnalyzeReferenceStatus } from "../../lib/api-client"
import { ReportPanel } from "./ReportPanel"
import type { AnalyzeReferenceStatus, ReferenceStyleProfile } from "./types"

interface ReferencePreviewProps {
  onAnalysisComplete?: (profile: ReferenceStyleProfile) => void
}

type FlowState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "analyzing"; jobId: string }
  | { phase: "generating"; status: AnalyzeReferenceStatus }
  | { phase: "complete"; status: AnalyzeReferenceStatus }
  | { phase: "error"; message: string }

export function ReferencePreview({ onAnalysisComplete }: ReferencePreviewProps) {
  const [flow, setFlow] = useState<FlowState>({ phase: "idle" })
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const profile = flow.phase === "complete" && flow.status.result?.report
    ? flow.status.result.report
    : null

  // Polling
  useEffect(() => {
    if (flow.phase !== "analyzing") return
    const jobId = flow.jobId
    let cancelled = false

    const poll = async () => {
      try {
        const status = await getAnalyzeReferenceStatus(jobId)
        if (cancelled) return

        if (status.status === "complete" || status.status === "failed") {
          setFlow({ phase: "complete", status })
          if (status.status === "complete" && status.result?.report) {
            onAnalysisComplete?.(status.result.report)
          }
          return
        } else if (status.status === "generating_overlay") {
          setFlow({ phase: "generating", status })
          setTimeout(poll, 800)
          return
        }

        setTimeout(poll, 800)
      } catch (err) {
        if (cancelled) return
        setFlow({ phase: "error", message: err instanceof Error ? err.message : "Polling failed" })
      }
    }

    poll()
    return () => { cancelled = true }
  }, [flow.phase === "analyzing" ? flow.jobId : null])

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setFlow({ phase: "idle" })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleAnalyze = useCallback(async () => {
    if (!file) return
    setFlow({ phase: "uploading" })
    try {
      const { jobId } = await analyzeReference(file)
      setFlow({ phase: "analyzing", jobId })
    } catch (err) {
      setFlow({ phase: "error", message: err instanceof Error ? err.message : "Upload failed" })
    }
  }, [file])

  const handleRetry = useCallback(() => {
    setFile(null)
    setFlow({ phase: "idle" })
  }, [])

  const inputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }, [handleFile])

  const progress =
    flow.phase === "analyzing"
      ? undefined
      : flow.phase === "generating"
        ? flow.status.progress
        : flow.phase === "complete"
          ? flow.status.progress
          : 0

  const statusMessage =
    flow.phase === "analyzing"
      ? "Analyzing reference..."
      : flow.phase === "generating"
        ? `Generating overlay... ${flow.status.progress}%`
        : flow.phase === "uploading"
          ? "Uploading..."
          : flow.phase === "complete"
            ? flow.status.message
            : flow.phase === "error"
              ? flow.message
              : null

  const isProcessing = flow.phase === "uploading" || flow.phase === "analyzing"

  return (
    <div className="flex flex-col gap-4 rounded border border-border bg-background p-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Reference Analysis</h2>
        {profile && (
          <span className="text-[10px] font-mono text-text-muted">
            {profile.duration.toFixed(1)}s · {profile.total_cuts} cuts · {profile.bpm} BPM
          </span>
        )}
      </div>

      {/* Upload zone */}
      {!file && (
        <div
          className={`flex flex-col items-center justify-center gap-3 rounded border-2 border-dashed p-8 transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-border-hover bg-background-secondary"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
        >
          <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-xs text-text-muted font-mono">
            Drag & drop reference video, or click to browse
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={inputChange}
          />
        </div>
      )}

      {/* File selected */}
      {file && !isProcessing && flow.phase !== "complete" && (
        <div className="flex items-center gap-3 rounded border border-border bg-background-secondary p-3">
          <svg className="w-5 h-5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text-primary truncate font-mono">{file.name}</div>
            <div className="text-[10px] text-text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
          </div>
          <button
            onClick={() => { setFile(null); setFlow({ phase: "idle" }) }}
            className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      {/* Analyze button */}
      {file && !isProcessing && flow.phase !== "complete" && (
        <button
          onClick={handleAnalyze}
          className="w-full rounded bg-primary px-4 py-2 text-[11px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity font-mono"
        >
          Analyze Reference
        </button>
      )}

      {/* Progress bar */}
      {isProcessing && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>{statusMessage}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-background-tertiary overflow-hidden">
            <div className="h-full rounded-full bg-primary animate-shimmer" />
          </div>
        </div>
      )}

      {/* Generating overlay */}
      {flow.phase === "generating" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-text-muted font-mono text-[11px]">
            <div className="w-3 h-3 rounded-full bg-status-warning animate-pulse" />
            <span>Generating overlay... {flow.status.progress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-background-tertiary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${flow.status.progress}%` }}
            />
          </div>
          <span className="text-right text-[10px] text-text-muted font-mono">{flow.status.progress}%</span>
        </div>
      )}

      {/* Error state */}
      {flow.phase === "error" && (
        <div className="flex flex-col items-center gap-3 rounded border border-destructive/30 bg-destructive/5 p-4 text-center">
          <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-xs text-destructive font-mono">{"> "}{flow.message}</span>
          <button
            onClick={handleRetry}
            className="text-[10px] text-primary hover:underline font-mono"
          >
            {"try again"}
          </button>
        </div>
      )}

      {/* Results */}
      {flow.phase === "complete" && flow.status.status === "complete" && profile && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Video */}
          <div className="flex-1 lg:w-[60%]">
            <div className="rounded border border-border bg-black overflow-hidden">
              {flow.status.result?.overlayVideoUrl ? (
                <video
                  src={flow.status.result.overlayVideoUrl}
                  className="w-full aspect-video object-contain"
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <div className="flex items-center justify-center aspect-video text-text-muted text-xs font-mono">
                  No overlay video available
                </div>
              )}
            </div>
          </div>
          {/* Report */}
          <div className="lg:w-[40%] max-h-[400px] overflow-y-auto">
            <ReportPanel profile={profile} />
          </div>
        </div>
      )}
    </div>
  )
}
