# Production Resilience - Architecture Fixes

## The Problem (Cascading Failure Risk)

**Before**:
```
Intent (LLM) → Analysis (LLM) → EDL (LLM)
                                    ↓
                                 💀 FAILS
                                    ↓
                            User gets NOTHING
```

**Single point of failure**: If Gemini fails at EDL generation, user gets null response after waiting through intent + analysis.

## The Fix (Algorithm-First, LLM-Enhanced)

**After**:
```
Intent (LLM + cache) → Analysis (LLM + cache) → EDL (LLM + deterministic fallback)
                                                      ↓
                                                   ✅ ALWAYS WORKS
```

**Philosophy**: LLM enhancement is optional, not required. Core functionality works without LLM.

---

## Architecture Changes

### 1. Deterministic EDL Generator (Critical)

**File**: `src/server/lib/deterministic-edl.ts`

**What it does**:
- Pure algorithm, no LLM dependency
- Uses intent + analysis to generate valid EDL
- Beat-sync logic based on beat grid
- Pacing rules from intent preferences
- Segment selection by score ranking

**When it runs**:
- Gemini fails (503, rate limit, timeout)
- API key invalid
- Network issues
- ANY LLM failure

**Quality**:
- Good enough for MVP (not perfect, but usable)
- Beat sync works (if music provided)
- Shot selection uses segment scores
- Pacing follows intent rules

**Marked in response**:
```json
{
  "success": true,
  "usedFallback": true,  // User knows it's deterministic
  "edl": { ... }
}
```

---

### 2. Analysis Caching (Cost Optimization)

**File**: `src/server/lib/analysis-cache.ts`

**What it caches**:
- Complete analysis results (footage + music)
- Cache key: hash of `footageIds + musicId`
- TTL: 1 hour (shorter than intent cache)

**Why it matters**:
- Analysis is EXPENSIVE (Gemini video analysis)
- Users refine edits 3-5x on average
- Same footage = same analysis (no need to re-run)

**Cost savings**:
```
Without cache:
- Intent: $0.01
- Analysis: $0.10  ← EXPENSIVE
- EDL: $0.02
- Refinement 1: $0.12 (re-analyze + EDL)
- Refinement 2: $0.12
Total: $0.37

With cache:
- Intent: $0.01 (cached after first)
- Analysis: $0.10 (cached after first)
- EDL: $0.02
- Refinement 1: $0.02 (cache hit!)
- Refinement 2: $0.02 (cache hit!)
Total: $0.17

Savings: 54% cheaper
```

---

### 3. Intent Caching (Already Implemented)

**File**: `src/server/lib/intent-cache.ts`

**What it caches**:
- Extracted intent from prompts
- Similarity matching (80% threshold)
- TTL: 24 hours

**Why it matters**:
- Users type similar prompts ("anime AMV" variations)
- Intent extraction is fast but costs add up
- Similar prompts = same intent

---

### 4. Retry Logic with Exponential Backoff (Already Implemented)

**File**: `src/server/lib/retry.ts`

**What it retries**:
- Transient errors: 503, rate limits, timeouts
- Network issues: ECONNRESET, ETIMEDOUT
- High demand periods

**What it doesn't retry**:
- Auth errors: 401, 403 (won't succeed)
- Not found: 404
- Invalid requests: 400

**Retry strategy**:
- 2 retries max
- Base delay: 500ms
- Exponential backoff: 500ms → 1s → 2s
- Max delay: 3s

**User-friendly errors**:
```typescript
{
  type: "rate_limit",
  userMessage: "AI director is experiencing high demand. Retrying automatically...",
  retryable: true
}
```

---

### 5. Scoring Safety (Divide-by-Zero Fixes)

**Fixed**:
- `beatSyncScore`: Returns 1.0 if no music (not 0)
- `beatSyncScore`: Returns 1.0 if no beatLock shots (intentional)
- `pacingVariance`: Returns 0.5 for single shot (not NaN)
- `pacingVariance`: Checks mean !== 0 before dividing

**Impact**:
- No crashes on edge cases
- Scores always valid (0-1 range)
- Graceful degradation

---

## Testing

### Test 1: Deterministic Fallback
```bash
./test-resilience.sh
```

**Expected**:
- `usedFallback: true`
- EDL with shots (not empty)
- Scores calculated correctly
- No errors

### Test 2: Analysis Caching
```bash
./test-resilience.sh
```

**Expected**:
- First call: `cached: false` (slower)
- Second call: `cached: true` (instant)
- Same result both times

### Test 3: Intent Caching
```bash
./test-resilience.sh
```

**Expected**:
- Similar prompts hit cache
- Exact match: instant
- 80%+ similar: cache hit

---

## Production Readiness Checklist

- [x] **Deterministic EDL fallback** - No LLM dependency at EDL stage
- [x] **Analysis caching** - Avoid re-analyzing same footage
- [x] **Intent caching** - Avoid re-extracting similar prompts
- [x] **Retry logic** - Handle transient failures gracefully
- [x] **Divide-by-zero fixes** - Safe scoring calculations
- [x] **User-friendly errors** - Explain what went wrong
- [x] **Fallback transparency** - Tell user when deterministic is used

---

## Cost Optimization Summary

**Per edit (with refinements)**:

| Stage | Without Caching | With Caching | Savings |
|-------|----------------|--------------|---------|
| Intent extraction | $0.01 × 4 = $0.04 | $0.01 (cached) | 75% |
| Analysis | $0.10 × 4 = $0.40 | $0.10 (cached) | 75% |
| EDL generation | $0.02 × 4 = $0.08 | $0.02 × 4 = $0.08 | 0% |
| **Total** | **$0.52** | **$0.19** | **63%** |

**At scale (10,000 edits/day)**:
- Without caching: $5,200/day
- With caching: $1,900/day
- **Savings: $3,300/day = $99,000/month**

---

## Next Steps (Not Critical for MVP)

### 1. KV-backed caching (expansion)
Move in-memory caches to Cloudflare KV:
- Persistent across Workers restarts
- Shared across edge nodes
- Automatic TTL cleanup

### 2. Multi-model fallback (expansion)
```typescript
// Try models in order
const models = ["gemini-2.5-flash", "gemini-pro", "gpt-4o-mini"];
```

### 3. Partial analysis caching (expansion)
Cache per-clip analysis separately:
- User adds new clip → only analyze new one
- Reuse cached analysis for existing clips

### 4. Intent similarity embeddings (expansion)
Replace Jaccard similarity with semantic embeddings:
- "anime AMV" ≈ "Japanese animation music video"
- Better cache hit rate

---

## Philosophy

**Algorithm-first, LLM-enhanced**

- Core functionality: deterministic
- LLM: quality enhancement (optional)
- User always gets result
- Graceful degradation

**Cost-conscious architecture**

- Cache everything cacheable
- Avoid redundant LLM calls
- 63% cost reduction via caching

**Production-ready from day 1**

- No single point of failure
- Retry logic for transient errors
- User-friendly error messages
- Transparency (tell user when fallback used)

---

This architecture survives:
- ✅ Gemini outages
- ✅ Rate limits
- ✅ Network issues
- ✅ API key expiry
- ✅ High-demand periods

**User always gets an edit.**
