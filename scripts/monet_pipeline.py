#!/usr/bin/env python3
"""
Monet Integrated Pipeline
Complete flow: Reference → Grammar → DNA → EDL → OpenReel + Editly Render

This is the main entry point for the universal vibe editor.
"""

import json
import os
import sys
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Optional

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
SCRIPTS_DIR = WORKSPACE / "scripts"
ANALYZERS_DIR = SCRIPTS_DIR / "analyzers"
OUTPUT_DIR = WORKSPACE / "output"

# Add analyzers to path
sys.path.insert(0, str(ANALYZERS_DIR))

from motion_analyzer import analyze_motion, compute_motion_stats, classify_camera_motion, classify_subject_motion
from beat_detector import detect_beats, analyze_rhythm
from color_analyzer import analyze_color
from shot_type_classifier import classify_shot_type, aggregate_shot_types
from effect_detector import detect_effects, aggregate_effects
from text_detector import detect_text, aggregate_text_results
from speed_ramp_detector import detect_speed_ramps, aggregate_speed_results
from semantic_analyzer import analyze_semantic_events, aggregate_semantic_results
from reference_type_classifier import classify_reference_type
from type_profiles import get_type_profile, get_threshold
from dna_blender import blend_dnas
from footage_analyzer import analyze_footage

class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder for numpy types."""
    def default(self, obj):
        import numpy as np
        if isinstance(obj, (np.integer,)):
            return int(obj)
        elif isinstance(obj, (np.floating,)):
            return float(obj)
        elif isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        elif isinstance(obj, (np.bool_,)):
            return bool(obj)
        return super().default(obj)

def run_cmd(cmd: list, timeout: int = 60) -> tuple:
    """Run command and return (success, stdout, stderr)."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

def get_video_info(path: str) -> dict:
    """Get video metadata."""
    success, stdout, _ = run_cmd([
        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path
    ])
    if not success:
        return {"duration": 0, "width": 0, "height": 0, "fps": 30, "has_audio": False}
    
    data = json.loads(stdout)
    fmt = data.get("format", {})
    
    video_stream = None
    audio_stream = None
    for s in data.get("streams", []):
        if s["codec_type"] == "video" and not video_stream:
            video_stream = s
        elif s["codec_type"] == "audio" and not audio_stream:
            audio_stream = s
    
    fps = 30
    if video_stream and video_stream.get("r_frame_rate"):
        try:
            num, den = video_stream["r_frame_rate"].split("/")
            fps = int(num) / int(den)
        except:
            pass
    
    return {
        "duration": float(fmt.get("duration", 0)),
        "width": video_stream.get("width", 0) if video_stream else 0,
        "height": video_stream.get("height", 0) if video_stream else 0,
        "fps": fps,
        "has_audio": audio_stream is not None,
    }

def detect_cuts(video_path: str, threshold: float = 0.15) -> list:
    """Detect cut points."""
    import re
    success, _, stderr = run_cmd([
        "ffmpeg", "-hide_banner", "-y", "-i", video_path,
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr", "-f", "null", "-"
    ], timeout=120)
    
    cuts = []
    for line in stderr.split("\n"):
        if "showinfo" in line and "pts_time" in line:
            pts_match = re.search(r'pts_time:(\S+)', line)
            score_match = re.search(r'lavfi\.scene_score=(\S+)', line)
            if pts_match:
                cuts.append({
                    "time": float(pts_match.group(1)),
                    "score": float(score_match.group(1)) if score_match else 0
                })
    
    return cuts

def extract_grammar(video_path: str, name: str, verbose: bool = True) -> dict:
    """
    Extract complete editing grammar from video.
    This is the main analysis function that runs all analyzers.
    """
    if verbose:
        print(f"\n{'='*60}")
        print(f"Extracting Editing Grammar: {name}")
        print(f"{'='*60}")
    
    # Get video info
    info = get_video_info(video_path)
    if verbose:
        print(f"\nVideo: {info['width']}x{info['height']}, {info['duration']:.2f}s, {info['fps']:.1f}fps")
    
    # Step 0: Classify reference type FIRST
    if verbose:
        print("\n[0/10] Classifying reference type...")
    ref_type = classify_reference_type(video_path, name)
    type_profile = get_type_profile(ref_type["type"])
    if verbose:
        print(f"  Type: {ref_type['type']} (confidence: {ref_type['confidence']:.2f})")
        print(f"  {ref_type.get('description', '')}")
    
    # Detect cuts
    if verbose:
        print("\n[1/10] Detecting cuts...")
    cuts = detect_cuts(video_path, threshold=0.15)
    cut_times = [0] + [c["time"] for c in cuts] + [info["duration"]]
    
    shots = []
    for i in range(len(cut_times) - 1):
        start = cut_times[i]
        end = cut_times[i + 1]
        dur = end - start
        
        if dur < 0.034:
            continue
        
        shots.append({
            "index": len(shots),
            "start": start,
            "end": end,
            "duration": dur,
        })
    
    if verbose:
        print(f"  Found {len(shots)} shots")
    
    # Run analyzers
    if verbose:
        print("\n[2/10] Analyzing motion...")
    motion_data = analyze_motion(video_path, fps=10.0)
    motion_stats = compute_motion_stats(motion_data)
    if verbose:
        print(f"  Avg magnitude: {motion_stats['avg_magnitude']:.3f}")
    
    if verbose:
        print("\n[3/10] Detecting beats...")
    beat_result = None
    if info["has_audio"]:
        audio_path = tempfile.mktemp(suffix=".wav")
        run_cmd([
            "ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
            "-ar", "44100", "-ac", "1", audio_path
        ])
        
        if os.path.exists(audio_path) and os.path.getsize(audio_path) > 1000:
            beat_result = detect_beats(audio_path)
            if verbose:
                print(f"  Tempo: {beat_result['tempo_bpm']} BPM")
        os.remove(audio_path)
    
    if verbose:
        print("\n[4/10] Analyzing color...")
    color_data = analyze_color(video_path, sample_rate=2.0)
    if verbose:
        print(f"  Grade: {color_data['grade']}")
    
    if verbose:
        print("\n[5/10] Classifying shot types...")
    shot_type_results = classify_shot_type(video_path, shots)
    shot_type_summary = aggregate_shot_types(shot_type_results)
    for i, shot in enumerate(shots):
        if i < len(shot_type_results):
            shot["shotType"] = shot_type_results[i]["shotType"]
        else:
            shot["shotType"] = "medium"
    if verbose:
        print(f"  Distribution: {shot_type_summary['distribution']}")
    
    if verbose:
        print("\n[6/10] Detecting effects...")
    effects_results = detect_effects(video_path, shots)
    effects_summary = aggregate_effects(effects_results)
    for i, shot in enumerate(shots):
        if i < len(effects_results):
            # Deduplicate effects at DNA level to prevent stacking in render
            raw_fx = effects_results[i].get("effects", [])
            raw_vfx = effects_results[i].get("visualEffects", [])
            shot["effects"] = list(dict.fromkeys([e for e in raw_fx if e != "cut"]))[:1]
            shot["transitions"] = effects_results[i].get("transitions", [])
            shot["visualEffects"] = list(dict.fromkeys([e for e in raw_vfx if e != "cut"]))[:1]
        else:
            shot["effects"] = []
            shot["transitions"] = []
            shot["visualEffects"] = []
    if verbose:
        print(f"  Total effects: {effects_summary['totalEffects']}")
    
    if verbose:
        print("\n[7/10] Detecting text...")
    text_results = detect_text(video_path, shots)
    text_summary = aggregate_text_results(text_results)
    for i, shot in enumerate(shots):
        if i < len(text_results):
            shot["hasText"] = text_results[i].get("hasText", False)
            shot["textCount"] = text_results[i].get("textCount", 0)
            shot["textProperties"] = text_results[i].get("properties", {})
        else:
            shot["hasText"] = False
            shot["textCount"] = 0
            shot["textProperties"] = {}
    if verbose:
        print(f"  Shots with text: {text_summary['shotsWithText']}/{len(shots)}")
    
    if verbose:
        print("\n[8/10] Detecting speed ramps...")
    speed_results = detect_speed_ramps(video_path, shots)
    speed_summary = aggregate_speed_results(speed_results)
    for i, shot in enumerate(shots):
        if i < len(speed_results):
            shot["avgSpeed"] = speed_results[i].get("avgSpeed", 1.0)
            shot["speedType"] = speed_results[i].get("speedType", "normal")
            shot["hasRamp"] = speed_results[i].get("hasRamp", False)
        else:
            shot["avgSpeed"] = 1.0
            shot["speedType"] = "normal"
            shot["hasRamp"] = False
    if verbose:
        print(f"  Avg speed: {speed_summary['avgSpeed']:.2f}x")
    
    if verbose:
        print("\n[9/10] Analyzing semantic events...")
    semantic_results = analyze_semantic_events(video_path, shots, name)
    semantic_summary = aggregate_semantic_results(semantic_results)
    for i, shot in enumerate(shots):
        if i < len(semantic_results):
            shot["semanticEvent"] = semantic_results[i]
        else:
            shot["semanticEvent"] = {"event_type": "action", "emotion": "neutral", "narrative_role": "building"}
    if verbose:
        print(f"  Event types: {semantic_summary['eventTypes']}")
    
    # Compute motion for each shot
    for shot in shots:
        shot_motion = [m for m in motion_data if shot["start"] <= m["time"] <= shot["end"]]
        if shot_motion:
            shot_stats = compute_motion_stats(shot_motion)
            shot["motion_magnitude"] = shot_stats["avg_magnitude"]
            shot["camera_motion"] = classify_camera_motion(shot_motion, shot["duration"])
            shot["subject_motion"] = classify_subject_motion(shot_motion, shot["duration"])
        else:
            shot["motion_magnitude"] = 0
            shot["camera_motion"] = "static"
            shot["subject_motion"] = "standing"
        shot["energy"] = shot["motion_magnitude"]
    
    # Extract rhythm
    rhythm = {}
    if beat_result and shots:
        cut_times_list = [0] + [s["start"] for s in shots] + [shots[-1]["end"]]
        rhythm = analyze_rhythm(beat_result["beats"], cut_times_list)
    
    # Build complete DNA
    if verbose:
        print("\n[10/10] Building DNA...")
    
    dna = {
        "name": name,
        "source": video_path,
        "duration": info["duration"],
        "resolution": {"width": info["width"], "height": info["height"]},
        "fps": info["fps"],
        "referenceType": ref_type["type"],
        "referenceTypeConfidence": ref_type["confidence"],
        "referenceTypeDescription": ref_type.get("description", ""),
        "totalShots": len(shots),
        "avgShotDuration": sum(s["duration"] for s in shots) / len(shots) if shots else 0,
        "cutRate": len(shots) / info["duration"] if info["duration"] > 0 else 0,
        "shots": shots,
        "motionStats": motion_stats,
        "colorProfile": color_data,
        "shotTypes": shot_type_summary,
        "effects": effects_summary,
        "text": text_summary,
        "speed": speed_summary,
        "semanticEvents": semantic_summary,
        "audioAnalysis": beat_result,
        "rhythm": rhythm,
        "energyCurve": [{"time": m["time"], "energy": m["magnitude"]} for m in motion_data],
    }
    
    # Extract grammar rules
    dna["grammarRules"] = build_grammar_rules(dna)
    
    if verbose:
        print(f"\n{'='*60}")
        print(f"Grammar Extracted: {name}")
        print(f"{'='*60}")
        print(f"Shots: {dna['totalShots']}")
        print(f"Avg duration: {dna['avgShotDuration']:.3f}s")
        print(f"Cut rate: {dna['cutRate']:.2f}/sec")
    
    return dna

def build_grammar_rules(dna: dict) -> dict:
    """Build high-level grammar rules from DNA."""
    shots = dna.get("shots", [])
    
    rules = {
        "pacing": {
            "avgDuration": dna["avgShotDuration"],
            "cutRate": dna["cutRate"],
        },
        "motion": {
            "avgMagnitude": dna["motionStats"]["avg_magnitude"],
            "hasHighMotion": dna["motionStats"]["avg_magnitude"] > 0.15,
        },
        "rhythm": {
            "tempo": dna["audioAnalysis"]["tempo_bpm"] if dna["audioAnalysis"] else 0,
            "isBeatDriven": dna.get("rhythm", {}).get("cuts_on_beat", 0) > 60,
        },
        "color": {
            "grade": dna["colorProfile"]["grade"],
            "temperature": dna["colorProfile"]["color_temperature"],
        },
        "shotTypes": {
            "distribution": dna["shotTypes"]["distribution"],
            "dominantType": dna["shotTypes"]["dominantType"],
        },
        "effects": {
            "totalEffects": dna["effects"]["totalEffects"],
            "effectsPerShot": dna["effects"]["effectsPerShot"],
        },
        "text": {
            "hasText": dna["text"]["hasText"],
            "textFrequency": dna["text"]["textFrequency"],
        },
        "speed": {
            "avgSpeed": dna["speed"]["avgSpeed"],
            "hasRamps": dna["speed"]["hasRamps"],
        },
        "semantic": {
            "dominantEventType": dna["semanticEvents"]["dominantEventType"],
            "dominantEmotion": dna["semanticEvents"]["dominantEmotion"],
        },
    }
    
    return rules

def generate_edl_from_dna(dna: dict, footage_path: str, music_path: Optional[str] = None,
                          style_intensity: float = 0.5) -> dict:
    """
    Generate MonetEDL by applying reference grammar to footage content.

    Algorithm:
    1. Calculate target clip count from reference's avgShotDuration
    2. Rank footage segments by motion + semantics + beat proximity
    3. Select top N segments matching reference's shotType distribution
    4. Order by narrative arc (establishing → building → climax → resolution)
    5. Snap cuts to music beats
    6. Apply reference effects, color grade, speed (scaled by style_intensity)

    Args:
        style_intensity: 0.0–1.0, scales how aggressively reference effects are
                         applied to the user's footage. 0 = no effects, 1 = full
                         reference copy. Default 0.5 keeps edits tasteful.
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
    ref_visual_effects = ref_effects.get("visualEffects", {})
    weighted_effect_types = []
    for effect_name, count in ref_visual_effects.items():
        if effect_name == "none" or not count:
            continue
        weight = int(round(count))
        weighted_effect_types.extend([effect_name] * max(1, weight))
    
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
        
        # Build clip-level effects (blur EXCLUDED — blur is a transition, not a clip effect)
        # style_intensity scales probability; cap at 2 concurrent effects per clip
        effects = []
        non_blur_effects = [e for e in weighted_effect_types if e != "blur"]
        if non_blur_effects and effects_per_clip >= 0.3:
            apply_prob = min(0.35, effects_per_clip / 3) * style_intensity
            if random.random() < apply_prob:
                chosen_type = random.choice(non_blur_effects)
                effects.append({
                    "id": f"effect-{i}-{chosen_type}",
                    "type": chosen_type,
                    "start": 0,
                    "duration": duration,
                    "params": {"intensity": style_intensity},
                })
                # Second effect only at half the probability, capped at 2 total
                if len(effects) < 2 and random.random() < apply_prob * 0.5:
                    second_type = random.choice([e for e in non_blur_effects if e != chosen_type] or non_blur_effects)
                    effects.append({
                        "id": f"effect-{i}-{second_type}",
                        "type": second_type,
                        "start": 0,
                        "duration": duration,
                        "params": {"intensity": style_intensity},
                    })
        
        # Transition: use reference's transition distribution
        clip_transition = None
        ref_transitions = dna.get("effects", {}).get("transitions", {})
        if ref_transitions:
            trans_types = list(ref_transitions.keys())
            trans_weights = list(ref_transitions.values())
            if trans_types and sum(trans_weights) > 0:
                chosen_trans = random.choices(trans_types, weights=trans_weights, k=1)[0]
                if chosen_trans != "cut":
                    clip_transition = {
                        "type": chosen_trans,
                        "duration": 0.15,
                    }
        
        # Blur as SHORT transition (not full-clip effect) — 15% of clips max
        blur_ratio = ref_visual_effects.get("blur", 0) / max(1, dna.get("totalShots", 1))
        if not clip_transition and random.random() < min(0.15, blur_ratio * 0.3):
            clip_transition = {
                "type": "blur",
                "duration": min(0.2, duration * 0.15),
            }
        
        # Speed: default to natural (1.0x), vary only for extreme importance
        if importance >= 9:
            speed = 0.5    # dramatic slow-mo
        elif importance >= 7:
            speed = 0.75   # subtle slow-mo
        elif importance >= 4:
            speed = 1.0    # NORMAL — most content stays here
        elif importance >= 2:
            speed = 1.5    # fast for filler
        else:
            speed = 2.0    # very fast for lowest-value clips
        
        # Only inflate speed if reference is genuinely fast-paced with ramps
        if ref_speed > 1.5 and dna.get("speed", {}).get("hasRamps", False):
            if importance < 4:
                speed = max(speed, min(ref_speed, 1.75))
        
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


def _apply_narrative_arc(segments: list, shot_dist: dict):
    """Reorder segments to match reference's narrative arc."""
    n = len(segments)
    if n < 4:
        return
    
    # Split into arc zones
    establishing_end = int(n * 0.2)
    climax_start = int(n * 0.6)
    climax_end = int(n * 0.9)
    
    # Within each zone, sort by the zone's preferred characteristics
    # Establishing: prefer wide shots, lower importance
    for seg in segments[:establishing_end]:
        seg["_arc_priority"] = (
            (0 if seg.get("shotType") == "wide" else 1) +
            seg.get("semantic_importance", 5) * 0.1
        )
    
    # Building: varied, medium importance
    for seg in segments[establishing_end:climax_start]:
        seg["_arc_priority"] = seg.get("edit_score", 0)
    
    # Climax: high importance, high motion
    for seg in segments[climax_start:climax_end]:
        seg["_arc_priority"] = -seg.get("semantic_importance", 5) - seg.get("motion_peak", 0)
    
    # Resolution: calm, establishing-like
    for seg in segments[climax_end:]:
        seg["_arc_priority"] = seg.get("semantic_importance", 5) * -0.1
    
    # Stable sort within each zone
    for start, end in [(0, establishing_end), (establishing_end, climax_start), 
                        (climax_start, climax_end), (climax_end, n)]:
        zone = segments[start:end]
        zone.sort(key=lambda s: s.get("_arc_priority", 0))
    
    # Clean up temp field
    for seg in segments:
        seg.pop("_arc_priority", None)


def _snap_to_beats(segments: list, beats: list, tolerance: float = 0.1):
    """Snap segment start times to nearest beat."""
    if not beats:
        return
    
    for seg in segments:
        best_beat = seg["start"]
        best_dist = tolerance
        for beat in beats:
            dist = abs(seg["start"] - beat)
            if dist < best_dist:
                best_dist = dist
                best_beat = beat
        seg["start"] = best_beat
        seg["end"] = best_beat + seg["duration"]

def export_to_openreel(edl: dict, output_path: str) -> bool:
    """
    Export EDL to OpenReel project format for browser editing.
    This creates a JSON file that can be loaded into OpenReel.
    """
    import numpy as np
    
    print("Exporting to OpenReel format...")
    
    # Convert EDL to JSON-serializable format
    def convert_to_serializable(obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        elif isinstance(obj, (np.floating,)):
            return float(obj)
        elif isinstance(obj, (np.bool_,)):
            return bool(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {k: convert_to_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_to_serializable(v) for v in obj]
        return obj
    
    edl_serializable = convert_to_serializable(edl)
    
    # Build OpenReel project structure
    openreel_project = {
        "id": edl_serializable["id"],
        "name": f"AI Edit — {edl_serializable['meta']['projectId']}",
        "createdAt": edl_serializable["meta"]["createdAt"],
        "modifiedAt": edl_serializable["meta"]["updatedAt"],
        "settings": {
            "width": 1080 if edl_serializable["meta"]["aspectRatio"] == "1:1" else 1080 if edl_serializable["meta"]["aspectRatio"] == "9:16" else 1920,
            "height": 1080 if edl_serializable["meta"]["aspectRatio"] == "1:1" else 1920 if edl_serializable["meta"]["aspectRatio"] == "9:16" else 1080,
            "frameRate": edl_serializable["meta"]["fps"],
            "sampleRate": edl_serializable["meta"]["sampleRate"],
            "channels": 2,
        },
        "mediaLibrary": {
            "items": [
                {
                    "id": "footage-main",
                    "name": os.path.basename(edl_serializable["assets"]["media"]["footage-main"]["path"]),
                    "type": "video",
                    "metadata": {
                        "duration": edl_serializable["assets"]["media"]["footage-main"]["duration"],
                        "width": edl_serializable["assets"]["media"]["footage-main"]["width"],
                        "height": edl_serializable["assets"]["media"]["footage-main"]["height"],
                        "frameRate": edl_serializable["meta"]["fps"],
                        "codec": "h264",
                    },
                }
            ],
        },
        "timeline": {
            "tracks": [
                {
                    "id": "video-main",
                    "type": "video",
                    "name": "Main Video",
                    "clips": [
                        {
                            "id": clip["id"],
                            "mediaId": clip["mediaId"],
                            "trackId": "video-main",
                            "startTime": clip["startTime"],
                            "duration": clip["duration"],
                            "inPoint": clip["inPoint"],
                            "outPoint": clip["outPoint"],
                            "effects": clip.get("effects", []),
                            "transform": {
                                "position": {"x": 0, "y": 0},
                                "scale": {"x": 1, "y": 1},
                                "rotation": 0,
                                "anchor": {"x": 0.5, "y": 0.5},
                                "opacity": 1,
                            },
                            "volume": 1,
                            "speed": clip.get("speed", 1),
                            "meta": clip.get("meta", {}),
                        }
                        for clip in edl_serializable["timeline"]["tracks"][0]["clips"]
                    ],
                    "transitions": [],
                    "locked": False,
                    "hidden": False,
                    "muted": False,
                    "solo": False,
                }
            ],
            "subtitles": [],
            "duration": edl_serializable["timeline"]["duration"],
            "markers": [],
        },
        # Monet-specific metadata for re-import
        "_monet": {
            "dna": edl_serializable.get("_dna", {}),
            "grammarRules": edl_serializable.get("_grammarRules", {}),
        },
    }
    
    with open(output_path, "w") as f:
        json.dump(openreel_project, f, indent=2)
    
    print(f"  OpenReel project saved: {output_path}")
    return True


def apply_subject_crops(edl, output_path, crops_path=None, crops_meta_path=None):
    """Read subject-tracked crops binary and return per-frame crop array.

    Reads crops.f64 (float64[ N ][4]) and its crops.json metadata.
    Returns the crops array for use in the FFmpeg render loop, or None
    if no crops data is available (caller falls back to center-crop).

    Paths resolve from arguments, then from env vars CROPS_PATH and
    CROPS_META_PATH (set by vibe-render.ts).

    Args:
        edl: MonetEDL dict (unused, for API consistency).
        output_path: Output render path (unused, for API consistency).
        crops_path: Path to crops.f64 binary artifact.
        crops_meta_path: Path to crops.json metadata.

    Returns:
        np.ndarray of shape (N, 4) with columns
        [cropX, cropY, cropW, cropH] each normalized 0–1,
        or None if no crops data exists.
    """
    import json
    import os

    crops_path = crops_path or os.environ.get("CROPS_PATH")
    crops_meta_path = crops_meta_path or os.environ.get("CROPS_META_PATH")

    if crops_path is None or not os.path.exists(crops_path):
        return None

    with open(crops_meta_path) as f:
        meta = json.load(f)

    schema = meta.get("schema")
    if schema != "crops.v1":
        raise ValueError(
            f"Unknown crop schema: {schema!r}. Expected 'crops.v1'."
        )

    import numpy as np

    crops = np.fromfile(crops_path, dtype=np.float64).reshape(-1, 4)
    return crops


def render_with_editly(edl: dict, output_path: str, music_path: Optional[str] = None,
                       style_intensity: float = 0.5) -> bool:
    """
    Render EDL to video.
    - macOS: Docker container render (full effects + color grade + xfade)
    - Fallback: FFmpeg concat (no color grade, no transitions)
    """
    import platform

    system = platform.system()

    if system == "Darwin":
        print("Rendering with editly-full...")
        success = render_in_docker(edl, output_path, music_path)
        if success:
            return True
        print("  Docker render failed, falling back to FFmpeg concat")

    edl["meta"]["renderMethod"] = "ffmpeg-concat-fallback"
    print("Rendering with ffmpeg-concat-fallback...")
    return render_native(edl, output_path, music_path, style_intensity=style_intensity)


def render_in_docker(edl: dict, output_path: str, music_path: Optional[str] = None) -> bool:
    """Render using Docker container with gl-transitions support."""
    import platform
    
    # Check Docker
    success, _, _ = run_cmd(["docker", "--version"])
    if not success:
        print("  Warning: Docker not available, falling back to FFmpeg concat")
        return render_native(edl, output_path, music_path)
    
    # Save EDL to temp file
    tmpdir = tempfile.mkdtemp(prefix="monet-docker-")
    edl_path = os.path.join(tmpdir, "edl.json")
    with open(edl_path, "w") as f:
        json.dump(edl, f, indent=2)
    
    # Prepare footage directory
    footage_dir = os.path.join(tmpdir, "footage")
    os.makedirs(footage_dir, exist_ok=True)
    
    footage_path = edl["assets"]["media"]["footage-main"]["path"]
    clips = edl["timeline"]["tracks"][0]["clips"]
    
    # Copy/link footage
    footage_abs = os.path.abspath(footage_path)
    shutil.copy2(footage_abs, os.path.join(footage_dir, "footage_main.mp4"))
    
    # Build container if needed
    image_name = "monet-render"
    success, _, _ = run_cmd(["docker", "image", "inspect", image_name])
    if not success:
        print("  Building render container...")
        docker_dir = WORKSPACE / "docker" / "render"
        if docker_dir.exists():
            success, _, err = run_cmd(["docker", "build", "-t", image_name, str(docker_dir)], timeout=300)
            if not success:
                print(f"  Warning: Container build failed: {err[:200]}")
                print("  Falling back to FFmpeg concat")
                return render_native(edl, output_path, music_path)
        else:
            print("  Warning: docker/render/ not found, falling back to FFmpeg concat")
            return render_native(edl, output_path, music_path)
    
    # Run render in container
    print("  Running render in container...")
    output_abs = os.path.abspath(output_path)
    open(output_abs, "wb").close()  # ensure file exists for Docker mount
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{edl_path}:/data/edl.json:ro",
        "-v", f"{footage_dir}:/data/footage:ro",
        "-v", f"{output_abs}:/data/output.mp4",
        "-e", "EDL_PATH=/data/edl.json",
        "-e", "OUTPUT_PATH=/data/output.mp4",
        "-e", "FOOTAGE_DIR=/data/footage",
        image_name,
    ]
    
    success, stdout, stderr = run_cmd(cmd, timeout=300)
    
    # Cleanup
    shutil.rmtree(tmpdir, ignore_errors=True)
    
    if success:
        print(f"  ✓ Docker render complete: {output_path}")
        return True
    else:
        print(f"  Warning: Docker render failed: {stderr[:200]}")
        print("  Falling back to FFmpeg concat")
        return render_native(edl, output_path, music_path)


def render_native(edl: dict, output_path: str, music_path: Optional[str] = None,
                  style_intensity: float = 0.5) -> bool:
    """Render using FFmpeg directly (fallback or Linux native)."""
    print("Rendering with FFmpeg...")
    
    tmpdir = tempfile.mkdtemp(prefix="monet-render-")
    
    try:
        footage_path = edl["assets"]["media"]["footage-main"]["path"]
        clips = edl["timeline"]["tracks"][0]["clips"]
        
        # Load subject crops if available
        crops = apply_subject_crops(edl, output_path)
        fps = edl["meta"]["fps"]
        
        # Extract segments
        segment_files = []
        for i, clip in enumerate(clips):
            seg_file = os.path.join(tmpdir, f"seg_{i:03d}.mp4")
            
            # Build filter chain — subject crop or fallback center-crop
            if crops is not None:
                start_frame = int(clip["inPoint"] * fps)
                end_frame = int(min(
                    (clip["inPoint"] + clip["duration"]) * fps,
                    len(crops)
                ))
                clip_crops = crops[start_frame:end_frame]
                if len(clip_crops) > 0:
                    avg = clip_crops.mean(axis=0)
                    c_x, c_y, c_w, c_h = avg
                    c_w = max(0.1, min(1.0, c_w))
                    c_h = max(0.1, min(1.0, c_h))
                    c_x = max(0.0, min(1.0 - c_w, c_x))
                    c_y = max(0.0, min(1.0 - c_h, c_y))
                    vf_parts = [
                        f"crop=iw*{c_w}:ih*{c_h}:iw*{c_x}:ih*{c_y}",
                        "scale=576:576",
                    ]
                else:
                    vf_parts = ["scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2"]
            else:
                vf_parts = ["scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2"]
            
            # Add effects — scaled by style_intensity, capped at 2 per clip
            unique_effects = list(dict.fromkeys(
                [e.get("type", "") for e in clip.get("effects", [])
                 if e.get("type", "") != "cut"]
            ))[:2]

            for effect_type in unique_effects:
                si = style_intensity  # shorthand
                if effect_type == "blur":
                    radius = max(1, int(8 * si))
                    vf_parts.append(f"boxblur={radius}:{radius}")
                elif effect_type == "vignette":
                    angle = max(0.1, 0.7854 * si)  # PI/4 scaled
                    vf_parts.append(f"vignette={angle}")
                elif effect_type == "flash":
                    vf_parts.append(f"eq=brightness={0.3 * si}")
                elif effect_type == "shake":
                    offset = max(1, int(10 * si))
                    vf_parts.append(f"crop=w=in_w-{offset*2}:h=in_h-{offset*2}:x={offset}:y={offset}")
                elif effect_type == "glow":
                    vf_parts.append(f"unsharp=5:5:{1.5 * si}")
                elif effect_type == "desaturation":
                    sat = max(0.1, 1.0 - (0.7 * si))  # 1.0 = no desat, 0.3 = heavy
                    vf_parts.append(f"eq=saturation={sat:.2f}")
            
            # Add grade based on shot type
            shot_type = clip.get("meta", {}).get("shotType", "medium")
            if shot_type == "extreme_close":
                vf_parts.append("eq=contrast=1.1")
            
            vf = ",".join(vf_parts)
            
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(clip["inPoint"]),
                "-i", footage_path,
                "-t", str(clip["duration"]),
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-r", str(edl["meta"]["fps"]),
                "-an",
                seg_file
            ]
            
            success, _, _ = run_cmd(cmd, timeout=60)
            if success:
                segment_files.append(seg_file)
                print(f"  Segment {i+1}/{len(clips)}: {clip['duration']:.3f}s")
            else:
                print(f"  Warning: Failed segment {i+1}")
        
        if not segment_files:
            print("Error: No segments extracted")
            return False
        
        # Concatenate
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for seg in segment_files:
                f.write(f"file '{seg}'\n")
        
        concat_output = os.path.join(tmpdir, "concat.mp4")
        success, _, _ = run_cmd([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_file, "-c", "copy", concat_output
        ], timeout=60)
        
        if not success:
            print("Error: Concat failed")
            return False
        
        # Add music
        if music_path and os.path.exists(music_path):
            print("Adding music...")
            music_output = os.path.join(tmpdir, "with_music.mp4")
            success, _, _ = run_cmd([
                "ffmpeg", "-y",
                "-i", concat_output,
                "-i", music_path,
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                "-map", "0:v:0", "-map", "1:a:0",
                music_output
            ], timeout=60)
            
            if success:
                concat_output = music_output
        
        # Copy to output
        shutil.copy2(concat_output, output_path)
        print(f"  Render complete: {output_path}")
        return True
        
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

def run_pipeline(
    reference_path: str = None,
    reference_name: str = None,
    footage_path: str = None,
    music_path: Optional[str] = None,
    output_name: Optional[str] = None,
    references: List[Dict] = None,
    blend_strategy: str = "weighted_avg",
    style_intensity: float = 0.5,
) -> dict:
    """
    Run the complete Monet pipeline.
    
    Supports single reference (reference_path) or multi-reference (references list).
    
    Args:
        reference_path: Single reference video path
        reference_name: Single reference name
        footage_path: Footage to edit
        music_path: Music track (optional)
        output_name: Output name
        references: List of {"path": str, "name": str, "weight": float} dicts
        blend_strategy: "weighted_avg", "dominant_wins", or "union"
    
    Returns dict with paths to:
    - grammar: Extracted editing grammar DNA
    - edl: Generated MonetEDL
    - openreel: OpenReel project for browser editing
    - render: Rendered video
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Handle single vs multi-reference
    if references is None:
        references = [{"path": reference_path, "name": reference_name, "weight": 1.0}]
    
    output_name = output_name or (references[0]["name"] if references else "edit")
    
    print("\n" + "="*60)
    print("MONET INTEGRATED PIPELINE")
    print("="*60)
    
    # Step 1: Extract grammar from reference(s)
    if len(references) == 1:
        print(f"\n[STEP 1/4] Extracting reference grammar ({references[0]['name']})...")
        dna = extract_grammar(references[0]["path"], references[0]["name"], verbose=True)
    else:
        print(f"\n[STEP 1/4] Extracting {len(references)} reference grammars...")
        dnas = []
        for ref in references:
            print(f"\n  Extracting: {ref['name']} (weight: {ref['weight']:.2f})")
            dna = extract_grammar(ref["path"], ref["name"], verbose=True)
            dnas.append(dna)
        
        # Blend DNAs
        print(f"\n  Blending {len(dnas)} DNAs ({blend_strategy})...")
        weights = [r["weight"] for r in references]
        dna = blend_dnas(dnas, weights, strategy=blend_strategy)
        print(f"  Blended: {dna.get('totalShots', 0)} shots, {dna.get('avgShotDuration', 0):.3f}s avg")
    
    # Save DNA
    dna_path = OUTPUT_DIR / f"{output_name}-dna.json"
    with open(dna_path, "w") as f:
        json.dump(dna, f, indent=2, cls=NumpyEncoder)
    print(f"\nDNA saved: {dna_path}")
    
    # Step 2: Generate EDL (analyzes footage + applies reference grammar)
    print("\n[STEP 2/4] Generating EDL from footage...")
    edl = generate_edl_from_dna(dna, footage_path, music_path, style_intensity=style_intensity)
    edl["_dna"] = dna
    edl["_grammarRules"] = dna["grammarRules"]
    
    # Save EDL
    edl_path = OUTPUT_DIR / f"{output_name}-edl.json"
    with open(edl_path, "w") as f:
        json.dump(edl, f, indent=2, cls=NumpyEncoder)
    print(f"EDL saved: {edl_path}")
    
    # Step 3: Export to OpenReel
    print("\n[STEP 3/4] Exporting to OpenReel...")
    openreel_path = OUTPUT_DIR / f"{output_name}-openreel.json"
    export_to_openreel(edl, str(openreel_path))
    
    # Step 4: Render
    print("\n[STEP 4/4] Rendering video...")
    render_path = OUTPUT_DIR / f"{output_name}-render.mp4"
    render_with_editly(edl, str(render_path), music_path, style_intensity=style_intensity)
    
    # Summary
    print("\n" + "="*60)
    print("PIPELINE COMPLETE")
    print("="*60)
    print(f"\nOutputs:")
    print(f"  DNA:      {dna_path}")
    print(f"  EDL:      {edl_path}")
    print(f"  OpenReel: {openreel_path}")
    print(f"  Render:   {render_path}")
    print(f"\nTo edit in OpenReel:")
    print(f"  Load {openreel_path} in OpenReel editor")
    
    return {
        "grammar": dna,
        "edl": edl,
        "openreel": str(openreel_path),
        "render": str(render_path),
    }

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Monet Integrated Pipeline")
    parser.add_argument("--reference", "-r", help="Single reference video path")
    parser.add_argument("--name", "-n", help="Single reference name")
    parser.add_argument("--references", "-R", help="Multi-reference: 'path1:weight1,name1,path2:weight2,name2'")
    parser.add_argument("--footage", "-f", required=True, help="Footage to edit")
    parser.add_argument("--music", "-m", help="Music track (optional)")
    parser.add_argument("--output", "-o", help="Output name (default: reference name)")
    parser.add_argument("--blend-strategy", "-b", default="weighted_avg",
                       choices=["weighted_avg", "dominant_wins", "union"],
                       help="Blending strategy for multi-reference")
    parser.add_argument("--style-intensity", "-s", type=float, default=0.5,
                       help="Style strength 0.0-1.0 (0=no effects, 1=full reference copy)")
    
    args = parser.parse_args()
    
    # Parse multi-reference input
    references = None
    if args.references:
        # Format: "path1:weight1,name1,path2:weight2,name2"
        # Or: "path1:weight1,path2:weight2" (auto-name from filename)
        refs = []
        parts = args.references.split(",")
        
        # Parse in groups of 3 (path, weight, name) or 2 (path, weight)
        i = 0
        while i < len(parts):
            if i + 2 < len(parts) and parts[i+2].replace(".", "").replace("-", "").isalpha():
                # Has name: path, weight, name
                path = parts[i].strip()
                weight = float(parts[i+1].strip())
                name = parts[i+2].strip()
                i += 3
            elif i + 1 < len(parts):
                # No name: path, weight
                path = parts[i].strip()
                weight = float(parts[i+1].strip())
                name = Path(path).stem
                i += 2
            else:
                break
            
            refs.append({"path": path, "name": name, "weight": weight})
        
        # Normalize weights
        total_weight = sum(r["weight"] for r in refs)
        for r in refs:
            r["weight"] /= total_weight
        
        references = refs
    elif args.reference:
        references = [{"path": args.reference, "name": args.name or Path(args.reference).stem, "weight": 1.0}]
    else:
        parser.error("Either --reference or --references is required")
    
    run_pipeline(
        references=references,
        footage_path=args.footage,
        music_path=args.music,
        output_name=args.output,
        blend_strategy=args.blend_strategy,
        style_intensity=args.style_intensity,
    )
