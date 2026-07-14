import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { edlToFFmpegCommand, type EDLInput } from './edl-to-ffmpeg'

export interface RenderResult {
  success: boolean
  outputPath: string
  duration: number
  error?: string
}

export function renderEDL(
  edl: EDLInput,
  inputPath: string,
  outputPath: string,
): RenderResult {
  if (!existsSync(inputPath)) {
    return { success: false, outputPath, duration: 0, error: `Input file not found: ${inputPath}` }
  }

  try {
    const cmd = edlToFFmpegCommand(edl, inputPath, outputPath)
    const start = Date.now()
    execSync(cmd, { stdio: 'pipe' })
    const duration = Date.now() - start

    if (!existsSync(outputPath)) {
      return { success: false, outputPath, duration, error: 'FFmpeg completed but output file not found' }
    }

    return { success: true, outputPath, duration }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, outputPath, duration: 0, error: message }
  }
}
