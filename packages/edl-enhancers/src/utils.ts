import { ProjectEDL as MonetEDL, Clip } from "@monet/edl/src/schemas";

export function mapClips(edl: MonetEDL): Map<string, Clip> {
  const map = new Map<string, Clip>();

  for (const track of edl.timeline.tracks) {
    for (const clip of track.clips) {
      map.set(clip.id, clip);
    }
  }

  return map;
}

export function safePushEffect(
  clip: Clip,
  effect: Clip["effects"][number]
) {
  if (!clip.effects) clip.effects = [];

  clip.effects.push(effect);
}