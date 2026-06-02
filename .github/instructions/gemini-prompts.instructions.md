---
description: "Use when editing Gemini prompts, adding new prompts, improving EDL or analysis quality via prompt engineering, or debugging why Gemini returns bad EDLs. All prompts live in src/server/prompts/ as .txt files — never inline them in TypeScript. Load when working on analyze-footage.txt, analyze-music.txt, generate-edl.txt, decode-intent.txt, or refine-edl.txt."
applyTo: "src/server/prompts/**,src/server/services/gemini*.ts"
---

# Gemini Prompt Engineering Rules

Prompt directory: [src/server/prompts/](../../src/server/prompts/)

## Model

Always `gemini-2.5-flash`. No exceptions. Never use a different model without explicit user instruction.

## Prompts Are Files

```typescript
// ✅ Correct — load at runtime
const prompt = await fs.readFile("src/server/prompts/generate-edl.txt", "utf-8");

// ❌ Wrong — hardcoded strings
const prompt = `You are a video editor. Create shots that...`;
```

Prompts are version-controlled separately from code. Editing a prompt is a product change, not a code change.

## Structured Output — Always

All generation endpoints use Gemini's `responseSchema`. Never parse free-form JSON from text.

```typescript
// ✅ Always use responseSchema
const result = await model.generateContent({
  contents: [...],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: EDL_JSON_SCHEMA,  // from edl.ts
  }
});

// ❌ Never parse text for JSON
const json = JSON.parse(result.text().match(/```json(.*)```/s)?.[1]);
```

## Zod Validation After Every Call

```typescript
const raw = JSON.parse(result.response.text());
const validated = MonetEDLSchema.safeParse(raw);
if (!validated.success) {
  // Log the Gemini response + Zod errors together
  logger.error("Gemini EDL schema mismatch", { raw, errors: validated.error });
  // Fall back to deterministic-edl.ts
}
```

## Retry Logic

```typescript
// Retryable: 429 (rate limit), 503 (overload), 504 (timeout)
// Non-retryable: 400 (bad schema), 403 (auth), content filter blocks
// Max retries: 3, backoff: 1s → 2s → 4s
```

## Prompt Files — What Each Controls

| File | Controls | Tweak to Improve |
|---|---|---|
| [generate-edl.txt](../../src/server/prompts/generate-edl.txt) | Shot selection, beat sync, pacing, aiRationale | Edit quality, sync accuracy |
| [analyze-footage.txt](../../src/server/prompts/analyze-footage.txt) | Segment scoring (motion/emotion/visual/interest) | Segment selection quality |
| [analyze-music.txt](../../src/server/prompts/analyze-music.txt) | Beat grid precision, BPM, structure detection | Beat sync accuracy |
| [decode-intent.txt](../../src/server/prompts/decode-intent.txt) | Intent extraction, genre classification, energy curves | Understanding ambiguous prompts |
| [refine-edl.txt](../../src/server/prompts/refine-edl.txt) | Feedback → EDL modification rules | Refinement accuracy |

## Key Prompt Principles for EDL Generation

These must be in `generate-edl.txt` to produce professional results:

1. **Beat precision**: "Cuts must land within ±50ms of the beat grid. This is the human perception threshold."
2. **Energy curve**: "When energyCurve[t] > 0.8, use shots ≤ 2s. When < 0.4, use shots 4-8s."
3. **aiRationale quality**: "Write aiRationale as a cinematographer would — explain the creative decision, not the score."
4. **Segment selection**: "Only use segments with overall score > 0.7. Never use below 0.6."
5. **Transitions**: "80% of transitions must be type: 'cut'. Reserve crossfade for act transitions only."
6. **Effect restraint**: "Maximum 1 effect per shot. Less than 30% of shots should have any effect."

## Beat Confidence Fallback

```
beatConfidence > 0.8  → Trust Gemini beat grid
beatConfidence 0.5–0.8 → Use but add ±50ms tolerance in beatLock
beatConfidence < 0.5  → Fall back to OpenReel AudioEngine, log occurrence
```

## Segment Scoring Dimensions (analyze-footage.txt)

| Dimension | High Score Means | Used For |
|---|---|---|
| `motion` | Camera/subject movement | Action shots, aggressive pacing |
| `emotion` | Facial expressions, intensity | Character moments, emotional mood |
| `visual` | Composition, lighting, focus | All genres — baseline quality |
| `interest` | Narrative significance | Key story beats |

Minimum `visual > 0.5` for any segment to be considered. Blurry or poorly lit footage is useless.
