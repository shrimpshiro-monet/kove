import { ProjectEDL as MonetEDL, Track, Clip } from "./schemas";

export function validateEDL(edl: unknown): MonetEDL {
  if (!edl || typeof edl !== "object") {
    throw new Error("Invalid EDL: not an object");
  }

  const parsed = edl as MonetEDL;

  if (parsed.version !== 1) {
    throw new Error("Unsupported EDL version");
  }

  if (!parsed.timeline?.tracks?.length) {
    throw new Error("EDL must contain tracks");
  }

  parsed.timeline.tracks.forEach(validateTrack);

  return parsed;
}

function validateTrack(track: Track) {
  if (!track.id) throw new Error("Track missing id");

  if (!Array.isArray(track.clips)) {
    throw new Error(`Track ${track.id} missing clips`);
  }

  track.clips.forEach((clip) => validateClip(track.id, clip));
}

function validateClip(trackId: string, clip: Clip) {
  if (!clip.id) throw new Error(`Clip missing id in track ${trackId}`);

  if (clip.duration <= 0) {
    throw new Error(`Clip ${clip.id} has invalid duration`);
  }

  if (clip.inPoint < 0 || clip.outPoint <= clip.inPoint) {
    throw new Error(`Clip ${clip.id} has invalid in/out points`);
  }

  if (!clip.transforms) {
    throw new Error(`Clip ${clip.id} missing transforms`);
  }
}