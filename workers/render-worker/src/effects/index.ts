export type EffectFilter = string

export interface EffectParams {
  intensity: number
  [key: string]: unknown
}

export type EffectFn = (params: EffectParams) => EffectFilter
