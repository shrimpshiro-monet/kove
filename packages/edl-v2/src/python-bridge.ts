export interface FaceDetection {
  frame: number
  bbox: number[]
  landmarks?: Record<string, number[]>
  confidence: number
}

export interface ContentAnalysis {
  faces: FaceDetection[]
  objects: Array<Record<string, unknown>>
  depth: Array<Record<string, unknown>>
  motion: Array<Record<string, unknown>>
  scenes: Array<Record<string, unknown>>
  brightness: number[]
  composition: Record<string, unknown>
  colorPalette: Array<Record<string, unknown>>
  semantic: string
}

export interface BeatResult {
  beats: number[]
  downbeats: number[]
  bpm: number
}

export interface MusicAnalysis {
  bpm: number
  beatResult: BeatResult
  onsets: number[]
  sections: Array<Record<string, unknown>>
  energyCurve: Array<[number, number]>
  vocalRegions: Array<[number, number]>
  frequencyProfile: Record<string, number>
}
