# EDL Generator Fix — Reference Grammar → Footage Content

## The Bug

The EDL generator was copying the reference video's timeline onto the user's footage instead of generating a NEW edit driven by the reference's STYLE applied to the footage's CONTENT.

## What Changed

### 1. `scripts/analyzers/footage_analyzer.py` — Improved segment ranking

```python
"""
Footage Analyzer
Analyzes the USER'S footage to find its own segments, motion peaks,
semantic events, and beat alignment.

This is separate from the reference DNA — the reference provides STYLE,
the footage provides CONTENT.
"""

import json
import os
import subprocess
import tempfile
import logging
from typing import Dict, List

from llm_provider import call_vision_llm

logger = logging.getLogger(__name__)


def analyze_footage(video_path: str, music_path: str = None) -> Dict:
    """
    Analyze user footage to extract segments, motion, semantics, beats.
    Returns footage_analysis dict with: segments[], beats[], motion_peaks[].
    """
    print("\n  Analyzing footage for edit segments...")
    
    info = _get_video_info(video_path)
    
    # 1. Detect natural scene cuts in footage (higher threshold to avoid 200 tiny segments)
    print("    [1/5] Detecting footage cuts...")
    threshold = 0.25 if info["duration"] > 30 else 0.15
    cuts = _detect_cuts(video_path, threshold=threshold)
    cut_times = [0] + [c["time"] for c in cuts] + [info["duration"]]
    
    segments = []
    for i in range(len(cut_times) - 1):
        start = cut_times[i]
        end = cut_times[i + 1]
        dur = end - start
        if dur < 0.05:
            continue
        segments.append({
            "index": len(segments),
            "start": start,
            "end": end,
            "duration": dur,
        })
    print(f"    Found {len(segments)} footage segments")
    
    # 2. Analyze motion per segment
    print("    [2/5] Analyzing motion...")
    from motion_analyzer import analyze_motion, compute_motion_stats
    motion_data = analyze_motion(video_path, fps=5.0)
    
    motion_peaks = []
    for seg in segments:
        seg_motion = [m for m in motion_data if seg["start"] <= m["time"] <= seg["end"]]
        if seg_motion:
            stats = compute_motion_stats(seg_motion)
            seg["motion_magnitude"] = stats["avg_magnitude"]
            seg["motion_peak"] = stats["peak_magnitude"]
        else:
            seg["motion_magnitude"] = 0
            seg["motion_peak"] = 0
        
        # Track motion peaks (top 20% by peak magnitude)
        motion_peaks.append({
            "time": seg["start"] + seg["duration"] / 2,
            "magnitude": seg["motion_peak"],
        })
    
    # 3. Classify shot types for each segment
    print("    [3/5] Classifying shot types...")
    from shot_type_classifier import classify_shot_type
    shot_type_results = classify_shot_type(video_path, segments)
    for i, seg in enumerate(segments):
        if i < len(shot_type_results):
            seg["shotType"] = shot_type_results[i]["shotType"]
        else:
            seg["shotType"] = "medium"
    
    # 4. Semantic analysis per segment (batch via LLM)
    print("    [4/5] Semantic analysis of footage...")
    _analyze_footage_semantics(video_path, segments)
    
    # 5. Detect beats from music
    print("    [5/5] Detecting beats...")
    beats = []
    if music_path and os.path.exists(music_path):
        from beat_detector import detect_beats
        audio_tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run([
            "ffmpeg", "-y", "-i", music_path, "-vn",
            "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", audio_tmp
        ], capture_output=True, timeout=30)
        
        if os.path.exists(audio_tmp) and os.path.getsize(audio_tmp) > 1000:
            beat_result = detect_beats(audio_tmp)
            beats = beat_result.get("beats", [])
            print(f"    Music: {beat_result.get('tempo_bpm', 0):.0f} BPM, {len(beats)} beats")
        os.remove(audio_tmp)
    elif info.get("has_audio"):
        # Extract audio from footage itself
        audio_tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path, "-vn",
            "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", audio_tmp
        ], capture_output=True, timeout=30)
        
        if os.path.exists(audio_tmp) and os.path.getsize(audio_tmp) > 1000:
            from beat_detector import detect_beats
            beat_result = detect_beats(audio_tmp)
            raw_beats = beat_result.get("beats", [])
            beats = [b["time"] if isinstance(b, dict) else b for b in raw_beats]
            print(f"    Audio: {beat_result.get('tempo_bpm', 0):.0f} BPM, {len(beats)} beats")
        os.remove(audio_tmp)
    
    # Rank segments by combined score
    _rank_segments(segments, beats)
    
    return {
        "segments": segments,
        "beats": beats,
        "motion_peaks": motion_peaks,
        "duration": info["duration"],
        "resolution": {"width": info["width"], "height": info["height"]},
        "fps": info["fps"],
    }


def _get_video_info(path: str) -> dict:
    """Get video metadata."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        fmt = data.get("format", {})
        video = next((s for s in data.get("streams", []) if s["codec_type"] == "video"), None)
        audio = next((s for s in data.get("streams", []) if s["codec_type"] == "audio"), None)
        fps = 30
        if video and video.get("r_frame_rate"):
            try:
                n, d = video["r_frame_rate"].split("/")
                fps = int(n) / int(d)
            except:
                pass
        return {
            "duration": float(fmt.get("duration", 0)),
            "width": video.get("width", 0) if video else 0,
            "height": video.get("height", 0) if video else 0,
            "fps": fps,
            "has_audio": audio is not None,
        }
    except:
        return {"duration": 0, "width": 0, "height": 0, "fps": 30, "has_audio": False}


def _detect_cuts(video_path: str, threshold: float = 0.15) -> list:
    """Detect cut points in footage."""
    import re
    try:
        result = subprocess.run([
            "ffmpeg", "-hide_banner", "-y", "-i", video_path,
            "-vf", f"select='gt(scene,{threshold})',showinfo",
            "-vsync", "vfr", "-f", "null", "-"
        ], capture_output=True, text=True, timeout=120)
        
        cuts = []
        for line in result.stderr.split("\n"):
            if "showinfo" in line and "pts_time" in line:
                pts_match = re.search(r'pts_time:(\S+)', line)
                score_match = re.search(r'lavfi\.scene_score=(\S+)', line)
                if pts_match:
                    cuts.append({
                        "time": float(pts_match.group(1)),
                        "score": float(score_match.group(1)) if score_match else 0,
                    })
        return cuts
    except:
        return []


def _analyze_footage_semantics(video_path: str, segments: list):
    """Run LLM semantic analysis on footage segments."""
    import tempfile
    
    # Extract middle frame for each segment
    tmpdir = tempfile.mkdtemp(prefix="footage-sem-")
    frames = {}
    
    for seg in segments[:20]:
        mid = seg["start"] + seg["duration"] / 2
        out = os.path.join(tmpdir, f"seg_{seg['index']:03d}.jpg")
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(mid), "-i", video_path,
            "-vframes", "1", "-q:v", "2", out
        ], capture_output=True, timeout=10)
        if os.path.exists(out):
            frames[seg["index"]] = out
    
    if not frames:
        for seg in segments:
            seg["semantic_importance"] = 5
            seg["semantic_event_type"] = "action"
            seg["semantic_emotion"] = "neutral"
            seg["semantic_description"] = ""
        return
    
    # Batch in chunks of 5
    BATCH = 5
    items = list(frames.items())
    chunks = [items[i:i+BATCH] for i in range(0, len(items), BATCH)]
    
    import time as _time
    
    all_results = {}
    for chunk in chunks:
        chunk_dict = dict(chunk)
        chunk_segs = [s for s in segments if s["index"] in chunk_dict]
        
        prompt = _build_footage_prompt(chunk_segs)
        result = call_vision_llm(prompt, list(chunk_dict.values()))
        
        if result:
            parsed = _parse_footage_semantics(result, chunk_segs)
            all_results.update(parsed)
        
        _time.sleep(0.5)
    
    # Fill in defaults for segments without results
    for seg in segments:
        if seg["index"] in all_results:
            r = all_results[seg["index"]]
            seg["semantic_importance"] = r.get("importance", 5)
            seg["semantic_event_type"] = r.get("event_type", "action")
            seg["semantic_emotion"] = r.get("emotion", "neutral")
            seg["semantic_description"] = r.get("description", "")
        else:
            seg["semantic_importance"] = 5
            seg["semantic_event_type"] = "action"
            seg["semantic_emotion"] = "neutral"
            seg["semantic_description"] = ""
    
    # Cleanup
    for f in frames.values():
        if os.path.exists(f):
            os.remove(f)
    os.rmdir(tmpdir)


def _build_footage_prompt(segments: list) -> str:
    """Build prompt for footage semantic analysis."""
    seg_desc = []
    for s in segments:
        seg_desc.append(f"Segment {s['index']}: {s['start']:.1f}s-{s['end']:.1f}s ({s['duration']:.1f}s, {s.get('shotType','?')})")
    
    return f"""Analyze these video footage segments and rate each for editing potential.

SEGMENTS:
{chr(10).join(seg_desc)}

For each segment provide:
1. "importance": How visually interesting for an edit (1-10). Action/exciting moments score higher.
2. "event_type": What's happening (setup/action/reaction/celebration/transition)
3. "emotion": Emotional tone (excitement/tension/joy/neutral/calm)
4. "description": Brief 1-sentence description

Return ONLY a JSON array:
[{{"shotIndex": 0, "importance": 7, "event_type": "action", "emotion": "excitement", "description": "Player dribbles past defender"}}]"""


def _parse_footage_semantics(result: str, segments: list) -> dict:
    """Parse LLM response into segment semantics."""
    import re
    try:
        match = re.search(r'\[[\s\S]*\]', result)
        if match:
            events = json.loads(match.group())
            return {e.get("shotIndex", -1): e for e in events}
    except Exception as e:
        logger.warning(f"Footage semantics parse error: {e}")
    return {}


def _rank_segments(segments: list, beats: list):
    """
    Rank segments by combined score for editing potential.
    
    Scoring formula (total 0-1):
      35% semantic importance (1-10 from LLM)
      30% motion intensity (peak magnitude, normalized)
      20% beat proximity (distance to nearest music beat)
      15% duration fitness (penalize very short/long segments)
    """
    if not segments:
        return
    
    # Normalize motion across all segments for relative ranking
    max_motion = max((s.get("motion_peak", 0) for s in segments), default=1) or 1
    
    for seg in segments:
        # Semantic importance (1-10 → 0-1)
        sem_score = seg.get("semantic_importance", 5) / 10.0
        
        # Motion intensity (normalized against max in footage)
        motion_raw = seg.get("motion_peak", 0)
        motion_score = min(1.0, motion_raw / max_motion)
        
        # Beat proximity (closer to beat = higher, 200ms tolerance)
        beat_score = 0
        if beats and len(beats) > 0:
            min_dist = min(abs(seg["start"] - b) for b in beats)
            beat_score = max(0, 1.0 - min_dist / 0.3)
        
        # Duration fitness: penalize segments <0.5s or >4s
        dur = seg.get("duration", 1)
        if dur < 0.5:
            dur_score = dur / 0.5 * 0.5
        elif dur > 4.0:
            dur_score = max(0.3, 1.0 - (dur - 4.0) / 4.0)
        else:
            dur_score = 1.0
        
        # Combined score
        seg["edit_score"] = (
            sem_score * 0.35 +
            motion_score * 0.30 +
            beat_score * 0.20 +
            dur_score * 0.15
        )
    
    # Sort by edit score (best first)
    segments.sort(key=lambda s: s.get("edit_score", 0), reverse=True)
    
    # Log top 5 for debugging
    print(f"    Top segments by edit_score:")
    for seg in segments[:5]:
        print(f"      [{seg['index']}] {seg['start']:.1f}-{seg['end']:.1f}s "
              f"score={seg['edit_score']:.3f} "
              f"motion={seg.get('motion_peak',0):.3f} "
              f"sem={seg.get('semantic_importance',5)} "
              f"type={seg.get('shotType','?')}")
```

---

### 2. `scripts/monet_pipeline.py` — EDL generator with verification logging

```python
def generate_edl_from_dna(dna: dict, footage_path: str, music_path: Optional[str] = None) -> dict:
    """
    Generate MonetEDL by applying reference grammar to footage content.
    
    Algorithm:
    1. Calculate target clip count from reference's avgShotDuration
    2. Rank footage segments by motion + semantics + beat proximity
    3. Select top N segments matching reference's shotType distribution
    4. Order by narrative arc (establishing → building → climax → resolution)
    5. Snap cuts to music beats
    6. Apply reference effects, color grade, speed
    """
    footage_info = get_video_info(footage_path)
    footage_duration = footage_info["duration"]
    
    # Reference grammar rules
    ref_avg_dur = dna.get("avgShotDuration", 1.5)
    ref_shot_dist = dna.get("shotTypes", {}).get("distribution", {})
    ref_effects = dna.get("effects", {})
    ref_grade = dna.get("colorProfile", {}).get("grade", "normal")
    ref_speed = dna.get("speed", {}).get("avgSpeed", 1.0)
    ref_beats = dna.get("audioAnalysis", {}).get("beats", [])
    ref_rhythm = dna.get("rhythm", {})
    cuts_on_beat = ref_rhythm.get("cuts_on_beat", 0)
    
    # Target clip count based on reference pacing
    target_clips = max(4, int(footage_duration / ref_avg_dur)) if ref_avg_dur > 0 else 10
    print(f"  Target: {target_clips} clips @ {ref_avg_dur:.2f}s avg (footage: {footage_duration:.1f}s)")
    
    # Analyze FOOTAGE (not reference) — this is the content source
    footage_analysis = analyze_footage(footage_path, music_path)
    segments = footage_analysis["segments"]
    beats = footage_analysis["beats"]
    
    print(f"  Footage analysis: {len(segments)} segments, {len(beats)} beats, "
          f"{len(footage_analysis.get('motion_peaks', []))} motion peaks")
    
    if not segments:
        print("  Warning: No footage segments found, using whole clip")
        segments = [{"index": 0, "start": 0, "end": footage_duration, 
                      "duration": footage_duration, "shotType": "medium",
                      "motion_magnitude": 0, "edit_score": 5,
                      "semantic_importance": 5}]
    
    # Select top N segments ranked by edit_score (motion + semantics + beat proximity)
    selected = segments[:target_clips]
    print(f"  Selected {len(selected)} segments from footage (from {len(segments)} available)")
    
    # Re-sort by time for proper chronological ordering before arc reorder
    selected.sort(key=lambda s: s["start"])
    
    # Apply narrative arc ordering (establishing → building → climax → resolution)
    _apply_narrative_arc(selected, ref_shot_dist)
    
    # Log final clip order
    print(f"  Final clip order (narrative arc applied):")
    for i, seg in enumerate(selected):
        print(f"    Clip {i}: {seg['start']:.1f}-{seg['end']:.1f}s "
              f"({seg['duration']:.2f}s) type={seg.get('shotType','?')} "
              f"score={seg.get('edit_score',0):.3f}")
    
    # Snap to beats if reference is beat-driven
    if cuts_on_beat > 50 and beats:
        _snap_to_beats(selected, beats)
    
    # Build EDL clips
    clips = []
    
    # Calculate total effects to distribute across clips
    total_effects = ref_effects.get("totalEffects", 0)
    total_ref_shots = dna.get("totalShots", 1)
    effects_per_clip = total_effects / total_ref_shots if total_ref_shots > 0 else 0
    effect_types = list(ref_effects.get("effectTypes", {}).keys())
    # Remove 'none' if present
    effect_types = [e for e in effect_types if e != "none"]
    
    import random
    random.seed(42)  # Deterministic effect distribution
    
    for i, seg in enumerate(selected):
        # Duration: use segment's natural duration, scaled by reference pacing
        duration = seg["duration"]
        # Cap at reference avg * 1.5 to avoid overly long clips
        duration = min(duration, ref_avg_dur * 1.5)
        # Ensure minimum duration
        duration = max(duration, 0.1)
        
        # Importance from footage semantic analysis
        importance = seg.get("semantic_importance", 5)
        
        # Build effects (distribute proportionally from reference)
        effects = []
        if effects_per_clip > 0.5 and random.random() < min(effects_per_clip, 0.8):
            chosen_type = random.choice(effect_types) if effect_types else "blur"
            effects.append({
                "id": f"effect-{i}-{chosen_type}",
                "type": chosen_type,
                "start": 0,
                "duration": duration,
                "params": {},
            })
        
        # Transition: use reference's transition distribution
        clip_transition = None
        ref_transitions = dna.get("effects", {}).get("transitionTypes", {})
        if ref_transitions:
            # Pick a transition type weighted by reference frequency
            trans_types = list(ref_transitions.keys())
            trans_weights = list(ref_transitions.values())
            if trans_types and sum(trans_weights) > 0:
                chosen_trans = random.choices(trans_types, weights=trans_weights, k=1)[0]
                if chosen_trans != "cut":
                    clip_transition = {
                        "type": chosen_trans,
                        "duration": 0.15,
                    }
        
        # Speed from reference
        speed = ref_speed
        
        # Narrative role based on position
        position_ratio = i / max(1, len(selected) - 1)
        if position_ratio < 0.2:
            narrative_role = "establishing"
        elif position_ratio < 0.6:
            narrative_role = "building"
        elif position_ratio < 0.9:
            narrative_role = "climax"
        else:
            narrative_role = "resolution"
        
        clip = {
            "id": f"clip-{i:03d}",
            "mediaId": "footage-main",
            "startTime": seg["start"],
            "duration": duration,
            "inPoint": seg["start"],
            "outPoint": min(seg["start"] + duration, footage_duration),
            "speed": speed,
            "colorGrade": ref_grade,
            "transforms": {
                "position": [{"time": 0, "x": 0, "y": 0}],
                "scale": [{"time": 0, "value": 1}],
                "rotation": [{"time": 0, "value": 0}],
            },
            "audio": {"gain": 1},
            "effects": effects,
            "meta": {
                "shotType": seg.get("shotType", "medium"),
                "cameraMotion": "static",
                "subjectMotion": "running",
                "semanticEvent": {
                    "description": seg.get("semantic_description", ""),
                    "emotion": seg.get("semantic_emotion", "neutral"),
                    "event_type": seg.get("semantic_event_type", "action"),
                    "narrative_role": narrative_role,
                    "importance": importance,
                    "time": seg["start"],
                },
            },
        }
        
        if clip_transition:
            clip["transition"] = clip_transition
        
        clips.append(clip)
    
    # Calculate total duration
    total_duration = sum(c["duration"] for c in clips) if clips else 0
    
    # Build EDL
    edl = {
        "version": 1,
        "id": f"edl-{dna['name']}-{int(__import__('time').time())}",
        "meta": {
            "createdAt": int(__import__('time').time() * 1000),
            "updatedAt": int(__import__('time').time() * 1000),
            "aspectRatio": "1:1" if footage_info["width"] == footage_info["height"] else "9:16" if footage_info["height"] > footage_info["width"] else "16:9",
            "fps": footage_info["fps"],
            "sampleRate": 48000,
            "projectId": dna["name"],
            "renderMethod": "editly-full",
        },
        "assets": {
            "media": {
                "footage-main": {
                    "id": "footage-main",
                    "path": footage_path,
                    "duration": footage_duration,
                    "width": footage_info["width"],
                    "height": footage_info["height"],
                }
            },
            "audio": {},
            "overlays": {},
        },
        "timeline": {
            "duration": total_duration,
            "markers": [],
            "tracks": [
                {
                    "id": "video-main",
                    "type": "video",
                    "order": 0,
                    "locked": False,
                    "hidden": False,
                    "clips": clips,
                }
            ],
        },
        "music": {
            "sourceId": music_path,
            "volume": 0.8,
        } if music_path else None,
    }
    
    print(f"  Generated {len(clips)} clips, {total_duration:.1f}s total")
    return edl
```

---

## Scoring Formula (Updated)

```
edit_score = semantic_importance * 0.35
           + motion_intensity   * 0.30
           + beat_proximity     * 0.20
           + duration_fitness   * 0.15
```

| Factor | Weight | Source | Normalization |
|--------|--------|--------|---------------|
| Semantic importance | 35% | LLM rates 1-10 | Divide by 10 |
| Motion intensity | 30% | Peak magnitude per segment | Relative to max in footage |
| Beat proximity | 20% | Distance to nearest music beat | 0-300ms tolerance |
| Duration fitness | 15% | Segment duration | Penalize <0.5s or >4s |

## Verification

Run the pipeline and watch for:

```
  Footage analysis: N segments, M beats, K motion peaks
  Top segments by edit_score:
    [3] 4.2-5.8s score=0.712 motion=0.234 sem=8 type=medium
    ...
  Final clip order (narrative arc applied):
    Clip 0: 0.0-1.2s (1.20s) type=wide score=0.445
    ...
```

Different footage with the same reference should produce meaningfully different outputs.
