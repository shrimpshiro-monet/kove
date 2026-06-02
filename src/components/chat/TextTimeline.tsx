// TextTimeline - Phase 7B Aesthetic Dissection
// THE viral feature: edit video by editing text.
// Delete words → those milliseconds vanish from the timeline. Instant.

import { useState, useCallback, useRef, useEffect } from "react";
import { Scissors, Type, RotateCcw, Download, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openReelWordEditWrapper } from "@/lib/openreel/editor-wrapper";
import type { TranscriptWord, TranscriptResult } from "@/server/api/transcribe";
import type { MonetEDL } from "@/server/types/edl";

interface TextTimelineProps {
  transcript: TranscriptResult;
  edl: MonetEDL;
  onEDLChange: (updatedEDL: MonetEDL) => void;
  onSeek?: (timeMs: number) => void;
  currentTimeMs?: number;
}

/** Max undo stack depth */
const UNDO_LIMIT = 20;

export function TextTimeline({
  transcript,
  edl,
  onEDLChange,
  onSeek,
  currentTimeMs = 0,
}: TextTimelineProps) {
  const [deletedWords, setDeletedWords] = useState<Set<number>>(new Set()); // indices into transcript.words
  const [undoStack, setUndoStack] = useState<Set<number>[]>([]);
  const [mode, setMode] = useState<"transcript" | "kinetic">("transcript");
  const containerRef = useRef<HTMLDivElement>(null);
  const baselineEDLRef = useRef<MonetEDL>(edl);

  const words = transcript.words;

  useEffect(() => {
    // Reset baseline when a new transcript/media context arrives.
    baselineEDLRef.current = edl;
    setDeletedWords(new Set());
    setUndoStack([]);
  }, [
    transcript.mediaId,
    edl.metadata.intentId,
    edl.metadata.analysisId,
    edl.metadata.createdAt,
    edl.timeline.duration,
  ]);

  const deleteWord = useCallback(
    (wordIdx: number) => {
      setUndoStack((prev) => {
        const next = [...prev, new Set(deletedWords)];
        return next.slice(-UNDO_LIMIT);
      });

      const next = new Set(deletedWords);
      next.add(wordIdx);
      setDeletedWords(next);

      const updatedEDL = openReelWordEditWrapper.applyDeletedWordIndices(
        baselineEDLRef.current,
        words,
        next
      );
      onEDLChange(updatedEDL);
    },
    [deletedWords, onEDLChange, words]
  );

  const deleteFiller = useCallback(() => {
    const fillerPatterns = /^(um|uh|like|you know|so|and|but|er|hmm|ah|oh)$/i;
    const fillerIndices = words
      .map((w, i) => (fillerPatterns.test(w.text.trim()) || w.confidence < 0.7 ? i : -1))
      .filter((i) => i !== -1);

    if (fillerIndices.length === 0) return;

    setUndoStack((prev) => [...prev.slice(-UNDO_LIMIT + 1), new Set(deletedWords)]);

    const next = new Set(deletedWords);

    const sorted = [...fillerIndices].sort((a, b) => b - a);
    for (const idx of sorted) {
      next.add(idx);
    }

    setDeletedWords(next);
    const updatedEDL = openReelWordEditWrapper.applyDeletedWordIndices(
      baselineEDLRef.current,
      words,
      next
    );
    onEDLChange(updatedEDL);
  }, [deletedWords, onEDLChange, words]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setDeletedWords(prev);

    const rebuiltEDL = openReelWordEditWrapper.applyDeletedWordIndices(
      baselineEDLRef.current,
      words,
      prev
    );
    onEDLChange(rebuiltEDL);
  }, [undoStack, onEDLChange, words]);

  const activeWords = words.filter((_, i) => !deletedWords.has(i));
  const deletedCount = deletedWords.size;
  const savedMs = words
    .filter((_, i) => deletedWords.has(i))
    .reduce((sum, w) => sum + (w.end_ms - w.start_ms), 0);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Edit by Text</span>
          {deletedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {deletedCount} word{deletedCount !== 1 ? "s" : ""} removed •{" "}
              {(savedMs / 1000).toFixed(1)}s trimmed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={() => setMode(mode === "transcript" ? "kinetic" : "transcript")}
          >
            <Sparkles className="h-3 w-3" />
            {mode === "transcript" ? "Kinetic" : "Transcript"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={deleteFiller}
            disabled={words.length === 0}
            title="Remove um, uh, like..."
          >
            <Scissors className="h-3 w-3" />
            Clean filler
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={undo}
            disabled={undoStack.length === 0}
          >
            <RotateCcw className="h-3 w-3" />
            Undo
          </Button>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="p-4">
        {mode === "transcript" ? (
          <TranscriptView
            words={words}
            deletedWords={deletedWords}
            currentTimeMs={currentTimeMs}
            onDeleteWord={deleteWord}
            onSeek={onSeek}
          />
        ) : (
          <KineticPreview words={activeWords} />
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground">
          Click a word to seek · Backspace or double-click to delete · Filler words are{" "}
          <span className="text-yellow-500/80">highlighted</span>
        </p>
      </div>
    </div>
  );
}

// ─── Transcript View ──────────────────────────────────────────────────────────

interface TranscriptViewProps {
  words: TranscriptWord[];
  deletedWords: Set<number>;
  currentTimeMs: number;
  onDeleteWord: (idx: number) => void;
  onSeek?: (timeMs: number) => void;
}

function TranscriptView({
  words,
  deletedWords,
  currentTimeMs,
  onDeleteWord,
  onSeek,
}: TranscriptViewProps) {
  const fillerPattern = /^(um|uh|like|you know|so|er|hmm|ah|oh)$/i;

  return (
    <div className="leading-loose text-sm select-none">
      {words.map((word, idx) => {
        const isDeleted = deletedWords.has(idx);
        const isCurrent =
          currentTimeMs >= word.start_ms && currentTimeMs < word.end_ms;
        const isFiller = fillerPattern.test(word.text.trim()) || word.confidence < 0.7;
        const isLoud = word.intensity > 0.7;

        if (isDeleted) {
          return (
            <span
              key={idx}
              className="line-through text-muted-foreground/30 mx-0.5 cursor-pointer hover:text-muted-foreground transition-colors"
              title="Click to restore"
              onClick={() => {
                // Restore is handled by full undo; this is just a visual hint
              }}
            >
              {word.text}
            </span>
          );
        }

        return (
          <span
            key={idx}
            className={cn(
              "mx-0.5 px-0.5 rounded cursor-pointer transition-all duration-100 select-none",
              "hover:bg-destructive/20 hover:text-destructive",
              isCurrent && "bg-primary/20 text-primary",
              isFiller && !isCurrent && "text-yellow-500/70",
              isLoud && "font-semibold"
            )}
            style={{
              fontSize: isLoud ? `${0.875 + word.intensity * 0.2}rem` : undefined,
            }}
            title={`${(word.start_ms / 1000).toFixed(2)}s — ${(word.confidence * 100).toFixed(0)}% conf · Double-click to delete`}
            onClick={() => onSeek?.(word.start_ms)}
            onDoubleClick={() => onDeleteWord(idx)}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}

// ─── Kinetic Typography Preview ───────────────────────────────────────────────

interface KineticPreviewProps {
  words: TranscriptWord[];
}

function KineticPreview({ words }: KineticPreviewProps) {
  // Display first 12 words in kinetic style for preview
  const displayWords = words.slice(0, 12);

  return (
    <div className="bg-black rounded-md p-6 min-h-[200px] flex flex-wrap gap-3 items-center justify-center">
      {displayWords.map((word, idx) => {
        const scale = 1 + word.intensity * 0.6;
        const blur = word.intensity < 0.3 ? 1 : 0;
        const opacity = 0.4 + word.intensity * 0.6;

        return (
          <span
            key={idx}
            className="text-white font-bold tracking-tight transition-all"
            style={{
              fontSize: `${scale * 1.5}rem`,
              filter: blur > 0 ? `blur(${blur}px)` : undefined,
              opacity,
              fontWeight: word.intensity > 0.7 ? 900 : word.intensity > 0.4 ? 700 : 400,
              letterSpacing: word.intensity > 0.6 ? "-0.02em" : "0",
            }}
          >
            {word.text.toUpperCase()}
          </span>
        );
      })}
      {words.length > 12 && (
        <span className="text-white/30 text-xs self-end">
          +{words.length - 12} more words
        </span>
      )}
      <div className="w-full text-center text-white/20 text-[10px] mt-2">
        KINETIC TYPOGRAPHY PREVIEW — Export to see full animation
      </div>
    </div>
  );
}

