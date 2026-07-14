export interface ShakeParams {
  frequency: number
  amplitude: number
}

export interface RGBSplitParams {
  offset: number
  angle: number
}

export interface GlitchParams {
  intensity: number
  blockWidth: number
}

export function shake(params: ShakeParams): string {
  const w = 1920 - params.amplitude * 2
  const h = 1080 - params.amplitude * 2
  return `crop=${w}:${h}:${params.amplitude}:${params.amplitude},scale=1920:1080`
}

export function rgbSplit(params: RGBSplitParams): string {
  return `rgbashift=rh=${params.offset}:bh=-${params.offset}`
}

export function glitch(params: GlitchParams): string {
  return `rgbashift=rh=${params.intensity * 2}:bh=-${params.intensity * 2},noise=alls=${params.intensity * 10}:allf=t`
}
