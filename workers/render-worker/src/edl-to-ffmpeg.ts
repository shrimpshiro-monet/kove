export interface EDLInput {
  runtime: {
    timeline: {
      resolution: { width: number; height: number }
      fps: number
      duration: number
    }
    tracks: Array<{
      id: string
      type: string
      name: string
      clips: Array<{
        id: string
        source: { clipId?: string; type: string; in?: number; out?: number }
        timing: { start: number; duration: number; speed: number }
        effects?: Array<{ id: string; type: string; targetStrength: number; params: Record<string, unknown> }>
      }>
    }>
  }
}

function effectToFilter(effect: { type: string; targetStrength: number }): string | null {
  switch (effect.type) {
    case 'glow':
      return `gblur=sigma=${Math.round(effect.targetStrength * 20)}`
    case 'blur':
      return `boxblur=${Math.round(effect.targetStrength * 10)}`
    case 'vignette':
      return `vignette=PI/${4 - effect.targetStrength * 2}`
    default:
      return null
  }
}

export function edlToFFmpegCommand(edl: EDLInput, inputPath: string, outputPath: string): string {
  const { timeline, tracks } = edl.runtime
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
