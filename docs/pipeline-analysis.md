# Full Pipeline Analysis: Edit Grammar + Edit Director

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Library Dependencies](#library-dependencies)
3. [Key 1: Edit Grammar (`edit_grammar.py`)](#key-1-edit-grammar)
4. [Foundation: `reference_engine.py`](#foundation-reference_enginepy)
5. [Key 2: Edit Director (`edit_director.py`)](#key-2-edit-director)
6. [Data Flow Between Key 1 and Key 2](#data-flow-between-key-1-and-key-2)
7. [Key 2: What Needs Tuning](#key-2-what-needs-tuning)
8. [Known Gaps](#known-gaps)

---

## Architecture Overview

The pipeline has three layers:

```
reference video  ──→  reference_engine.py  ──→  Key 1: edit_grammar.py  ──→  style profile (JSON)
                                                                                      ↓
                                                                           Key 2: edit_director.py
                                                                                      ↓
                                                                               MonetEDL (JSON)
                                                                                      ↓
                                                                           render_edl_to_video()
                                                                                      ↓
                                                                                 MP4 output
```

**Key principle**: CV measures, LLM interprets, director decides. The three layers are:

1. **reference_engine.py** (1091 lines) — Heavy computer vision analysis of a reference video. Extracts every measurable editing decision: cuts, transitions, camera motion, color, speed ramps, text overlays, audio events. Returns a `ReferenceStyleProfile` (pydantic model).

2. **Key 1: edit_grammar.py** (792 lines) — Takes a reference video (or reuses a `ReferenceStyleProfile`), runs per-shot CV extraction + per-shot LLM reasoning, aggregates into a video grammar, then combines N videos into a reusable style profile. Output is a plain JSON dict.

3. **Key 2: edit_director.py** (1338 lines) — Takes raw footage + a style profile → segments footage → scores candidate cut points → assembles a shot sequence → places overlays → builds MonetEDL → renders to MP4 via 4-pass ffmpeg.

---

## Library Dependencies

| Library | Used In | Purpose |
|---|---|---|
| **ffmpeg / ffprobe** (subprocess) | All 3 files | Scene detection (`select='gt(scene,0.3)'`), video metadata, raw frame extraction for color, final rendering with `xfade`, `noise`, `drawbox`, `rgbashift`, `amix`, `acrossfade`, `overlay`, `crop`, `scale`, `setpts`, `atempo` |
| **librosa** | `director.py`, `reference_engine.py`, `edit_grammar.py` | Beat tracking (`beat_track`), onset detection (`onset_detect`), percussive/harmonic separation (`hpss`), spectral centroid, onset strength, RMS energy |
| **numpy** | All 3 files | Array ops for motion rank-normalization, energy curve math, duration statistics, random sampling for effects |
| **Pillow (PIL)** | `director.py` | Text overlay PNG generation (RGBA composite with black rounded-rect background + white text) |
| **pydantic** | `reference_engine.py` | `CutPoint`, `SegmentStyle`, `ColorSignature`, `AudioEvent`, `ReferenceStyleProfile` data models |
| **Groq (llama-3.3-70b)** via `LLMClient` | `director.py`, `edit_grammar.py` | Ambiguity resolution between similarly-scored cuts (director); per-shot editing role interpretation (grammar) |
| **Custom analyzers** (`scripts/analyzers/`) | `reference_engine.py` | `effect_detector`, `speed_ramp_detector`, `text_detector` (OCR), `composite_detector`, `motion_analyzer` (optical flow), `edit_events_analyzer`, `llm_analyzer` |

---

## Key 1: Edit Grammar (`edit_grammar.py`)

### What It Does

Decomposes a reference video's editing style into a structured, machine-readable "grammar" — per-shot CV measurements + per-shot LLM interpretations → aggregated into a portable style profile that Key 2 consumes.

### Data Models (lines 30-101)

Three schemas defined as dict annotations (not enforced at runtime):

1. **`SHOT_CV_SCHEMA`** — Determinstic measurements per shot:
   - `start_ts`, `end_ts`, `duration` (float)
   - `cut_type` (str): `hard_cut | crossfade | whip_pan | zoom_transition | jump_cut`
   - `motion_energy` (0-1): rank-normalized optical flow magnitude
   - `audio_onset_aligned` (bool): cut within 0.1s of a beat?
   - `onset_offset_ms` (float): how far from nearest beat
   - `text_overlay` (dict): `{present, content, bbox}`
   - `loudness_db` (float): RMS→dB per shot

2. **`SHOT_LLM_SCHEMA`** — Interpreted by Groq per shot:
   - `energy_label`: `low | mid | high | peak`
   - `pacing_role`: `establish | build | peak | release | punchline`
   - `cut_reason`: narrative explanation
   - `shot_type`: `closeup | wide | tracking | aerial | ...`
   - `narrative_function`: `hero_shot | action | reaction | transition | ...`
   - `confidence`: 0-1

3. **`VIDEO_GLOBAL_STATS_SCHEMA`** — Video-level aggregations:
   - Shot duration statistics (avg, median, stddev)
   - `cut_to_beat_alignment_rate`
   - `energy_curve` (40 samples)
   - Text overlay count + avg duration

### Function-by-Function Breakdown

#### `_get_cut_type(shot_start, transitions)` (line 108)
Maps a transition event name (from `reference_engine`'s edit event analysis) to one of 5 canonical types:
```python
CUT_TYPE_MAP = {
    "crossfade", "fade_to_black", "fade_from_black", "fade_to_white",
    "fade_from_white", "blur_transition" → "crossfade"
    "whip_pan", "slide", "spin" → "whip_pan"
    "zoom_transition" → "zoom_transition"
    "glitch", "flash_white", "flash_black" → "jump_cut"
    "wipe" → "crossfade"
    "cut" → "hard_cut"
}
```
Finds the nearest transition within 0.5s of shot start. Falls back to `hard_cut`.

#### `_compute_shot_motion(shot_start, shot_end, motion_data)` (line 139)
Averages optical flow magnitude over the shot from pre-computed `motion_data` (sampled at 10fps). Returns raw float (later rank-normalized).

#### `_compute_onset_alignment(shot_start, beats)` (line 148)
Finds nearest beat, returns `(aligned: bool, offset_ms: float)` where aligned = offset < 0.1s.

#### `_get_shot_text(shot_index, per_shot_text)` (line 159)
Looks up per-shot OCR results (from `text_detector`). Returns `{present, content, bbox}`.

#### `_compute_shot_loudness(shot_start, shot_end, audio_y, sr)` (line 175)
RMS→dB conversion: `20*log10(sqrt(mean(chunk^2)))`. Silent chunks clamp to -60dB.

#### `extract_per_shot_cv()` (line 190) — the CV loop
For each shot in the edit zone:
1. Clls all 5 above functions
2. **Motion rank-normalization** (lines 222-229): raw motion values are sorted, converted to CDF percentile (rank/n), then blended 70% rank + 30% min-max normalized. This ensures the most energetic shot in the video always gets ~1.0 and the least gets ~0.0, regardless of absolute motion magnitudes.

```python
# Rank normalization:
sorted_vals = np.sort(arr)
ranks = np.searchsorted(sorted_vals, arr) / max(len(arr), 1)
raw_norm = (arr - arr.min()) / max(arr.max() - arr.min(), 1e-6)
motion_norm = ranks * 0.7 + raw_norm * 0.3
```

#### `reason_per_shot_llm()` (line 299) — LLM per shot
For each shot, sends a prompt with the shot's CV dict to Groq (via `llm_client`). Returns structured JSON matching `SHOT_LLM_SCHEMA`. Falls back to `_heuristic_shot_llm()` if LLM unavailable.

The heuristic (lines 355-442) uses a weighted formula:
```python
energy_score = me * 0.5 + (0.2 if aligned) + (0.2 if loud) + (0.15 if transition cut)
```
Then maps to energy_label by thresholds (>0.7, >0.45, >0.25). Pacing_role is determined by index position (first=establish, last=punchline, middle=build).

#### `aggregate_video_grammar()` (line 465) — per-video aggregation
Merges CV + LLM into a single dict per shot. Computes global stats:
- Shot duration statistics
- Beat alignment rate
- Text overlay count + durations
- Energy curve (40 samples from energy curve)
- Shots list with merged `{shot_id, video_id, index, cv, llm}`

#### `build_style_profile()` (line 553) — the final artifact
Aggregates N video grammars into a reusable profile. The profile dict is what Key 2 consumes:

```python
{
    "profile_id": str,
    "creator_handle": str,
    "videos_analyzed": int,
    "last_updated": str,
    "pacing": {
        "avg_shot_duration": float,
        "shot_duration_distribution": "right_skewed_short" | "uniform",
        "cut_to_beat_alignment_rate": float,
        "energy_curve_shape": "spike_then_release" | "steady_build" | "sawtooth" | "flat",
        "opens_with": str,
        "closes_with": str,
    },
    "text_overlay": {
        "frequency_per_minute": float,
        "typical_duration": float,
        "typical_role": "context_setup",
    },
    "transition_preferences": {
        "hard_cut": float,
        "crossfade": float,
        "whip_pan": float,
        "zoom_transition": float,
        "fade_to_black": float,
    },
    "confidence_notes": str,
}
```

#### `analyze_edit_grammar()` (line 649) — main entry
Full pipeline for one video:
1. Load or compute `ReferenceStyleProfile` (calls `reference_engine.analyze_reference_style()`)
2. Detect edit zone via `detect_edit_zone()`
3. Extract shots + transitions + motion data + beats + text
4. Compute per-shot CV
5. Rune per-shot LLM (Groq or heuristic)
6. Aggregate into video grammar
7. Return grammar dict

### Energy Curve Shape Classification (line 522)

Three patterns detected from the 40-sample energy curve:

1. **`spike_then_release`**: max of first third > max of rest * 1.2
2. **`steady_build`**: mean of second half > mean of first half * 1.15
3. **`sawtooth`**: >20% of points are local maxima (more than neighbors)

---

## Foundation: `reference_engine.py`

### What It Does

The heavy-lifting analysis engine. Takes a reference video and extracts EVERY measurable editing decision into a `ReferenceStyleProfile`. Used by Key 1 as its data source.

### Function-by-Function

#### `get_video_info(path)` (line 253)
ffprobe JSON extraction for duration, resolution, fps.

#### `detect_cuts(video_path, threshold=0.3)` (line 267)
ffmpeg scene detection using `select='gt(scene,0.3)'`. Returns `CutPoint` list with time, confidence, score.

#### `extract_segment_color(video_path, start, duration)` (line 292)
Extracts a single frame at mid-point via ffmpeg rawvideo (64×64 rgb24), computes:
- **Brightness**: mean of all pixel values / 255
- **Contrast**: stddev of luminance (Y = 0.299R + 0.587G + 0.114B)
- **Saturation**: mean of `(max(RGB) - min(RGB)) / max(RGB)` per pixel
- **Hues**: per-pixel hue angle in degrees

#### `detect_camera_motion()` (line 346)
Uses `motion_analyzer.analyze_motion()` optical flow on the segment → `classify_camera_motion()` returns static/pan/zoom/handheld/orbit.

#### `extract_beats(video_path)` (line 368)
librosa beat tracking → BPM + beat timestamps list.

#### `extract_audio_events(video_path, beats)` (line 388) — THE DISCONNECTED FUNCTION
This is the most sophisticated audio analysis in the pipeline. It:

1. **Percussive/harmonic separation** via librosa `hpss()` — splits audio into `y_perc` (drums, impacts) and `y_harm` (melody, vocals)
2. **Onset detection on percussive component** → onset frames + onset strength
3. **Full-mix STFT** for spectral features
4. **Mid-band energy** (300-3000 Hz) — catches punch transients
5. **Sub-bass energy** (<200 Hz) — for bass drops
6. **Percussive RMS** — how sharp the hit is

Classification rules:
```python
punch_impact: mid > 0.5 AND strength > 0.5 AND 300 < centroid < 4000
bass_drop:    sub > 0.6 AND centroid < 2000
beat_accent:  on_beat AND strength > 0.3
sfx_hit:      (fallback)
```

Returns `AudioEvent` list with time, type, confidence, energy, spectral_centroid.

#### `detect_edit_zone(cuts, duration)` (line 506)
Sliding window (5s, stride 0.5s) cut density analysis:
1. Compute cuts/second per window
2. Threshold at max(40% of peak density, 0.3 cuts/s)
3. Merge hot zones with gaps <3s
4. Return the longest contiguous zone

This auto-detects where the actual editing action is, trimming padding at start/end.

#### `analyze_reference_style()` (line 556) — THE MAIN ANALYSIS
Complete pipeline for one reference video:

1. Video info + detect cuts
2. Detect edit zone
3. Build shots from cuts, filter to edit zone
4. Rune ALL detector passes:
   - `effect_detector`: per-shot effects (blur, vignette, glow, shake, etc.)
   - `text_detector`: OCR text detection per shot
   - `speed_ramp_detector`: frame-differencing for speed changes
   - `composite_detector`: multi-panel layouts
   - `edit_events_analyzer`: transition type per cut
5. Optical flow analysis (once, shared by all segments)
6. Beat extraction + audio event extraction
7. Build `SegmentStyle` per shot with all extracted data
8. Compute rhythm metrics (avg shot, variance)
9. Classify cut-beat alignment (strict >70%, loose, none)
10. Build energy curve (40 buckets: 40% cut density + 60% audio RMS)
11. Determine pacing type (aggressive <1s, fast <2s, medium <3s, slow)
12. Build effect/transition vocabularies
13. Build `ColorSignature` from accumulated hue distribution
14. Camera motion distribution, speed patterns
15. **LLM deep analysis** via `analyzers.llm_analyzer.analyze_with_llm()` (auto-selects provider)

Returns `ReferenceStyleProfile` pydantic model.

#### `apply_reference_style()` (line 900) — OLD STYLE APPLICATION
Legacy function that directly applies reference to footage by:
1. Scaling reference segments to target duration
2. Per-segment: trim + eq filters (brightness/contrast/saturation) + speed + scale
3. Concat all segments with final color grade

This is the pre-Key-2 approach. It's much simpler and less sophisticated than the Key 2 pipeline.

### `ReferenceStyleProfile` Model (line 194)

```python
class ReferenceStyleProfile(BaseModel):
    source_path: str
    duration: float
    fps: float
    resolution: tuple[int, int]
    total_cuts: int
    avg_shot_duration: float
    shot_duration_variance: float
    bpm: float
    beats: list[float]
    cut_alignment: str  # strict, loose, none
    audio_events: list[AudioEvent]     # ← HAS THIS
    segments: list[SegmentStyle]       # ← HAS brightness/contrast/saturation per shot
    color_signature: ColorSignature
    energy_curve: list[float]
    climax_position: float
    pacing_type: str
    effect_vocabulary: list[str]
    transition_vocabulary: list[str]
    avg_transition_duration: float
    camera_motion_distribution: dict[str, float]
    avg_speed: float
    speed_variance: float
    edit_events: dict
    text_overlay_summary: dict
```

---

## Key 2: Edit Director (`edit_director.py`)

### What It Does

Takes raw footage + style profile → score-based shot selection → MonetEDL → rendered MP4. This is the "application" layer that actually produces new edits.

### Function-by-Function

#### `detect_candidate_cuts(footage_path, min_shot, max_shot)` (line 33)

Three sources of potential cut points, merged and deduped:

| Source | Method | Score | Density |
|---|---|---|---|
| Scene changes | ffmpeg `select='gt(scene,0.3)'` | 0.8 | Lowest |
| Beats | librosa `beat_track` | 0.7 | Medium |
| Onsets | librosa `onset_detect` | 0.5 | Highest |

Dedup: all candidate times rounded to 0.01s, duplicates discarded by source priority (scene > beat > onset).

Returns `candidates: [{time, score, source}]`, plus `extra` dict with duration, fps, width, height, bpm, beats.

#### `score_candidate(candidate_time, prev_cut_time, ...)` (line 159)

Three weighted scoring dimensions, all normalized 0-1:

**1. Duration fit (40%)**: Hillside function centered on profile's `avg_shot_duration`:
- <50% of preferred: linear penalty (ratio → 0)
- 50-200% of preferred: inverse absolute deviation, peak at 1x
- >200% of preferred: fast decay (max 0 at ~4x)

```python
duration_ratio = duration / pref_shot_dur
if ratio < 0.5:     score = ratio
elif ratio > 2.0:   score = max(0, 1.0 - (ratio - 2.0) * 0.5)
else:               score = 1.0 - abs(1.0 - ratio) * 0.5
```

**2. Beat alignment (35% weighted)**: Distance to nearest beat:
- <0.05s → 1.0
- <0.15s → 0.6
- otherwise → max(0, 1 - 2*offset)

Blended with profile's alignment rate:
```python
beat_weight = 0.3 + alignment_rate * 0.4
beat_score_weighted = beat_score * beat_weight + 0.5 * (1 - beat_weight)
```

**3. Energy curve fit (25%)**: Expected energy from curve shape at video progress:
- `spike_then_release`: peak at 30% progress, decay to both sides
- `steady_build`: linear 0→1 with progress
- `sawtooth`: `0.5 + 0.5*sin(progress * π * 4)` — oscillates 4 times
- Long shots low energy, short shots high energy

```python
if expected > 0.6:    energy_score = max(0, 1 - duration/pref_dur)  # prefer short
elif expected < 0.3:  energy_score = min(1, duration/pref_dur)      # prefer long
else:                 energy_score = 0.5
```

**Total**: `duration*0.4 + beat_weighted*0.35 + energy*0.25`

#### `resolve_ambiguity(candidate_a, candidate_b, ...)` (line 268)

When two candidates score within Δ<0.1, asks LLM (Groq) for tiebreak. Falls back to heuristic:
1. Prefer better beat alignment (if Δ>0.1)
2. Prefer better duration fit

Returns `{choice: "A"|"B", reason, confidence}`.

#### `assemble_sequence()` (line 347) — THE CORE ENGINE

**Algorithm: Greedy with lookahead**

1. Estimate shot count: `target_duration / avg_shot_duration`
2. Filter candidates outside [min_shot, target_duration - min_shot]
3. Per-shot loop:
   a. Compute window: [prev_time + min_shot, min(target, prev_time + max_shot)]
   b. Gather candidates in window
   c. If none: synthesize a cut at ideal position
   d. If candidates: score first N (lookahead = max(3, total_shots//4))
   e. Sort by total_score, resolve ambiguity if Δ<0.1
   f. Sample cut_type from profile's transition_preferences distribution
   g. Assign speed ramp (energy>0.65: 1.3-2.0x, energy<0.3: 0.6-0.85x)
   h. Assign camera shake (0.2<energy<0.6: 2-6px at 30%)
   i. Append shot dict
4. Beat-snapping post-pass: snap cuts within 0.08s of a beat
5. Clamp last shot to target_duration

**Key observations**:
- Energy-based speed/shake is NOT using the footage's actual motion — it's using the synthetic `expected_energy` from the math curve
- Cut_type is sampled independently per shot (Markov property assumed)
- The lookahead prevents the greedy from going too local but is still short-sighted

#### `place_overlays(shots, profile, total_duration, source_shots)` (line 531)

Post-cut sequence pass:
1. Compute overlay count from `frequency_per_minute * duration / 60`
2. Determine placement zone from `typical_role`:
   - `context_setup`: first 30% of video
   - `punchline`: last 30%
   - otherwise: everywhere
3. Prefer shots with `expected_energy < 0.6`
4. Place overlays evenly spaced across eligible shots
5. Text content from `source_shots` time-overlap (empty if not provided)

#### `build_edl()` (line 632)

Converts shot list + overlays into MonetEDL-JSON:
- Video track: clips with `{id, mediaId, startTime, duration, inPoint, outPoint, speed, shake, transforms, audio, effects, meta{cut_type}}`
- Audio track: single continuous clip
- Text track (if overlays): clips with meta `{text_content, position, animation, role}`
- Beat markers
- {media, audio, overlays} assets

The EDL matches TypeScript interface at `packages/edl/src/schemas.ts`:
```typescript
interface ProjectEDL {
    version: number;
    id: string;
    meta: { createdAt, updatedAt, aspectRatio, fps, sampleRate, analysisId };
    timeline: { duration, tracks: Track[], markers: Marker[] };
    assets: { media: Record<string, MediaAsset>, audio, overlays };
}
```

#### `render_edl_to_video()` (line 993) — 4-PASS RENDER

**Pass 1: Transition chain** (single complex filtergraph)

Per-shot trimming with setpts (speed ramp) + crop (shake) + scale → chain via xfade:

```
[0:v]trim=start=X:duration=Y,setpts=PTS-STARTPTS/1.5,
     crop=iw-4:ih-4:x='2+2*sin(2*PI*t*12+0)':y='2+2*sin(2*PI*t*9+0)',
     scale=1280:720[v0]
[v0][v1]xfade=transition=fade:duration=0.4:offset=2.1[o1]
[o1][v2]xfade=transition=slideleft:duration=0.25:offset=4.7[o2]
```

Transition durations per type:
| Type | Duration |
|---|---|
| hard_cut | 0.04s |
| crossfade | 0.4s |
| zoom_transition | 0.35s |
| whip_pan | 0.25s |
| fade_to_black | 0.5s |

Audio: per-shot `atrim` + `asetpts` + `atempo` (if speed != 1) → `acrossfade` chain.

**Fallback**: If xfade fails (resolution mismatch or ffmpeg version issue), falls back to per-shot segment render + concat.

**Pass 2: Glitch overlay** (second ffmpeg command)

At each non-hard-cut transition time, applies three filters:
- `drawbox=color=white:t=fill`: white flash (starts 0.02s before transition)
- `noise=alls=N:allf=t`: static overlay
- `rgbashift=rh=N:gh=0:bh=-N`: RGB channel displacement

Params vary by transition type:

| Type | Flash | Noise Level | Noise Dur | RGB Shift | RGB Dur |
|---|---|---|---|---|---|
| crossfade | 0.04s | 60 | 0.04s | 12px | 0.06s |
| zoom_transition | 0.06s | 90 | 0.08s | 20px | 0.10s |
| whip_pan | 0.02s | 40 | 0.03s | 8px | 0.04s |
| fade_to_black | 0.03s | 50 | 0.05s | 15px | 0.07s |

**Pass 3: Text overlays** (third ffmpeg command)

PIL-generated RGBA PNG (black semi-transparent rect + white text) → `loop=-1:size=1` → `overlay=10:H-H-10:shortest=1:enable='between(t,start,end)'`.

**Pass 4: Music mix** (fourth ffmpeg command, optional)

Volume ducking via expression filter:
```
volume='if(between(t,1.5,3.0)+between(t,5.0,6.5), 0.04, 0.12)'
```
Then `amix=inputs=2:duration=first` with video stream copied. Duck windows come from text overlay times.

---

## Data Flow Between Key 1 and Key 2

### What flows through (the style profile)

```json
{
  "pacing": {
    "avg_shot_duration": 1.8,
    "cut_to_beat_alignment_rate": 0.65,
    "energy_curve_shape": "sawtooth",
    "opens_with": "low_energy_hook",
    "closes_with": "peak_hold"
  },
  "text_overlay": {
    "frequency_per_minute": 8.0,
    "typical_duration": 1.6,
    "typical_role": "context_setup"
  },
  "transition_preferences": {
    "hard_cut": 0.5,
    "crossfade": 0.2,
    "whip_pan": 0.15,
    "zoom_transition": 0.1,
    "fade_to_black": 0.05
  }
}
```

### What's extracted by `reference_engine.py` but DROPPED before Key 2

| Field | reference_engine | edit_grammar | profile → Key 2 |
|---|---|---|---|
| `audio_events` (punch/bass/beat/sfx) | ✓ extracted at line 834 | ✗ never read (line 690-748) | ✗ |
| Per-shot `brightness/contrast/saturation` | ✓ extracted per segment | ✗ not in `extract_per_shot_cv()` | ✗ |
| `color_signature` (global grade) | ✓ computed | ✗ not in `build_style_profile()` | ✗ |
| `effect_vocabulary` (blur/vignette/glow) | ✓ extracted | ✗ not in profile | ✗ |
| `camera_motion_distribution` | ✓ computed | ✗ not in profile | ✗ |
| `avg_speed` / `speed_variance` | ✓ computed | ✗ not in profile | ✗ |
| Full `energy_curve` (40 samples) | ✓ computed | ✗ only shape name passes through | ✗ |
| Per-shot `text_content` (OCR results) | ✓ extracted | ✓ in video grammar | ✓ (but only as `source_shots` optional param) |

---

## Key 2: What Needs Tuning

### 1. Scoring weights are arbitrary

```python
total_score = duration_score * 0.4 + beat_score_weighted * 0.35 + energy_score * 0.25
```
These weights are hardcoded guesses. The profile carries enough data (shot_duration_stddev, alignment_rate, energy_curve) to derive them statistically:
- If reference has high variance in shot durations → weight duration_score lower (it's chaotic)
- If reference has strict beat alignment → weight beat_score higher
- The relative importance should be learned from the reference's own statistics

### 2. Energy curve is synthetic, not from reference

Key 2 reconstructs the energy curve from the shape NAME:
```python
if energy_curve == "sawtooth":
    expected_energy = 0.5 + 0.5 * math.sin(progress * math.pi * 4)
```
But `reference_engine` already computed the actual 40-sample energy curve. The profile just doesn't carry it. Fix: pass the `energy_curve` list through the profile and sample it at matching progress points instead.

### 3. Transition sampling is stateless (no sequence structure)

Each shot's `cut_type` is independently sampled from the transition_preferences distribution:
```python
rand = np.random.random()
for ct, prob in cut_choices:
    cumulative += prob
    if rand < cumulative: cut_type = ct; break
```
But real edits don't work this way — transitions cluster. A reference might:
- Open with 3 crossfades in a row (establishing shots)
- Peak with 8 hard cuts in a row (action sequence)
- Close with a fade_to_black
The transition type depends on narrative context, not just probability.

### 4. Cut_type is assigned to the wrong shot

In `assemble_sequence()` line 490, the sampled `cut_type` is stored on the CURRENT shot:
```python
shots.append({"cut_type": cut_type, ...})
```
But in `render_edl_to_video()` line 1093, it's read as the transition OUT OF the previous clip:
```python
cut_type = clips[i-1]["meta"]["cut_type"]
```
This means the first shot's cut_type becomes the transition from clip 0 → clip 1, the second shot's type becomes clip 1 → clip 2, etc. The mapping is off by one index. For the first transition (0→1), `cut_types[0]` is used which is the first shot's type — but the first shot's type was supposed to describe the transition INTO it.

### 5. Speed ramps barely fire

With `>0.65` and `<0.3` thresholds, most `expected_energy` values fall in the middle band (0.3-0.65):
- `sawtooth`: oscillates between 0-1, so ~30% land in high band, ~30% in low, ~40% mid
- `steady_build`: progressive 0→1, so only the last ~35% of shots hit high band, first ~30% hit low
- `spike_then_release`: peaks at 30% progress, decays — wider spread

For a 15s video with 8 shots on `sawtooth`: each shot's progress point maps to a sine value. 8 samples isn't enough to reliably land outside [0.3, 0.65].

Fix: widen bands to `>0.55` / `<0.35`, or use z-score (how many stddevs from this video's mean energy), or derive from the actual reference energy curve.

### 6. Beat snapping can undo scoring

After `assemble_sequence` carefully selects cuts optimized for 3 weighted criteria, `beat-snapping` moves them by up to 0.08s (line 515). This shifts the cut from the optimal position to a less-optimal one, potentially undoing the energy curve fit. The scoring already includes beat alignment (35% weight) — the post-pass is redundant and destructive.

Fix: Remove beat-snapping post-pass. Beat alignment is already baked into the scoring function.

### 7. Shake dimensions are hardcoded

```python
width = 1280
height = 720
```
The shake effect crops `iw-N:ih-N` and scales to 1280:720. If footage is 1920×1080, the aspect ratio changes slightly (1916×1076 scaled to 1280:720 = 1.778 vs original 1.778 — actually the same, but the math is fragile). For non-16:9 footage, this distorts.

### 8. Text overlays are always empty

`_find_text_for_time()` returns `""` when `source_shots` is not passed. In normal CLI usage, `source_shots` defaults to `None`:
```python
overlays = place_overlays(shots, profile, target_duration, source_shots=None)
```
The `--render` CLI flag doesn't propagate source_shots either. So overlays always have `content: ""`, and the render still creates duck windows at those positions.

### 9. Music ducking ducks at empty times

Since overlays are always empty (content = ""), the duck windows still exist — music volume drops to 0.04 at arbitrary points (0.1s, 3.3s in the test run) for no reason. The ducking should only happen when there's actual text content, or the duck times should come from somewhere meaningful (like audio events or beat accents).

### 10. Music mix loses original audio dynamics

`amix=inputs=2:duration=first` mixes edit audio (volume 1.0) with music (volume 0.12). But the reference's audio profile has per-shot `loudness_db` and `audio_events` with classified impact types. None of this informs the mix:
- Punch impacts in the footage could trigger a music transient
- Low-energy sections could have music brought up
- Beat accents could be reinforced by the beat track

### 11. Reference color is extracted but not applied

`reference_engine.py` computes per-segment `brightness/contrast/saturation` and a global `ColorSignature`, but the profile doesn't carry this data. Key 2 could use it to color-grade each shot to match the reference's look — but the data is lost between the two pipelines.

### 12. `xfade` fallback is silent

When the xfade chain fails (line 1066-1067), `result.returncode != 0` triggers a concat fallback, but the error message is swallowed. The stderr is available but not logged. This makes debugging render failures difficult.

### 13. No audio crossfade for hard cuts

Hard cuts use `fade_dur=0.04` for both video and audio. For video this is essentially a frame-blend. For audio it's a 40ms acrossfade which is basically inaudible but adds a tiny glitch. Hard cuts should pass audio through without any crossfade.

### 14. Transition times tracking bug

`transition_times` (used for glitch overlay timing) is tracked as the xfade `offset` value:
```python
off = chain_dur_before - fade_dur
transition_times.append(off)
```
But `off` is in the first input's timeline, not the output timeline. Since xfade overlaps inputs, the output time of the transition start is actually `off - total_overlap_before`. The glitch flash happens at the wrong time when multiple transitions are chained.

---

## Known Gaps

### Audio event pipeline break
`reference_engine.extract_audio_events()` is the most sophisticated audio analysis in the codebase (hpss separation + spectral classification into 4 event types), but nothing downstream reads it. The full chain from extraction to Key 2 consumption is broken.

### No color grade pass-through
The reference's per-shot brightness/contrast/saturation and global color signature are computed but never reach the profile or the render. Color grading is a manual step the user would have to add.

### No effect vocabulary flow-through
The reference's effect vocabulary (blur, vignette, glow, grain, shake, rgb_split) is extracted but not passed to the profile. Key 2 can't apply reference-matching effects.

### No camera motion matching
The reference's camera motion distribution (static, pan, zoom, handheld, orbit) is computed but not in the profile. Key 2 can't prefer cuts that match the reference's camera work.

### Speed variance not used
The reference's `avg_speed` and `speed_variance` are computed but not in the profile. Key 2's energy-based speed assignment is a heuristic with no reference grounding.

### Per-shot text from reference not piped through
The reference OCR results are in `SegmentStyle.text_content` but only reach Key 2 via the optional `source_shots` parameter, which is never set in normal CLI usage.

### No reference audio for beat matching
Key 2 re-runs beat detection on the footage independently. The reference's BPM and beat structure are in the profile but only used for the `alignment_rate` scalar — the actual beat timings aren't warped to match.
