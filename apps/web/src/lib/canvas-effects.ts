export interface CanvasEffect {
  type: string
  intensity: number
  params: Record<string, unknown>
}

export type EffectRenderType = 'filter' | 'gradient' | 'transform' | 'channels' | 'noise' | 'glitch'

const FILTER_EFFECTS = new Set([
  'glow', 'blur', 'gaussian_blur',
  'desaturate', 'brightness', 'contrast',
  'saturate', 'invert', 'sharpen',
  'color_grade', 'find_edges', 'posterize',
  'scanlines',
])

const GRADIENT_EFFECTS = new Set([
  'vignette', 'vignette_pro', 'light_leak', 'lens_flare',
])

const TRANSFORM_EFFECTS = new Set([
  'shake', 'context_shake', 'whip_pan', 'wave_warp',
  'fisheye', 'mirror', 'magnify', 'zoom_pulse',
])

const CHANNEL_EFFECTS = new Set([
  'rgb_split', 'chromatic_aberration',
])

const NOISE_EFFECTS = new Set([
  'film_grain', 'noise_grain',
])

const GLITCH_EFFECTS = new Set([
  'glitch', 'vhs_tracking', 'chromatic_glitch',
])

export function getEffectType(type: string): EffectRenderType {
  if (FILTER_EFFECTS.has(type)) return 'filter'
  if (GRADIENT_EFFECTS.has(type)) return 'gradient'
  if (TRANSFORM_EFFECTS.has(type)) return 'transform'
  if (CHANNEL_EFFECTS.has(type)) return 'channels'
  if (NOISE_EFFECTS.has(type)) return 'noise'
  if (GLITCH_EFFECTS.has(type)) return 'glitch'
  return 'filter'
}

export function getCanvasFilter(effect: CanvasEffect): string {
  const { type, intensity } = effect

  switch (type) {
    case 'glow':
    case 'blur':
    case 'gaussian_blur':
      return `blur(${Math.round(intensity * 10)}px)`

    case 'desaturate':
      return `grayscale(${Math.round(intensity * 100)}%)`

    case 'brightness':
      return `brightness(${1 + intensity * 0.5})`

    case 'contrast':
      return `contrast(${1 + intensity * 0.5})`

    case 'hue_rotate':
      return `hue-rotate(${Math.round(intensity * 360)}deg)`

    case 'saturate':
      return `saturate(${1 + intensity})`

    case 'invert':
      return `invert(${intensity})`

    case 'sharpen': {
      const contrast = 1 + intensity * 0.4
      const brightness = 1 - intensity * 0.05
      return `contrast(${contrast}) brightness(${brightness})`
    }

    case 'color_grade': {
      const sat = (effect.params.saturation as number) ?? 1
      const bright = (effect.params.brightness as number) ?? 1
      const cont = (effect.params.contrast as number) ?? 1
      return `saturate(${sat}) brightness(${bright}) contrast(${cont})`
    }

    case 'find_edges':
      return 'contrast(300%) grayscale(100%) invert(100%)'

    case 'posterize':
      return 'contrast(200%) saturate(150%)'

    case 'scanlines':
      return ''

    default:
      return ''
  }
}

export function applyEffect(
  effect: CanvasEffect,
  width: number,
  height: number
): EffectRenderType {
  return getEffectType(effect.type)
}

export function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
): void {
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, width * 0.3,
    width / 2, height / 2, width * 0.7
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`)

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

export function applyShake(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  time: number
): void {
  const shakeX = Math.sin(time * 30) * intensity * 10
  const shakeY = Math.cos(time * 25) * intensity * 10
  ctx.translate(shakeX, shakeY)
}

export function drawFilmGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity * 50
    data[i] = Math.max(0, Math.min(255, data[i] + noise))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
  }

  ctx.putImageData(imageData, 0, 0)
}
