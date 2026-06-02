import type { MonetEDL } from "@/server/types/edl";
import type { TranscriptWord } from "@/server/api/transcribe";
import {
  shouldUseOpenReelEditing,
  stabilizeMonetEDLWithOpenReel,
} from "@/lib/openreel/monet-bridge";

export class OpenReelWordEditWrapper {
  applyDeletedWordIndices(
    baselineEDL: MonetEDL,
    words: TranscriptWord[],
    deletedWordIndices: Set<number>
  ): MonetEDL {
    if (deletedWordIndices.size === 0) {
      return baselineEDL;
    }

    const cuts = Array.from(deletedWordIndices)
      .map((index) => words[index])
      .filter((word): word is TranscriptWord => !!word)
      .sort((a, b) => b.start_ms - a.start_ms);

    let result = baselineEDL;
    for (const cut of cuts) {
      result = this.cutRange(result, cut.start_ms, cut.end_ms);
    }

    return this.finalize(result);
  }

  private cutRange(edl: MonetEDL, startMs: number, endMs: number): MonetEDL {
    const startSec = startMs / 1000;
    const endSec = endMs / 1000;
    const removedDuration = Math.max(0, endSec - startSec);

    if (removedDuration === 0) {
      return edl;
    }

    const updatedShots = edl.shots
      .map((shot) => {
        const shotStart = shot.timing.startTime;
        const shotEnd = shotStart + shot.timing.duration;

        if (shotEnd <= startSec) {
          return shot;
        }

        if (shotStart >= endSec) {
          return {
            ...shot,
            timing: {
              ...shot.timing,
              startTime: shotStart - removedDuration,
            },
          };
        }

        const overlapStart = Math.max(shotStart, startSec);
        const overlapEnd = Math.min(shotEnd, endSec);
        const overlapDuration = overlapEnd - overlapStart;
        const newDuration = shot.timing.duration - overlapDuration;

        if (newDuration <= 0.05) {
          return null;
        }

        const newInPoint =
          overlapStart > shotStart
            ? shot.source.inPoint + (overlapStart - shotStart)
            : shot.source.inPoint;

        return {
          ...shot,
          source: {
            ...shot.source,
            inPoint: newInPoint,
            outPoint: newInPoint + newDuration,
          },
          timing: {
            ...shot.timing,
            startTime: shotStart < startSec ? shotStart : startSec,
            duration: newDuration,
          },
        };
      })
      .filter(Boolean) as MonetEDL["shots"];

    return {
      ...edl,
      shots: updatedShots,
      timeline: {
        ...edl.timeline,
        duration: Math.max(0, edl.timeline.duration - removedDuration),
      },
    };
  }

  private finalize(edl: MonetEDL): MonetEDL {
    if (!shouldUseOpenReelEditing()) {
      return edl;
    }
    return stabilizeMonetEDLWithOpenReel(edl);
  }
}

export const openReelWordEditWrapper = new OpenReelWordEditWrapper();