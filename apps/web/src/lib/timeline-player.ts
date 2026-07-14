import { MediaLoader } from './media-loader'

export interface TimelineState {
  currentTime: number
  duration: number
  isPlaying: boolean
  fps: number
}

export class TimelinePlayer {
  private loader: MediaLoader
  private state: TimelineState
  private animationFrame: number | null = null
  private onStateChange: (state: TimelineState) => void

  constructor(loader: MediaLoader, onStateChange: (state: TimelineState) => void) {
    this.loader = loader
    this.onStateChange = onStateChange
    this.state = {
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      fps: 30,
    }
  }

  async load(videoUrl: string, audioUrl: string): Promise<void> {
    await this.loader.loadVideo(videoUrl)
    await this.loader.loadAudio(audioUrl)
    this.state.duration = this.loader.duration
    this.emitState()
  }

  play(): void {
    this.state.isPlaying = true
    this.loader.play()
    this.tick()
    this.emitState()
  }

  pause(): void {
    this.state.isPlaying = false
    this.loader.pause()
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
    this.emitState()
  }

  async seekTo(time: number): Promise<void> {
    await this.loader.seekTo(time)
    this.state.currentTime = time
    this.emitState()
  }

  setFps(fps: number): void {
    this.state.fps = fps
  }

  private tick(): void {
    if (!this.state.isPlaying) return

    this.state.currentTime = this.loader.currentTime
    this.emitState()

    this.animationFrame = requestAnimationFrame(() => this.tick())
  }

  private emitState(): void {
    this.onStateChange({ ...this.state })
  }

  getState(): TimelineState {
    return { ...this.state }
  }
}
