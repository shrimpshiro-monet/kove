// API Client for Monet backend
// Typed fetch wrappers for all endpoints

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";

export interface IntentResult {
  success: boolean;
  intentId?: string;
  result?: {
    intent: any;
    confidence: number;
    reasoning: string;
    clarifyingQuestions?: Array<{
      question: string;
      options: string[];
      affectsField: string;
    }>;
  };
  cached?: boolean;
  error?: string;
}

export interface AnalysisResult {
  success: boolean;
  analysisId?: string;
  result?: {
    version: string;
    projectId: string;
    timestamp: number;
    footage: any[];
    music?: any;
  };
  cached?: boolean;
  error?: string;
}

export interface EDLResult {
  success: boolean;
  edlId?: string;
  edl?: {
    version: string;
    metadata: any;
    timeline: any;
    music?: any;
    shots: any[];
    globalEffects?: any;
  };
  scores?: {
    beatSyncScore: number;
    pacingVariance: number;
    overallConfidence: number;
  };
  usedFallback?: boolean;
  error?: string;
}

/**
 * Extract creative intent from user prompt
 */
export async function decodeIntent(
  prompt: string,
  projectId: string
): Promise<IntentResult> {
  const res = await fetch(`${API_BASE}/api/decode-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, projectId }),
  });

  return res.json();
}

/**
 * Analyze footage and music
 */
export async function analyzeMedia(
  projectId: string,
  footageIds: string[],
  musicId?: string
): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, footageIds, musicId }),
  });

  return res.json();
}

/**
 * Generate EDL from intent + analysis
 */
export async function generateEDL(
  projectId: string,
  intentId: string,
  analysisId: string
): Promise<EDLResult> {
  const res = await fetch(`${API_BASE}/api/generate-edl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, intentId, analysisId }),
  });

  return res.json();
}

/**
 * Upload file to R2 (not implemented yet, placeholder)
 */
export async function uploadFile(file: File): Promise<{ fileId: string }> {
  // TODO: Implement actual R2 upload
  // For MVP: return mock ID
  return {
    fileId: `mock-${file.name}-${Date.now()}`,
  };
}
