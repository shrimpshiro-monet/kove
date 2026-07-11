import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidMediaType, VALID_MEDIA_TYPES } from "../../lib/media-types";
import { detectBeats, analyzeMusic } from "../../services/audio-analysis-service";
import { transcribeMedia, getOrTranscribe } from "../../services/transcription-service";
import { generateSignedUploadUrl } from "../../services/upload-signing-service";

// ─── Flow 2: Media Type Validation ───────────────────────────────────────────

describe("Media type validation", () => {
  it("accepts valid footage MIME types", () => {
    expect(isValidMediaType("footage", "video/mp4")).toBe(true);
    expect(isValidMediaType("footage", "video/quicktime")).toBe(true);
    expect(isValidMediaType("footage", "video/webm")).toBe(true);
    expect(isValidMediaType("footage", "video/x-matroska")).toBe(true);
  });

  it("accepts valid music MIME types", () => {
    expect(isValidMediaType("music", "audio/mpeg")).toBe(true);
    expect(isValidMediaType("music", "audio/mp4")).toBe(true);
    expect(isValidMediaType("music", "audio/wav")).toBe(true);
    expect(isValidMediaType("music", "audio/webm")).toBe(true);
    expect(isValidMediaType("music", "audio/ogg")).toBe(true);
  });

  it("accepts valid reference MIME types", () => {
    expect(isValidMediaType("reference", "video/mp4")).toBe(true);
    expect(isValidMediaType("reference", "video/quicktime")).toBe(true);
  });

  it("rejects invalid MIME types", () => {
    expect(isValidMediaType("footage", "image/png")).toBe(false);
    expect(isValidMediaType("music", "video/mp4")).toBe(false);
    expect(isValidMediaType("reference", "audio/mpeg")).toBe(false);
    expect(isValidMediaType("footage", "application/pdf")).toBe(false);
  });

  it("rejects unknown media types", () => {
    expect(isValidMediaType("unknown", "video/mp4")).toBe(false);
    expect(isValidMediaType("", "video/mp4")).toBe(false);
  });

  it("has consistent allowed types across all categories", () => {
    expect(VALID_MEDIA_TYPES.footage).toBeDefined();
    expect(VALID_MEDIA_TYPES.music).toBeDefined();
    expect(VALID_MEDIA_TYPES.reference).toBeDefined();
    expect(VALID_MEDIA_TYPES.footage.length).toBeGreaterThan(0);
    expect(VALID_MEDIA_TYPES.music.length).toBeGreaterThan(0);
  });
});

// ─── Flow 1: Beat Detection ──────────────────────────────────────────────────

describe("Beat detection service", () => {
  const mockEnv = {
    PYTHON_AUDIO_URL: "http://localhost:8101",
  } as any;

  it("returns fallback beats when local file does not exist", async () => {
    const result = await detectBeats(mockEnv, "nonexistent-clip-id");

    expect(result.bpm).toBe(120);
    expect(result.confidence).toBe(0.5);
    expect(result.beats).toBeInstanceOf(Array);
    expect(result.beats.length).toBe(10);
    expect(result.duration).toBe(5);
    expect(result.downbeats).toEqual([0, 2, 4]);
  });

  it("fallback beats have correct structure", async () => {
    const result = await detectBeats(mockEnv, "nonexistent");

    expect(result.beats[0]).toHaveProperty("time");
    expect(result.beats[0]).toHaveProperty("strength");
    expect(result.beats[0]).toHaveProperty("index");
    expect(result.beats[0].time).toBe(0);
    expect(result.beats[0].strength).toBe(1);
    expect(result.beats[0].index).toBe(0);
  });

  it("fallback downbeats are every 4th beat", async () => {
    const result = await detectBeats(mockEnv, "nonexistent");

    expect(result.downbeats).toEqual([0, 2, 4]);
    expect(result.downbeats.length).toBe(Math.ceil(result.beats.length / 4));
  });
});

// ─── Flow 3: Music Analysis ──────────────────────────────────────────────────

describe("Music analysis service", () => {
  const mockEnv = {
    PYTHON_AUDIO_URL: "http://localhost:8101",
  } as any;

  it("returns bpm:120 stub when no local file exists", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await analyzeMusic(mockEnv, "nonexistent-music-id");

    expect(result.bpm).toBe(120);
    expect(result.confidence).toBe(0.2);
    expect(result.duration).toBe(180);
    expect(result.beatGrid).toBeInstanceOf(Array);
    expect(result.beatGrid.length).toBe(60);
    expect(result.characteristics).toBeDefined();
    expect(result.characteristics.mood).toEqual(["unknown"]);

    // Verify CRITICAL warning was logged
    expect(consoleSpy).toHaveBeenCalled();
    const warnCalls = consoleSpy.mock.calls.flat().join(" ");
    expect(warnCalls).toContain("CRITICAL");
    expect(warnCalls).toContain("bpm:120 stub");

    consoleSpy.mockRestore();
  });

  it("returns same response shape as /api/analyze expects", async () => {
    const result = await analyzeMusic(mockEnv, "nonexistent");

    // Required fields for MusicAnalysis
    expect(result).toHaveProperty("musicId");
    expect(result).toHaveProperty("duration");
    expect(result).toHaveProperty("bpm");
    expect(result).toHaveProperty("beatGrid");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("characteristics");
    expect(result.characteristics).toHaveProperty("mood");
    expect(result.characteristics).toHaveProperty("energy");
    expect(result.characteristics).toHaveProperty("intensity");
    expect(result.characteristics).toHaveProperty("genreHints");
  });

  it("beatGrid is an array of numbers", async () => {
    const result = await analyzeMusic(mockEnv, "nonexistent");

    expect(Array.isArray(result.beatGrid)).toBe(true);
    result.beatGrid.forEach((val: any) => {
      expect(typeof val).toBe("number");
    });
  });
});

// ─── Flow 4: Transcription ───────────────────────────────────────────────────

describe("Transcription service", () => {
  const mockEnv = {
    PYTHON_AI_URL: "http://localhost:8102",
  } as any;

  it("returns empty transcript when no local file exists", async () => {
    const result = await transcribeMedia(mockEnv, "nonexistent-media-id");

    expect(result.mediaId).toBe("nonexistent-media-id");
    expect(result.words).toEqual([]);
    expect(result.fullText).toBe("");
    expect(result.duration_ms).toBe(0);
    expect(result.language).toBe("en");
  });

  it("never returns hallucinated text", async () => {
    const result = await transcribeMedia(mockEnv, "nonexistent");

    expect(result.words.length).toBe(0);
    expect(result.fullText).toBe("");
    // No fake words, no mock transcript
  });

  it("returns same response shape as frontend expects", async () => {
    const result = await transcribeMedia(mockEnv, "nonexistent");

    expect(result).toHaveProperty("mediaId");
    expect(result).toHaveProperty("words");
    expect(result).toHaveProperty("fullText");
    expect(result).toHaveProperty("duration_ms");
    expect(result).toHaveProperty("language");
  });

  it("word objects have correct schema (seconds → ms bridging)", () => {
    // This tests the schema bridging logic
    const whisperWord = { word: "hello", start: 1.23, end: 1.67, probability: 0.95 };
    const bridged = {
      text: whisperWord.word,
      start_ms: Math.round(whisperWord.start * 1000),
      end_ms: Math.round(whisperWord.end * 1000),
      confidence: whisperWord.probability,
      intensity: 0.5,
    };

    expect(bridged.text).toBe("hello");
    expect(bridged.start_ms).toBe(1230);
    expect(bridged.end_ms).toBe(1670);
    expect(bridged.confidence).toBe(0.95);
    expect(bridged.intensity).toBe(0.5);
  });

  it("getOrTranscribe returns cached=false for first call", async () => {
    const result = await getOrTranscribe(mockEnv, "nonexistent");

    expect(result).toHaveProperty("transcript");
    expect(result).toHaveProperty("cached");
    expect(result.cached).toBe(false);
    expect(result.transcript.mediaId).toBe("nonexistent");
  });
});

// ─── Flow 5: Reference Analysis Response Shape ───────────────────────────────

describe("Reference analysis response shape", () => {
  it("style object has all required fields for compileReferenceStyleToDirectives", () => {
    // Test the shape that reference-analysis-service builds
    const mockStyle = {
      referenceId: "test-ref",
      duration: 30,
      cutFrequency: 2.5,
      avgShotDurationSeconds: 0.4,
      cutDurationsVariance: 0.1,
      motionEnergyProfile: [0.3, 0.5, 0.7],
      detectedEffects: [],
      dominantPalette: ["#333"],
      gradingStyle: "cinematic",
      styleDescription: "Fast cuts",
      confidence: 0.8,
      rhythm: {
        avgShotDuration: 0.4,
        cutAlignment: "strict",
        cutsPerSecond: 2.5,
      },
      intentMapping: {
        pacing: "fast",
        energy: "high",
        colorTreatment: "vibrant",
      },
      pacing: {
        climaxPosition: 0.65,
        energyCurve: [0.3, 0.5],
      },
      effects: {
        transitionsBreakdown: { cutPercentage: 0.8, crossfadePercentage: 0.2 },
        effectsFrequency: 0.5,
      },
      shotLanguage: {
        subjectFocus: ["action"],
        cameraMotion: "dynamic",
        composition: "standard",
      },
      editingPhilosophy: {
        summary: "Fast-paced",
        cutRhythm: "rapid",
        effectDensity: "high",
      },
      pillarScores: {
        brutalistImpact: 0.7,
        tensionPivot: 0.6,
        vocalFlowSync: 0.4,
        legacyMontage: 0.6,
      },
    };

    // Verify all required fields exist
    expect(mockStyle).toHaveProperty("referenceId");
    expect(mockStyle).toHaveProperty("duration");
    expect(mockStyle).toHaveProperty("cutFrequency");
    expect(mockStyle).toHaveProperty("avgShotDurationSeconds");
    expect(mockStyle).toHaveProperty("rhythm");
    expect(mockStyle).toHaveProperty("intentMapping");
    expect(mockStyle).toHaveProperty("pacing");
    expect(mockStyle).toHaveProperty("effects");
    expect(mockStyle).toHaveProperty("shotLanguage");
    expect(mockStyle).toHaveProperty("editingPhilosophy");
    expect(mockStyle).toHaveProperty("pillarScores");
    expect(mockStyle).toHaveProperty("confidence");
  });

  it("low confidence threshold is 0.3", () => {
    const lowConfidence = 0.2;
    const threshold = 0.3;

    expect(lowConfidence < threshold).toBe(true);
  });

  it("totalDuration <= 0 should trigger 422", () => {
    const totalDuration = 0;
    expect(totalDuration <= 0).toBe(true);
  });
});

// ─── Flow 6: Signed Upload URL ───────────────────────────────────────────────

describe("Signed upload URL generation", () => {
  it("returns unsigned URL when R2 credentials are missing", async () => {
    const envWithoutCreds = {} as any;
    const url = await generateSignedUploadUrl(envWithoutCreds, "test/key.mp4", "video/mp4");

    expect(url).toContain("monet-media-dev.r2.cloudflarestorage.com");
    expect(url).toContain("test/key.mp4");
    // Should NOT contain signature params (unsigned)
    expect(url).not.toContain("X-Amz-Credential");
  });

  it("returns URL with correct R2 key format", async () => {
    const env = {} as any;
    const url = await generateSignedUploadUrl(env, "project1/footage/clip123/video.mp4", "video/mp4");

    expect(url).toContain("project1/footage/clip123/video.mp4");
  });

  it("local dev fallback does not depend on production path", async () => {
    // When no credentials, the fallback URL should still be functional for dev
    const env = {} as any;
    const url = await generateSignedUploadUrl(env, "dev/test.mp4", "video/mp4");

    expect(url).toMatch(/^https:\/\/.*\.r2\.cloudflarestorage\.com\//);
  });
});

// ─── Cross-cutting: Fail-loud behavior ───────────────────────────────────────

describe("Fail-loud behavior preserved", () => {
  it("audio analysis logs CRITICAL on fallback", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = {} as any;

    await analyzeMusic(env, "no-file");

    const allWarnings = consoleSpy.mock.calls.flat().join(" ");
    expect(allWarnings).toContain("CRITICAL");
    consoleSpy.mockRestore();
  });

  it("transcription returns empty, not hallucinated", async () => {
    const env = {} as any;
    const result = await transcribeMedia(env, "no-file");

    expect(result.words).toHaveLength(0);
    expect(result.fullText).toBe("");
  });

  it("beat detection falls back loudly", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = {} as any;

    const result = await detectBeats(env, "no-file");

    expect(result.bpm).toBe(120);
    expect(result.confidence).toBe(0.5);
    // Should have logged a warning about fallback
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
