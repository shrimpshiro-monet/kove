import { ProjectEDL as MonetEDL, Clip } from "@monet/edl/src/schemas";

export interface EnhancerContext {
  edl: MonetEDL;
  audioAnalysis?: AudioAnalysis;
  transcript?: TranscriptData;
}

export interface EnhancerResult {
  success: boolean;
  error?: { code: string; message: string };
  edl?: MonetEDL;
}

export interface AudioAnalysis {
  beats: number[];
  energy: number[];
  transients: number[];
}

export interface TranscriptData {
  words: { word: string; start: number; end: number }[];
}

export type ClipMutation = (clip: Clip) => void;