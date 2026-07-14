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
  HTMLVideoElement.prototype.load = vi.fn() as any
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined) as any
  HTMLVideoElement.prototype.pause = vi.fn() as any
  HTMLAudioElement.prototype.load = vi.fn() as any
  HTMLAudioElement.prototype.pause = vi.fn() as any
})

afterAll(() => {
  vi.restoreAllMocks()
})

import { TimelinePlayer } from '../apps/web/src/lib/timeline-player'
import { MediaLoader } from '../apps/web/src/lib/media-loader'

describe('TimelinePlayer', () => {
  let loader: MediaLoader
  let player: TimelinePlayer
  let stateCallback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    loader = new MediaLoader()
    stateCallback = vi.fn()
    player = new TimelinePlayer(loader, stateCallback)
  })

  describe('construction', () => {
    it('starts with default state', () => {
      const state = player.getState()
      expect(state.currentTime).toBe(0)
      expect(state.duration).toBe(0)
      expect(state.isPlaying).toBe(false)
      expect(state.fps).toBe(30)
    })
  })

  describe('getState', () => {
    it('returns a copy of state', () => {
      const s1 = player.getState()
      const s2 = player.getState()
      expect(s1).toEqual(s2)
      expect(s1).not.toBe(s2)
    })
  })

  describe('load', () => {
    it('sets duration from loader after loading', async () => {
      vi.spyOn(loader, 'loadVideo').mockResolvedValue(undefined)
      vi.spyOn(loader, 'loadAudio').mockResolvedValue(undefined)
      Object.defineProperty(loader.video, 'duration', { value: 25.0, writable: true })

      await player.load('video.mp4', 'audio.mp3')

      expect(loader.loadVideo).toHaveBeenCalledWith('video.mp4')
      expect(loader.loadAudio).toHaveBeenCalledWith('audio.mp3')
      expect(stateCallback).toHaveBeenCalled()
      const lastCall = stateCallback.mock.calls[stateCallback.mock.calls.length - 1][0]
      expect(lastCall.duration).toBe(25.0)
    })
  })

  describe('play', () => {
    it('calls loader play and emits state', () => {
      vi.spyOn(loader, 'play').mockImplementation(() => {})

      player.play()

      expect(loader.play).toHaveBeenCalled()
      expect(stateCallback).toHaveBeenCalled()
      const lastCall = stateCallback.mock.calls[stateCallback.mock.calls.length - 1][0]
      expect(lastCall.isPlaying).toBe(true)
    })
  })

  describe('pause', () => {
    it('calls loader pause and emits state', () => {
      vi.spyOn(loader, 'pause').mockImplementation(() => {})

      player.pause()

      expect(loader.pause).toHaveBeenCalled()
      const lastCall = stateCallback.mock.calls[stateCallback.mock.calls.length - 1][0]
      expect(lastCall.isPlaying).toBe(false)
    })
  })

  describe('seekTo', () => {
    it('delegates to loader and emits state', async () => {
      vi.spyOn(loader, 'seekTo').mockResolvedValue(undefined)

      await player.seekTo(10.5)

      expect(loader.seekTo).toHaveBeenCalledWith(10.5)
      const lastCall = stateCallback.mock.calls[stateCallback.mock.calls.length - 1][0]
      expect(lastCall.currentTime).toBe(10.5)
    })
  })

  describe('setFps', () => {
    it('updates fps in state', () => {
      player.setFps(60)
      expect(player.getState().fps).toBe(60)
    })
  })
})
