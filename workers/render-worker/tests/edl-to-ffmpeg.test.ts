import { describe, it, expect } from 'vitest'
import { edlToFFmpegCommand } from '../src/edl-to-ffmpeg'

describe('edlToFFmpegCommand', () => {
  it('generates FFmpeg command from simple EDL', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video', in: 0, out: 3 },
          timing: { start: 0, duration: 3, speed: 1.0 },
          effects: [{ id: 'fx_1', type: 'glow', targetStrength: 0.6, params: {} }],
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('ffmpeg')
    expect(cmd).toContain('-i /input/clip_a.mp4')
    expect(cmd).toContain('/output/render.mp4')
  })

  it('includes trim filters when source has in/out', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video', in: 1, out: 4 },
          timing: { start: 0, duration: 3, speed: 1.0 },
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('trim=start=1:end=4')
    expect(cmd).toContain('setpts=PTS-STARTPTS')
  })

  it('includes speed filter when speed !== 1.0', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video', in: 0, out: 3 },
          timing: { start: 0, duration: 3, speed: 2.0 },
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('setpts=0.5*PTS')
  })

  it('includes glow effect as gblur', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video' },
          timing: { start: 0, duration: 3, speed: 1.0 },
          effects: [{ id: 'fx_1', type: 'glow', targetStrength: 0.6, params: {} }],
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('gblur=sigma=10')
    expect(cmd).toContain('colorbalance')
  })

  it('includes blur effect as gblur', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video' },
          timing: { start: 0, duration: 3, speed: 1.0 },
          effects: [{ id: 'fx_1', type: 'blur', targetStrength: 0.5, params: {} }],
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('gblur=sigma=10')
  })

  it('includes vignette effect', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video' },
          timing: { start: 0, duration: 3, speed: 1.0 },
          effects: [{ id: 'fx_1', type: 'vignette', targetStrength: 0.5, params: {} }],
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('vignette=')
  })

  it('includes scale filter for output resolution', () => {
    const edl = {
      timeline: { resolution: { width: 540, height: 960 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video' },
          timing: { start: 0, duration: 3, speed: 1.0 },
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('scale=540:960')
  })

  it('sets output fps', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 24, duration: 3 },
      tracks: [{
        id: 'track_v1', type: 'video', name: 'Main',
        clips: [{
          id: 'shot_1',
          source: { clipId: 'clip_a', type: 'video' },
          timing: { start: 0, duration: 3, speed: 1.0 },
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    const cmd = edlToFFmpegCommand(edl, '/input/clip_a.mp4', '/output/render.mp4')
    expect(cmd).toContain('-r 24')
  })

  it('throws when no video track exists', () => {
    const edl = {
      timeline: { resolution: { width: 1080, height: 1920 }, fps: 30, duration: 3 },
      tracks: [{
        id: 'track_a1', type: 'audio', name: 'Audio',
        clips: [{
          id: 'audio_1',
          source: { type: 'video' },
          timing: { start: 0, duration: 3, speed: 1.0 },
        }],
      }],
      colorScience: { workingSpace: 'sRGB', inputTransform: { source: 'srgb', cameraProfile: 'sRGB' }, outputTransform: { target: 'sRGB', toneMapping: 'none' } },
    }

    expect(() => edlToFFmpegCommand(edl, '/input/audio.mp3', '/output/render.mp4')).toThrow('No video track')
  })
})
