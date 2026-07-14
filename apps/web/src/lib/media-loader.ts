export class MediaLoader {
  video: HTMLVideoElement
  audioElement: HTMLAudioElement
  audioContext: AudioContext
  audioSource: MediaElementAudioSourceNode | null = null

  constructor() {
    this.video = document.createElement('video')
    this.video.crossOrigin = 'anonymous'
    this.video.preload = 'auto'
    this.audioElement = document.createElement('audio')
    this.audioElement.crossOrigin = 'anonymous'
    this.audioElement.preload = 'auto'
    this.audioContext = new AudioContext()
  }

  async loadVideo(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.video.onloadeddata = () => resolve()
      this.video.onerror = () => reject(new Error('Failed to load video'))
      this.video.src = url
      this.video.load()
    })
  }

  async loadAudio(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.audioElement.onloadeddata = () => {
        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement)
        this.audioSource.connect(this.audioContext.destination)
        resolve()
      }
      this.audioElement.onerror = () => reject(new Error('Failed to load audio'))
      this.audioElement.src = url
      this.audioElement.load()
    })
  }

  async seekTo(time: number): Promise<void> {
    return new Promise((resolve) => {
      this.video.onseeked = () => resolve()
      this.video.currentTime = time
    })
  }

  get currentTime(): number {
    return this.video.currentTime
  }

  get duration(): number {
    return this.video.duration
  }

  play(): void {
    this.video.play()
    this.audioContext?.resume()
  }

  pause(): void {
    this.video.pause()
    this.audioContext?.suspend()
  }

  dispose(): void {
    this.video.pause()
    this.video.src = ''
    this.audioElement.pause()
    this.audioElement.src = ''
    if (this.audioSource) {
      this.audioSource.disconnect()
      this.audioSource = null
    }
  }
}
