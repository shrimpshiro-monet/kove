export interface LinearWipeParams { duration: number; direction: string }
export interface RadialWipeParams { duration: number }
export interface GradientWipeParams { duration: number; gradient: string }

const directionMap: Record<string, string> = {
  left: 'wipeleft',
  right: 'wiperight',
  up: 'wipeup',
  down: 'wipedown',
}

export function linearWipe(params: LinearWipeParams): string {
  const transition = directionMap[params.direction] || 'wipeleft'
  return `xfade=transition=${transition}:duration=${params.duration}:offset=0`
}

export function radialWipe(params: RadialWipeParams): string {
  return `xfade=transition=radial:duration=${params.duration}:offset=0`
}

export function gradientWipe(params: GradientWipeParams): string {
  return `xfade=transition=smoothleft:duration=${params.duration}:offset=0`
}
