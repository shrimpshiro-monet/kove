import { useRef, useEffect, useState, useCallback } from 'react'
import { MediaLoader } from '../lib/media-loader'
import { TimelinePlayer, type TimelineState } from '../lib/timeline-player'
import { EffectsEngine } from '../lib/effects-engine'

interface PreviewCanvasProps {
  edl: unknown
  videoUrl?: string
  audioUrl?: string
  width?: number
  height?: number
  onStateChange?: (state: TimelineState) => void
  seekTime?: number | null
}

export function PreviewCanvas({
  edl,
  videoUrl,
  audioUrl,
  width = 1920,
  height = 1080,
  onStateChange,
  seekTime,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loaderRef = useRef<MediaLoader | null>(null)
  const playerRef = useRef<TimelinePlayer | null>(null)
  const engineRef = useRef<EffectsEngine | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const [state, setState] = useState<TimelineState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    fps: 30,
  })

  useEffect(() => {
    onStateChange?.(state)
  }, [state, onStateChange])

  useEffect(() => {
    if (seekTime != null && playerRef.current) {
      playerRef.current.seekTo(seekTime)
    }
  }, [seekTime])

  useEffect(() => {
    if (!videoUrl || !audioUrl) return

    const loader = new MediaLoader()
    const player = new TimelinePlayer(loader, setState)
    loaderRef.current = loader
    playerRef.current = player

    player.load(videoUrl, audioUrl)

    return () => {
      player.pause()
      loader.dispose()
      loaderRef.current = null
      playerRef.current = null
    }
  }, [videoUrl, audioUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    engineRef.current = new EffectsEngine(ctx, width, height)

    const renderLoop = () => {
      const loader = loaderRef.current
      const engine = engineRef.current
      if (!loader || !engine) return

      const video = loader.video
      if (!video || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(renderLoop)
        return
      }

      engine.resetFilter()
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(video, 0, 0, width, height)

      const edlData = edl as Record<string, unknown> | null
      if (edlData && typeof edlData === 'object') {
        const runtime = edlData.runtime as Record<string, unknown> | undefined
        const tracks = runtime?.tracks as Array<Record<string, unknown>> | undefined
        if (tracks) {
          for (const track of tracks) {
            const clips = track.clips as Array<Record<string, unknown>> | undefined
            if (!clips) continue
            for (const clip of clips) {
              const effects = clip.effects as Array<{ type: string; params: Record<string, unknown> }> | undefined
              if (effects) {
                engine.applyEffects(effects, loader.currentTime)
              }
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop)
    }

    animFrameRef.current = requestAnimationFrame(renderLoop)

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }
  }, [edl, width, height])

  const handlePlay = useCallback(() => {
    playerRef.current?.play()
  }, [])

  const handlePause = useCallback(() => {
    playerRef.current?.pause()
  }, [])

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid="preview-canvas"
        width={width}
        height={height}
        style={{ width: '100%', maxWidth: 640, background: '#000' }}
      />
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={handlePlay} disabled={state.isPlaying}>Play</button>
        <button onClick={handlePause} disabled={!state.isPlaying}>Pause</button>
        <span>{state.currentTime.toFixed(1)}s / {state.duration.toFixed(1)}s</span>
      </div>
    </div>
  )
}
