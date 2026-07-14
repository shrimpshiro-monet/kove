import type { EDL } from './schema'

export function validateEDL(edl: EDL): string[] {
  const errors: string[] = []

  const trackDuration = edl.runtime.tracks.reduce((max, track) => {
    const trackEnd = track.clips.reduce((m, clip) => Math.max(m, clip.timing.start + clip.timing.duration), 0)
    return Math.max(max, trackEnd)
  }, 0)
  if (edl.runtime.tracks.length > 0 && Math.abs(trackDuration - edl.duration) > 0.1) {
    errors.push(`Track duration ${trackDuration} does not match EDL duration ${edl.duration}`)
  }

  for (const track of edl.runtime.tracks) {
    const sorted = [...track.clips].sort((a, b) => a.timing.start - b.timing.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].timing.start < sorted[i - 1].timing.start + sorted[i - 1].timing.duration) {
        errors.push(`Clips ${sorted[i - 1].id} and ${sorted[i].id} overlap`)
      }
    }
  }

  for (const track of edl.runtime.tracks) {
    for (const clip of track.clips) {
      if (clip.timing.duration > 30) errors.push(`Clip ${clip.id} exceeds 30s`)
    }
  }

  const momentIds = new Set(edl.creative.moments.map(m => m.id))
  for (const track of edl.runtime.tracks) {
    for (const clip of track.clips) {
      if (clip.momentId && !momentIds.has(clip.momentId)) {
        errors.push(`Clip ${clip.id} references unknown moment ${clip.momentId}`)
      }
    }
  }

  return errors
}
