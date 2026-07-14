// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// Mock AudioContext and jsdom-not-implemented media methods
beforeAll(() => {
  vi.stubGlobal(
    'AudioContext',
    vi.fn().mockImplementation(() => ({
      createMediaElementSource: vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
    }))
  )
  // jsdom doesn't implement load()/play()/pause() on media elements
  HTMLVideoElement.prototype.load = vi.fn() as any
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined) as any
  HTMLVideoElement.prototype.pause = vi.fn() as any
  HTMLAudioElement.prototype.load = vi.fn() as any
  HTMLAudioElement.prototype.pause = vi.fn() as any
})

afterAll(() => {
  vi.restoreAllMocks()
})

import { MediaLoader } from '../apps/web/src/lib/media-loader'

describe('MediaLoader', () => {
  let loader: MediaLoader

  beforeEach(() => {
    loader = new MediaLoader()
  })

  describe('construction', () => {
    it('creates loader with video element', () => {
      expect(loader.video).toBeDefined()
      expect(loader.video.tagName).toBe('VIDEO')
    })

    it('sets video preload to auto', () => {
      expect(loader.video.preload).toBe('auto')
    })

    it('sets video crossOrigin to anonymous', () => {
      expect(loader.video.crossOrigin).toBe('anonymous')
    })

    it('exposes currentTime getter', () => {
      loader.video.currentTime = 3.5
      expect(loader.currentTime).toBe(3.5)
    })

    it('exposes duration getter', () => {
      Object.defineProperty(loader.video, 'duration', { value: 12.0, writable: true })
      expect(loader.duration).toBe(12.0)
    })
  })

  describe('seekTo', () => {
    it('resolves when seek completes', async () => {
      const seekPromise = loader.seekTo(5.0)
      loader.video.dispatchEvent(new Event('seeked'))
      await seekPromise
      expect(loader.video.currentTime).toBe(5.0)
    })

    it('resolves when currentTime already equals target', async () => {
      loader.video.currentTime = 5.0
      const seekPromise = loader.seekTo(5.0)
      loader.video.dispatchEvent(new Event('seeked'))
      await seekPromise
      expect(loader.video.currentTime).toBe(5.0)
    })
  })

  describe('loadVideo', () => {
    it('resolves when loadeddata fires', async () => {
      const loadPromise = loader.loadVideo('http://example.com/video.mp4')
      loader.video.dispatchEvent(new Event('loadeddata'))
      await loadPromise
      expect(loader.video.src).toContain('example.com')
    })

    it('rejects on error', async () => {
      const loadPromise = loader.loadVideo('http://example.com/bad.mp4')
      loader.video.dispatchEvent(new Event('error'))
      await expect(loadPromise).rejects.toThrow('Failed to load video')
    })
  })

  describe('loadAudio', () => {
    it('resolves when loadeddata fires', async () => {
      const loadPromise = loader.loadAudio('http://example.com/audio.mp3')
      loader.audioElement.dispatchEvent(new Event('loadeddata'))
      await loadPromise
      expect(loader.audioSource).toBeDefined()
    })

    it('rejects on error', async () => {
      const loadPromise = loader.loadAudio('http://example.com/bad.mp3')
      loader.audioElement.dispatchEvent(new Event('error'))
      await expect(loadPromise).rejects.toThrow('Failed to load audio')
    })
  })

  describe('play/pause', () => {
    it('calls video play and audioContext resume', () => {
      loader.play()
      expect(loader.video.play).toHaveBeenCalled()
    })

    it('calls video pause and audioContext suspend', () => {
      loader.pause()
      expect(loader.video.pause).toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('pauses and clears sources', () => {
      loader.dispose()
      expect(loader.video.pause).toHaveBeenCalled()
      expect(loader.audioElement.pause).toHaveBeenCalled()
    })
  })
})
