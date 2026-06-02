import type { AnalysisResult } from "../types/analysis";

const analysisById = new Map<string, AnalysisResult>();

export function storeAnalysisResult(analysisId: string, result: AnalysisResult): void {
  analysisById.set(analysisId, result);
}

export function getAnalysisResult(analysisId: string): AnalysisResult | null {
  return analysisById.get(analysisId) ?? null;
}
