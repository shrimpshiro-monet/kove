export interface GaussianBlurParams {
  radius: number
  quality: string
}

export interface RadialBlurParams {
  center: [number, number]
  strength: number
}

export interface DirectionalBlurParams {
  angle: number
  length: number
}

export function gaussianBlur(params: GaussianBlurParams): string {
  return `gblur=sigma=${params.radius}`
}

export function radialBlur(params: RadialBlurParams): string {
  return `zoompan=z='min(zoom+0.0015,1.5)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
}

export function directionalBlur(params: DirectionalBlurParams): string {
  const rad = (params.angle * Math.PI) / 180
  const dx = Math.cos(rad).toFixed(3)
  const dy = Math.sin(rad).toFixed(3)
  return `convolution='${dx} ${dy} 0 ${dy} -4 ${dy} 0 ${dy} ${dx}':0 1 0 1 -4 1 0 1 0':0 1 0 1 -4 1 0 1 0':0 1 0 1 -4 1 0 1 0'`
}
