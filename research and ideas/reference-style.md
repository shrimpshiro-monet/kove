# reference-style.md

## Source: `src/server/types/reference-style.ts`

### Full ReferenceStyle interface (what the analyzer SHOULD produce)

```typescript
interface ReferenceStyle {
  rhythm: {
    avgShotDuration: number;        // Average seconds per shot
    shotDurationVariance: number;   // Std dev
    beatsPerCut: number;            // How many beats between cuts
    cutAlignment: "strict" | "loose" | "none";
    accentCuts: number[];           // Timestamps of emphasized cuts
  };
  pacing: {
    type: "aggressive" | "fast" | "medium" | "slow" | "varied";
    energyCurve: number[];          // 0-1 values, one per 10% of video
    intensityBuilds: boolean;
    climaxPosition: number;         // 0-1, where peak occurs
    breathingMoments: number[];
  };
  shotLanguage: {
    closeupRatio: number;
    wideRatio: number;
    motionPreference: "static" | "moving" | "mixed";
    subjectFocus: string[];
    sequencePatterns: string[];
  };
  visualStyle: {
    colorGrade: "cinematic" | "vibrant" | "vintage" | "monochrome" | "anime" | "raw";
    colorTemperature: "warm" | "cool" | "neutral";
    contrastLevel: "low" | "medium" | "high";
    saturationLevel: "desaturated" | "natural" | "saturated" | "hyper-saturated";
    vignettePresent: boolean;
    grainPresent: boolean;
  };
  effects: {
    overallIntensity: number;
    effectsFrequency: number;
    commonEffects: string[];
    transitionsBreakdown: {
      cutPercentage: number;
      crossfadePercentage: number;
      otherPercentage: number;
    };
  };
  emotionalArc: {
    openingMood: string;
    peakMood: string;
    closingMood: string;
    emotionalContour: string;
  };
  editingPhilosophy: {
    summary: string;
    rhythmContract: string;
    restraintLevel: "minimal" | "moderate" | "heavy";
    signatureMove: string;
  };
  intentMapping: {
    genre: string;
    pacing: "aggressive" | "fast" | "medium" | "slow" | "varied";
    syncToBeat: boolean;
    beatSyncStrength: number;
    colorTreatment: string;
    effectsIntensity: number;
    transitionStyle: string;
    avgShotDuration: number;
    mood: string[];
    contentFocus: string[];
  };
  pillarScores: {
    brutalistImpact: number;
    tensionPivot: number;
    vocalFlowSync: number;
    legacyMontage: number;
  };
}
```

### What the analyzer actually produces (before normalization)
```json
{
  "cutFrequency": 2.5,
  "avgShotDurationSeconds": 0.4,
  "cutDurationsVariance": 0.12,
  "motionEnergyProfile": [0.3, 0.7, ...],
  "detectedEffects": [...],
  "referenceId": "abc-123"
}
```

### What normalization adds
```json
{
  "rhythm": { "avgShotDuration": 0.4, "cutAlignment": "strict", "cutsPerSecond": 2.5 },
  "intentMapping": { "pacing": "fast", "energy": "high" },
  "pacing": { "climaxPosition": 0.65, "energyCurve": [...] },
  "effects": { "transitionsBreakdown": { "cutPercentage": 0.8, "crossfadePercentage": 0.2 }, "effectsFrequency": 0.5 }
}
```
