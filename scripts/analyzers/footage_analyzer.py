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
