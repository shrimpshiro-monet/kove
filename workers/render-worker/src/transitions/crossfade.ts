export interface CrossfadeParams { duration: number }
export interface DipBlackParams { duration: number; holdBlack?: number }
export interface FlashParams { duration: number; color: string }

export function crossfade(params: CrossfadeParams): string {
  return `xfade=transition=fade:duration=${params.duration}:offset=0`
}

export function dipBlack(params: DipBlackParams): string {
  const half = params.duration / 2
  return `fade=t=out:st=0:d=${half}:color=black,fade=t=in:st=${half}:d=${half}:color=black,xfade=transition=fade:duration=${params.duration}:offset=0`
}

export function flash(params: FlashParams): string {
  return `fade=t=in:st=0:d=${params.duration}:color=${params.color},fade=t=out:st=${params.duration}:d=${params.duration}:color=${params.color}`
}
