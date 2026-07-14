export interface GlowParams {
  radius: number
  threshold: number
  color?: string
}

export interface BloomParams {
  threshold: number
  radius: number
}

export interface FilmGrainParams {
  type: string
  size: string
}

export interface HalftoneParams {
  dotSize: number
  angle: number
}

export function glow(params: GlowParams): string {
  const sigma = params.radius * 0.5
  return `gblur=sigma=${sigma},colorbalance=rs=${params.threshold * 0.1},blend=all_mode=screen`
}

export function bloom(params: BloomParams): string {
  return `gblur=sigma=${params.radius},curves=m='0/0 0.5/${0.5 + params.threshold * 0.3} 1/1'`
}

export function filmGrain(params: FilmGrainParams): string {
  const amount = params.size === 'heavy' ? 30 : params.size === 'medium' ? 15 : 8
  return `noise=alls=${amount}:allf=t+u`
}

export function halftone(params: HalftoneParams): string {
  return `edgedetect=mode=threshold,curves=m='0/0 0.5/0.2 1/1'`
}
