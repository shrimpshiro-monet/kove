export interface LightLeakParams {
  position: string
  color: string
  intensity: number
}

export interface LensFlareParams {
  position: [number, number]
  size: number
}

export interface ParticleParams {
  count: number
  size: number
  speed: number
}

export function lightLeak(params: LightLeakParams): string {
  return `colorize=cs=${params.color}:mix=${params.intensity},blend=all_mode=screen`
}

export function lensFlare(params: LensFlareParams): string {
  return `overlay=blend=all_mode=overlay`
}

export function particle(params: ParticleParams): string {
  return `drawbox=w=${params.size}:h=${params.size}:color=white:t=fill`
}
