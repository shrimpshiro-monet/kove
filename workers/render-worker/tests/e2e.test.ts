import { describe, it, expect, afterAll } from 'vitest'
import { edlToFFmpegCommand } from '../src/edl-to-ffmpeg'
import { execSync } from 'child_process'
import { existsSync, unlinkSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures')
const OUTPUT_PATH = resolve(FIXTURES_DIR, 'output.mp4')

afterAll(() => {
  if (existsSync(OUTPUT_PATH)) {
    unlinkSync(OUTPUT_PATH)
  }
})

describe('E2E Render', () => {
  it('renders a real MP4 from EDL', () => {
    const edl = {
      runtime: {
        timeline: { resolution: { width: 540, height: 960 }, fps: 30, duration: 3 },
        tracks: [{
          id: 'track_v1', type: 'video', name: 'Main',
          clips: [{
            id: 'shot_1',
            source: { clipId: 'test_clip', type: 'video', in: 0, out: 3 },
            timing: { start: 0, duration: 3, speed: 1.0 },
            effects: [{ id: 'fx_1', type: 'vignette', targetStrength: 0.5, params: {} }],
          }],
        }],
      },
    }

    const cmd = edlToFFmpegCommand(
      edl,
      resolve(FIXTURES_DIR, 'test_clip.mp4'),
      OUTPUT_PATH,
    )

    execSync(cmd, { stdio: 'pipe' })

    expect(existsSync(OUTPUT_PATH)).toBe(true)

    const stats = statSync(OUTPUT_PATH)
    expect(stats.size).toBeGreaterThan(0)
  }, 30000)
})
