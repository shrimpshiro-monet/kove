export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResult<T> {
  success: boolean;
  error?: ActionError;
  data?: T;
}

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const rawText = await response.text();
    console.log(`[python-workers] ${url} responded with status ${response.status}`, {
      bodyPreview: rawText.slice(0, 500)
    });

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: "PYTHON_WORKER_HTTP_ERROR",
          message: `Python worker failed ${response.status}: ${rawText.slice(0, 200)}`
        }
      };
    }

    let payload: any;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return {
        success: false,
        error: {
          code: "INVALID_PYTHON_RESPONSE",
          message: `Python worker returned non-JSON: ${rawText.slice(0, 200)}`
        }
      };
    }

    const record = payload as {
      success?: unknown;
      data?: unknown;
      error?: unknown;
    };

    if (record.success !== true) {
      return {
        success: false,
        error: {
          code: "PYTHON_WORKER_FAILED",
          message: record.error && typeof record.error === "object" 
            ? (record.error as any).message || "Python worker reported failure"
            : "Python worker reported failure",
        }
      };
    }

    return {
      success: true,
      data: record.data as T
    };
  } catch (error: any) {
    console.error("[python-workers] request failed", { url, error });

    return {
      success: false,
      error: {
        code: "PYTHON_WORKER_REQUEST_FAILED",
        message: `Failed to call Python worker: ${error.message}`
      }
    };
  }
}

export interface AudioAnalysisResult {
  duration: number;
  sampleRate: number;
  tempo: number;
  beats: number[];
  transients: number[];
  energyCurve: Array<{ time: number; value: number }>;
  onsetCurve: Array<{ time: number; value: number }>;
  spectralCentroidCurve: Array<{ time: number; value: number }>;
  summary: {
    beatCount: number;
    transientCount: number;
    averageEnergy: number;
    maxEnergy: number;
  };
}

export interface TranscriptResult {
  language: string;
  languageProbability: number;
  duration: number;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  words: Array<{
    word: string;
    start: number;
    end: number;
    probability: number;
  }>;
  summary: {
    segmentCount: number;
    wordCount: number;
  };
}

export interface SubjectTrackResult {
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  tracks: Array<{
    time: number;
    frame: number;
    bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
    };
    source: string;
    confidence: number;
  }>;
  summary: {
    sampledFrames: number;
    trackedFrames: number;
    coverage: number;
  };
}

export async function analyzeAudioWithPython(
  filePath: string
): Promise<ActionResult<AudioAnalysisResult>> {
  if (!filePath || filePath.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_FILE_PATH",
        message: "filePath is required"
      }
    };
  }

  const baseUrl = getEnv("PYTHON_AUDIO_URL", "http://127.0.0.1:8101");
  const url = `${baseUrl}/analyze-audio`;

  return postJson<AudioAnalysisResult>(url, { filePath });
}

export async function transcribeWithPython(
  filePath: string
): Promise<ActionResult<TranscriptResult>> {
  if (!filePath || filePath.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_FILE_PATH",
        message: "filePath is required"
      }
    };
  }

  const baseUrl = getEnv("PYTHON_AI_URL", "http://127.0.0.1:8102");
  const url = `${baseUrl}/transcribe`;

  return postJson<TranscriptResult>(url, { filePath });
}

export async function trackSubjectWithPython(
  filePath: string
): Promise<ActionResult<SubjectTrackResult>> {
  if (!filePath || filePath.trim().length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_FILE_PATH",
        message: "filePath is required"
      }
    };
  }

  const baseUrl = getEnv("PYTHON_AI_URL", "http://127.0.0.1:8102");
  const url = `${baseUrl}/track-subject`;

  return postJson<SubjectTrackResult>(url, { filePath });
}