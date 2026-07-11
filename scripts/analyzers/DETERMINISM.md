# Determinism Audit

## Overview
This document audits all analyzers for non-deterministic behavior that could cause different outputs for the same input.

## Audit Results

### color_analyzer.py
| Issue | Status | Fix |
|-------|--------|-----|
| `np.random.choice` in kmeans_simple() | ✅ FIXED | Changed to evenly-spaced indices: `np.linspace(0, n-1, k).astype(int)` |
| No seed set | ✅ FIXED | Added `SEED = 42` constant at top of file |

### shot_type_classifier.py
| Issue | Status | Fix |
|-------|--------|-----|
| `np.random.choice` in detect_complexity() | ✅ FIXED | Changed to `np.linspace(0, len(flat)-1, 10000).astype(int)` |
| `np.random.choice` in detect_color_concentration() | ✅ FIXED | Changed to `np.linspace(0, len(flat)-1, 5000).astype(int)` for sampling |
| `np.random.choice` for centroids | ✅ FIXED | Changed to `np.linspace(0, len(flat)-1, 3).astype(int)` |
| `np.random.seed(42)` set late | ✅ FIXED | Removed; using deterministic initialization instead |

### motion_analyzer.py
| Issue | Status | Notes |
|-------|--------|-------|
| No random usage | ✅ CLEAN | Deterministic by design |

### beat_detector.py
| Issue | Status | Notes |
|-------|--------|-------|
| No random usage | ✅ CLEAN | librosa beat tracking is deterministic |

### effect_detector.py
| Issue | Status | Notes |
|-------|--------|-------|
| No random usage | ✅ CLEAN | Deterministic by design |

### text_detector.py
| Issue | Status | Notes |
|-------|--------|-------|
| No random usage | ✅ CLEAN | Deterministic by design |

### speed_ramp_detector.py
| Issue | Status | Notes |
|-------|--------|-------|
| No random usage | ✅ CLEAN | Deterministic by design |

### llm_provider.py
| Issue | Status | Notes |
|-------|--------|-------|
| DigitalOcean Inference API calls | ⚠️ INHERENT | API calls are non-deterministic (acceptable for semantic + classification layer) |

### semantic_analyzer.py
| Issue | Status | Notes |
|-------|--------|-------|
| LLM API calls via llm_provider.py | ⚠️ INHERENT | DigitalOcean Inference (non-deterministic, acceptable for semantic layer) |
| Dict iteration | ✅ CLEAN | Python 3.7+ guarantees insertion order |

### reference_type_classifier.py
| Issue | Status | Notes |
|-------|--------|-------|
| LLM API calls via llm_provider.py | ⚠️ INHERENT | DigitalOcean Inference (non-deterministic, acceptable for classification layer) |
| Dict iteration | ✅ CLEAN | Python 3.7+ guarantees insertion order |

## Remaining Non-Determinism

### Semantic Analyzer (acceptable)
The `semantic_analyzer.py` uses DigitalOcean Inference API calls (via `llm_provider.py`) which are inherently non-deterministic. This is acceptable because:
1. Semantic analysis is the "fuzzy" part of the pipeline
2. The core structural analysis (shots, motion, color, effects) is fully deterministic
3. The semantic results are supplementary, not foundational

### Frame Extraction Timing
Minor floating-point differences may occur in frame timestamps due to FFmpeg's internal timing. These are negligible (< 1ms) and don't affect extraction results.

## Determinism Guarantees

For the same input video:
- **Shot detection**: ✅ Deterministic (FFmpeg scene detection is deterministic)
- **Motion analysis**: ✅ Deterministic (optical flow is deterministic)
- **Beat detection**: ✅ Deterministic (librosa is deterministic)
- **Color analysis**: ✅ Deterministic (k-means with fixed init is deterministic)
- **Shot type**: ✅ Deterministic (face detection + heuristics are deterministic)
- **Effects**: ✅ Deterministic (edge analysis is deterministic)
- **Text detection**: ✅ Deterministic (edge analysis is deterministic)
- **Speed ramps**: ✅ Deterministic (motion analysis is deterministic)
- **Semantic events**: ⚠️ Non-deterministic (DigitalOcean Inference API via llm_provider.py)

## Testing

Run `scripts/eval/test_determinism.py` to verify determinism:
```bash
python3 scripts/eval/test_determinism.py
```

This runs grammar extraction 3 times on the Curry reference and asserts byte-identical output.
