# Empty EDL Fix Sprint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Fix generate-edl returning success with 0 shots, and add hard validation everywhere.

**Architecture:** Add backend guards, improve Style Lab parsing, add diagnostic logging.

**Tech Stack:** TypeScript (server + frontend).

## Global Constraints

- Do NOT modify EDL schema
- Do NOT touch Simple/Chat/Studio
- Do NOT refactor the whole generator
- Only fix empty EDL and add validation

---

### Task 1 — Backend guard: never return empty EDL

**Files:**
- Modify: `src/server/api/generate-edl.ts`

**Steps:**

- [ ] **Step 1: Add empty EDL guard before return**

After line 500 (before `return jsonResponse`), add:

```ts
// HARD GUARD: Never return success with empty EDL
const finalShotCount = edl.shots?.length ?? 0;
const finalDuration = edl.timeline?.duration ?? 0;

if (finalShotCount === 0) {
  console.error("[generate-edl] EMPTY_EDL_GUARD: Generated EDL has 0 shots", JSON.stringify({
    generationMode,
    analysisId,
    referenceStyleId: !!referenceStyle,
    referenceMode,
    intentPacing: intent?.style?.pacing,
  }));
  return apiError(
    ApiErrorCode.EDLGenerationFailed,
    "Generated EDL has no shots. The planner could not produce valid shots from the provided footage and constraints.",
    500
  );
}

if (finalDuration <= 0) {
  console.error("[generate-edl] INVALID_DURATION_GUARD: EDL duration is", finalDuration);
  return apiError(
    ApiErrorCode.EDLGenerationFailed,
    "Generated EDL has invalid timeline duration.",
    500
  );
}
```

- [ ] **Step 2: Add diagnostic logging before V3 call**

After line 170 (`console.log("[generate-edl] Routing to V3 pipeline...")`), add:

```ts
console.log("[generate-edl:v3-inputs]", JSON.stringify({
  hasIntent: !!intent,
  intentPacing: intent?.style?.pacing,
  footageCount: analysis.footage?.length ?? 0,
  totalSegments: analysis.footage?.reduce((sum: number, f: any) => sum + (f.segments?.length ?? 0), 0) ?? 0,
  hasMusic: !!analysis.music,
  musicDuration: analysis.music?.duration,
  referenceStyleKeys: referenceStyle ? Object.keys(referenceStyle) : [],
  referenceMode,
  clipIds: clipIds.length,
}));
```

- [ ] **Step 3: Add logging after V3 returns**

After line 203 (`v3Edl` is assigned), add:

```ts
console.log("[generate-edl:v3-result]", JSON.stringify({
  shotCount: v3Edl.shots?.length ?? 0,
  duration: v3Edl.timeline?.duration ?? 0,
  maxShotEnd: v3Edl.shots?.length
    ? Math.max(...v3Edl.shots.map((s: any) => (s.timing?.startTime ?? 0) + (s.timing?.duration ?? 0)))
    : 0,
}));
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/generate-edl.ts
git commit -m "fix: add empty EDL guard — never return success with 0 shots"
```

---

### Task 2 — Fix Style Lab EDL parsing and validation

**Files:**
- Modify: `src/routes/style-lab.tsx`

**Steps:**

- [ ] **Step 1: Add robust EDL extraction with debug logging**

In `runPipeline()`, after the generate-edl fetch (around line 498), replace the EDL extraction with:

```ts
// Robust EDL extraction
const rawResponse = generatedEdl;
const edlCandidate = rawResponse?.edl ?? rawResponse?.result?.edl ?? rawResponse?.data?.edl;

if (!edlCandidate) {
  l("GENERATE-ERROR", "No EDL object found in generate response", false);
  l("GENERATE-RAW", `Response keys: ${Object.keys(rawResponse ?? {}).join(", ")}`);
  setGenStep("error");
  return;
}

const shotCount = edlCandidate.shots?.length ?? 0;
const duration = edlCandidate.timeline?.duration ?? 0;
const maxShotEnd = shotCount > 0
  ? Math.max(...edlCandidate.shots.map((s: any) => (s.timing?.startTime ?? 0) + (s.timing?.duration ?? 0)))
  : 0;

l("GENERATE-INSPECT", `Shots: ${shotCount}, Duration: ${duration.toFixed(1)}s, Max shot end: ${maxShotEnd.toFixed(1)}s`);

if (shotCount === 0) {
  l("GENERATE-ERROR", `Empty EDL: 0 shots generated. Check server logs for planner inputs.`, false);
  l("GENERATE-RAW", JSON.stringify(rawResponse, null, 2).slice(0, 2000));
  setGenStep("error");
  return;
}

if (maxShotEnd > duration + 0.1) {
  l("GENERATE-WARN", `Duration invariant violated: shots extend to ${maxShotEnd.toFixed(1)}s but timeline is ${duration.toFixed(1)}s`, false);
}

setEdl(edlCandidate);
```

- [ ] **Step 2: Add duration invariant badge**

After the existing BADGE logs, add:

```ts
if (edl) {
  const edlMaxEnd = edl.shots?.length
    ? Math.max(...edl.shots.map((s: any) => (s.timing?.startTime ?? 0) + (s.timing?.duration ?? 0)))
    : 0;
  const durationOk = edlMaxEnd <= (edl.timeline?.duration ?? 0) + 0.1;
  l("BADGE", `duration invariant: ${durationOk ? "PASS" : "FAIL"} (max ${edlMaxEnd.toFixed(1)}s vs ${edl.timeline?.duration ?? 0}s)`, durationOk);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/style-lab.tsx
git commit -m "fix: Style Lab validates EDL is non-empty and checks duration invariant"
```

---

### Task 3 — Verify and create fix doc

**Files:**
- Create: `STYLE-LAB-EMPTY-EDL-FIX-VERIFY.md`

**Steps:**

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 2: Create verification doc**

Document the fix and what was verified.

- [ ] **Step 3: Commit**

```bash
git add STYLE-LAB-EMPTY-EDL-FIX-VERIFY.md
git commit -m "docs: empty EDL fix verification"
```
