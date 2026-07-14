import type { RuntimeLayer } from '@monet/edl-v2'
import { effectToFilter } from './effects'

export function edlToFFmpegCommand(edl: RuntimeLayer, inputPath: string, outputPath: string): string {
  const { timeline, tracks } = edl
  const videoTrack = tracks.find((t) => t.type === 'video')
  if (!videoTrack) throw new Error('No video track')

  const parts = ['ffmpeg -y']
  parts.push(`-i ${inputPath}`)

  const filters: string[] = []

  for (const clip of videoTrack.clips) {
    if (clip.source.in !== undefined && clip.source.out !== undefined) {
      filters.push(`trim=start=${clip.source.in}:end=${clip.source.out},setpts=PTS-STARTPTS`)
    }

    if (clip.timing.speed !== 1.0) {
      filters.push(`setpts=${1 / clip.timing.speed}*PTS`)
    }

    if (clip.effects) {
      for (const effect of clip.effects) {
        const filter = effectToFilter(effect)
        if (filter) filters.push(filter)
      }
    }
  }

  filters.push(`scale=${timeline.resolution.width}:${timeline.resolution.height}`)

  if (filters.length > 0) {
    parts.push(`-vf "${filters.join(',')}"`)
  }

  parts.push(`-r ${timeline.fps}`)
  parts.push(outputPath)

  return parts.join(' ')
}
