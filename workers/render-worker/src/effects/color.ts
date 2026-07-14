export interface ColorGradeParams {
  preset: string
  intensity: number
}

export interface VignetteParams {
  intensity: number
}

export interface DesaturateParams {
  intensity: number
  preserveSkinTones: boolean
}

export function colorGrade(params: ColorGradeParams): string {
  const { preset, intensity } = params
  switch (preset) {
    case 'teal_orange':
      return `curves=r='0/0 0.5/0.45 1/0.9':g='0/0 0.5/0.5 1/0.85':b='0/0.1 0.5/0.55 1/0.8',eq=saturation=${1 + intensity * 0.3}:contrast=${intensity}`
    case 'cinematic_warm':
      return `curves=r='0/0 0.5/0.55 1/0.95':g='0/0 0.5/0.5 1/0.85':b='0/0.05 0.5/0.45 1/0.75',eq=saturation=${1 + intensity * 0.2}:contrast=${intensity}`
    case 'cold_blue':
      return `curves=r='0/0 0.5/0.4 1/0.8':g='0/0 0.5/0.5 1/0.85':b='0/0.1 0.5/0.6 1/0.95',eq=saturation=${1 + intensity * 0.1}:contrast=${intensity}`
    default:
      return `eq=saturation=${1 + intensity * 0.2}:contrast=${intensity}`
  }
}

export function vignette(params: VignetteParams): string {
  const angle = Math.PI / (4 - params.intensity * 2)
  return `vignette=PI/${angle.toFixed(2)}`
}

export function desaturate(params: DesaturateParams): string {
  const saturation = 1 - params.intensity
  return `eq=saturation=${saturation.toFixed(2)}`
}
