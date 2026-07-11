import type { ProjectEDL as MonetEDL } from "@monet/edl";
import type { TranscriptWord } from "@/server/api/transcribe";

/**
 * Stub replacement for the deleted openreel editor-wrapper.
 * Applies word-level transcript edits to MonetEDL by cutting time ranges.
 */
export const openReelWordEditWrapper = {
  applyDeletedWordIndices(
    edl: MonetEDL,
    transcript: TranscriptWord[],
    deletedIndices: number[]
  ): MonetEDL {
    if (!deletedIndices.length) return edl;

    const deletedRanges = deletedIndices
      .map((i) => transcript[i])
      .filter(Boolean)
      .map((w) => ({ start: w.start_ms / 1000, end: w.end_ms / 1000 }))
      .sort((a, b) => a.start - b.start);

    if (!deletedRanges.length) return edl;

    const updated = structuredClone(edl);

    for (const track of updated.timeline.tracks) {
      if (track.type !== "video") continue;

      const newClips = [];
      for (const clip of track.clips) {
        let cursor = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        let remaining = clip.duration;

        for (const range of deletedRanges) {
          const delStart = Math.max(range.start, cursor);
          const delEnd = Math.min(range.end, clipEnd);

          if (delStart < delEnd && delStart < clipEnd && delEnd > cursor) {
            const beforeDur = delStart - cursor;
            if (beforeDur > 0.02) {
              newClips.push({
                ...structuredClone(clip),
                id: `${clip.id}-w${newClips.length}`,
                startTime: cursor,
                duration: beforeDur,
              });
            }
            cursor = delEnd;
            remaining -= beforeDur + (delEnd - delStart);
          }
        }

        if (cursor < clipEnd && clipEnd - cursor > 0.02) {
          newClips.push({
            ...structuredClone(clip),
            id: `${clip.id}-w${newClips.length}`,
            startTime: cursor,
            duration: clipEnd - cursor,
          });
        }
      }

      track.clips = newClips;
    }

    let maxEnd = 0;
    for (const track of updated.timeline.tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    updated.timeline.duration = maxEnd;

    return updated;
  },
};
