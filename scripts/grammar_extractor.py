#!/usr/bin/env python3
"""
Editing Grammar Extractor
Orchestrates all specialized analyzers to extract complete editing DNA.
"""

import json
import subprocess
import sys
import os
from pathlib import Path

# Add analyzers to path
sys.path.insert(0, str(Path(__file__).parent / "analyzers"))

from motion_analyzer import analyze_motion, compute_motion_stats, classify_camera_motion, classify_subject_motion
from beat_detector import detect_beats, analyze_rhythm
from color_analyzer import analyze_color
from shot_type_classifier import classify_shot_type, aggregate_shot_types
from effect_detector import detect_effects, aggregate_effects
from text_detector import detect_text, aggregate_text_results
from speed_ramp_detector import detect_speed_ramps, aggregate_speed_results
from semantic_analyzer import analyze_semantic_events, aggregate_semantic_results

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")

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

def get_video_info(path: str) -> dict:
    """Get video metadata."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    fmt = data.get("format", {})
    
    video_stream = None
    audio_stream = None
    for s in data.get("streams", []):
        if s["codec_type"] == "video" and not video_stream:
            video_stream = s
        elif s["codec_type"] == "audio" and not audio_stream:
            audio_stream = s
    
    return {
        "duration": float(fmt.get("duration", 0)),
        "size": int(fmt.get("size", 0)),
        "width": video_stream.get("width", 0) if video_stream else 0,
        "height": video_stream.get("height", 0) if video_stream else 0,
        "fps": eval(video_stream.get("r_frame_rate", "30/1")) if video_stream else 30,
        "has_audio": audio_stream is not None,
    }

def detect_cuts(video_path: str, threshold: float = 0.2) -> list:
    """Detect cut points."""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-y", "-i", video_path,
         "-vf", f"select='gt(scene,{threshold})',showinfo",
         "-vsync", "vfr", "-f", "null", "-"],
        capture_output=True, text=True, timeout=120
    )
    
    import re
    cuts = []
    for line in result.stderr.split("\n"):
        if "showinfo" in line and "pts_time" in line:
            pts_match = re.search(r'pts_time:(\S+)', line)
            score_match = re.search(r'lavfi\.scene_score=(\S+)', line)
            if pts_match:
                cuts.append({
                    "time": float(pts_match.group(1)),
                    "score": float(score_match.group(1)) if score_match else 0
                })
    
    return cuts

def extract_grammar(video_path: str, name: str) -> dict:
    """
    Extract complete editing grammar from video.
    Runs all specialized analyzers and combines results.
    """
    print(f"\n{'='*60}")
    print(f"Extracting Editing Grammar: {name}")
    print(f"{'='*60}")
    
    # Get video info
    info = get_video_info(video_path)
    print(f"\nVideo: {info['width']}x{info['height']}, {info['duration']:.2f}s, {info['fps']:.1f}fps")
    
    # Detect cuts
    print("\n[1/6] Detecting cuts...")
    cuts = detect_cuts(video_path, threshold=0.15)
    cut_times = [0] + [c["time"] for c in cuts] + [info["duration"]]
    
    # Build shot list
    shots = []
    for i in range(len(cut_times) - 1):
        start = cut_times[i]
        end = cut_times[i + 1]
        dur = end - start
        
        if dur < 0.034:  # Skip sub-frame
            continue
        
        shots.append({
            "index": len(shots),
            "start": start,
            "end": end,
            "duration": dur,
        })
    
    print(f"  Found {len(shots)} shots")
    
    # Analyze motion
    print("\n[2/6] Analyzing motion...")
    motion_data = analyze_motion(video_path, fps=10.0)
    motion_stats = compute_motion_stats(motion_data)
    print(f"  Avg magnitude: {motion_stats['avg_magnitude']:.3f}")
    print(f"  Peak: {motion_stats['peak_magnitude']:.3f}")
    
    # Analyze beats
    print("\n[3/6] Detecting beats...")
    beat_result = None
    if info["has_audio"]:
        # Extract audio for analysis
        import tempfile
        audio_path = tempfile.mktemp(suffix=".wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le", 
             "-ar", "44100", "-ac", "1", audio_path],
            capture_output=True, timeout=30
        )
        
        if os.path.exists(audio_path) and os.path.getsize(audio_path) > 1000:
            beat_result = detect_beats(audio_path)
            print(f"  Tempo: {beat_result['tempo_bpm']} BPM")
            print(f"  Beats: {beat_result['beat_count']}")
            
            # Analyze rhythm
            rhythm = analyze_rhythm(beat_result["beats"], cut_times)
            print(f"  Cuts on beat: {rhythm['cuts_on_beat']:.1f}%")
        
        os.remove(audio_path)
    
    # Analyze color
    print("\n[4/6] Analyzing color...")
    color_data = analyze_color(video_path, sample_rate=2.0)
    print(f"  Grade: {color_data['grade']}")
    print(f"  Temperature: {color_data['color_temperature']}")
    print(f"  Saturation: {color_data['saturation_mean']:.1f}")
    
    # Classify shots
    print("\n[5/6] Classifying shots...")
    for shot in shots:
        # Get motion for this shot
        shot_motion = [m for m in motion_data 
                      if shot["start"] <= m["time"] <= shot["end"]]
        
        if shot_motion:
            shot_stats = compute_motion_stats(shot_motion)
            shot["motion_magnitude"] = shot_stats["avg_magnitude"]
            shot["camera_motion"] = classify_camera_motion(shot_motion, shot["duration"])
            shot["subject_motion"] = classify_subject_motion(shot_motion, shot["duration"])
        else:
            shot["motion_magnitude"] = 0
            shot["camera_motion"] = "static"
            shot["subject_motion"] = "standing"
        
        # Energy from motion
        shot["energy"] = shot["motion_magnitude"]
    
    # Classify shot types
    print("\n[5/6] Classifying shot types...")
    shot_type_results = classify_shot_type(video_path, shots)
    shot_type_summary = aggregate_shot_types(shot_type_results)
    
    # Add shot types to shots
    for i, shot in enumerate(shots):
        if i < len(shot_type_results):
            shot["shotType"] = shot_type_results[i]["shotType"]
            shot["shotTypeConfidence"] = shot_type_results[i]["confidence"]
        else:
            shot["shotType"] = "medium"
            shot["shotTypeConfidence"] = 0.0
    
    print(f"  Distribution: {shot_type_summary['distribution']}")
    print(f"  Dominant: {shot_type_summary['dominantType']}")
    print(f"  Varied framing: {shot_type_summary['variedFraming']}")
    
    # Detect effects
    print("\n[6/7] Detecting effects...")
    effects_results = detect_effects(video_path, shots)
    effects_summary = aggregate_effects(effects_results)
    
    # Add effects to shots
    for i, shot in enumerate(shots):
        if i < len(effects_results):
            shot["effects"] = effects_results[i].get("effects", [])
            shot["transitions"] = effects_results[i].get("transitions", [])
            shot["visualEffects"] = effects_results[i].get("visualEffects", [])
            shot["overlays"] = effects_results[i].get("overlays", [])
        else:
            shot["effects"] = []
            shot["transitions"] = []
            shot["visualEffects"] = []
            shot["overlays"] = []
    
    print(f"  Total effects: {effects_summary['totalEffects']}")
    print(f"  Effects per shot: {effects_summary['effectsPerShot']:.1f}")
    print(f"  Transitions: {effects_summary['transitions']}")
    print(f"  Visual effects: {effects_summary['visualEffects']}")
    print(f"  Overlays: {effects_summary['overlays']}")
    
    # Detect text
    print("\n[7/9] Detecting text...")
    text_results = detect_text(video_path, shots)
    text_summary = aggregate_text_results(text_results)
    
    # Add text to shots
    for i, shot in enumerate(shots):
        if i < len(text_results):
            shot["hasText"] = text_results[i].get("hasText", False)
            shot["textCount"] = text_results[i].get("textCount", 0)
            shot["textProperties"] = text_results[i].get("properties", {})
        else:
            shot["hasText"] = False
            shot["textCount"] = 0
            shot["textProperties"] = {}
    
    print(f"  Shots with text: {text_summary['shotsWithText']}/{len(shots)}")
    print(f"  Total text regions: {text_summary['totalTextRegions']}")
    print(f"  Dominant color: {text_summary['dominantColor']}")
    print(f"  Dominant size: {text_summary['dominantSize']}")
    
    # Detect speed ramps
    print("\n[8/9] Detecting speed ramps...")
    speed_results = detect_speed_ramps(video_path, shots)
    speed_summary = aggregate_speed_results(speed_results)
    
    # Add speed to shots
    for i, shot in enumerate(shots):
        if i < len(speed_results):
            shot["avgSpeed"] = speed_results[i].get("avgSpeed", 1.0)
            shot["speedType"] = speed_results[i].get("speedType", "normal")
            shot["hasRamp"] = speed_results[i].get("hasRamp", False)
            shot["rampType"] = speed_results[i].get("rampType", None)
        else:
            shot["avgSpeed"] = 1.0
            shot["speedType"] = "normal"
            shot["hasRamp"] = False
            shot["rampType"] = None
    
    print(f"  Avg speed: {speed_summary['avgSpeed']:.2f}x")
    print(f"  Speed distribution: {speed_summary['speedDistribution']}")
    print(f"  Shots with ramps: {speed_summary['shotsWithRamps']}/{len(shots)}")
    
    # Analyze semantic events
    print("\n[9/10] Analyzing semantic events...")
    semantic_results = analyze_semantic_events(video_path, shots, name)
    semantic_summary = aggregate_semantic_results(semantic_results)
    
    # Add semantic events to shots
    for i, shot in enumerate(shots):
        if i < len(semantic_results):
            shot["semanticEvent"] = semantic_results[i]
        else:
            shot["semanticEvent"] = {
                "event_type": "action",
                "emotion": "neutral",
                "narrative_role": "building",
                "importance": 5,
            }
    
    print(f"  Event types: {semantic_summary['eventTypes']}")
    print(f"  Emotions: {semantic_summary['emotions']}")
    print(f"  Narrative arc: {semantic_summary['narrativeArc']}")
    print(f"  Dominant event: {semantic_summary['dominantEventType']}")
    print(f"  Dominant emotion: {semantic_summary['dominantEmotion']}")
    
    # Extract grammar rules
    print("\n[10/10] Extracting grammar rules...")
    grammar = extract_grammar_rules(shots, motion_stats, beat_result, color_data, shot_type_summary, effects_summary, text_summary, speed_summary, semantic_summary)
    
    # Build complete DNA
    dna = {
        "name": name,
        "source": video_path,
        "duration": info["duration"],
        "resolution": {"width": info["width"], "height": info["height"]},
        "fps": info["fps"],
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
        "grammarRules": grammar,
        "energyCurve": [{"time": m["time"], "energy": m["magnitude"]} for m in motion_data],
    }
    
    return dna

def extract_grammar_rules(shots: list, motion_stats: dict, beat_result: dict, 
                          color_data: dict, shot_type_summary: dict, effects_summary: dict,
                          text_summary: dict, speed_summary: dict, semantic_summary: dict) -> dict:
    """
    Extract high-level grammar rules from analysis.
    These are the stylistic patterns that define the edit.
    """
    rules = {}
    
    # Pacing rules
    durations = [s["duration"] for s in shots]
    if durations:
        rules["pacing"] = {
            "avgDuration": sum(durations) / len(durations),
            "minDuration": min(durations),
            "maxDuration": max(durations),
            "stdDev": (sum((d - sum(durations)/len(durations))**2 for d in durations) / len(durations)) ** 0.5,
            "fastCutsCount": sum(1 for d in durations if d < 0.5),
            "slowCutsCount": sum(1 for d in durations if d > 2.0),
        }
    
    # Motion rules
    rules["motion"] = {
        "avgMagnitude": motion_stats["avg_magnitude"],
        "peakMagnitude": motion_stats["peak_magnitude"],
        "hasHighMotion": motion_stats["avg_magnitude"] > 0.15,
        "motionVariety": len(motion_stats.get("high_motion_segments", [])),
    }
    
    # Rhythm rules
    if beat_result:
        rhythm = analyze_rhythm(beat_result["beats"], [0] + [s["start"] for s in shots] + [shots[-1]["end"] if shots else 0])
        rules["rhythm"] = {
            "tempo": beat_result["tempo_bpm"],
            "cutsOnBeat": rhythm["cuts_on_beat"],
            "avgBeatsBetweenCuts": rhythm["avg_beats_between_cuts"],
            "isBeatDriven": rhythm["cuts_on_beat"] > 60,
        }
    
    # Color rules
    rules["color"] = {
        "grade": color_data["grade"],
        "temperature": color_data["color_temperature"],
        "saturationLevel": "low" if color_data["saturation_mean"] < 30 else 
                          "medium" if color_data["saturation_mean"] < 70 else "high",
        "contrastLevel": "low" if color_data["contrast"] < 30 else
                        "medium" if color_data["contrast"] < 60 else "high",
        "hasSkinTone": color_data.get("skin_tone", {}).get("is_present", False),
    }
    
    # Camera motion patterns
    camera_motions = [s.get("camera_motion", "static") for s in shots]
    motion_counts = {}
    for m in camera_motions:
        motion_counts[m] = motion_counts.get(m, 0) + 1
    
    rules["cameraLanguage"] = {
        "dominantMotion": max(motion_counts, key=motion_counts.get) if motion_counts else "static",
        "motionVariety": len(motion_counts),
        "staticRatio": motion_counts.get("static", 0) / len(shots) if shots else 0,
        "dynamicRatio": 1 - motion_counts.get("static", 0) / len(shots) if shots else 0,
    }
    
    # Subject motion patterns
    subject_motions = [s.get("subject_motion", "standing") for s in shots]
    subject_counts = {}
    for m in subject_motions:
        subject_counts[m] = subject_counts.get(m, 0) + 1
    
    rules["subjectLanguage"] = {
        "dominantMotion": max(subject_counts, key=subject_counts.get) if subject_counts else "standing",
        "motionVariety": len(subject_counts),
        "actionRatio": sum(subject_counts.get(m, 0) for m in ["running", "jumping", "celebrating"]) / len(shots) if shots else 0,
    }
    
    # Shot type patterns
    rules["shotTypes"] = {
        "distribution": shot_type_summary.get("distribution", {}),
        "dominantType": shot_type_summary.get("dominantType", "medium"),
        "variedFraming": shot_type_summary.get("variedFraming", False),
        "closeUpRatio": shot_type_summary.get("distribution", {}).get("close", 0) + 
                       shot_type_summary.get("distribution", {}).get("extreme_close", 0),
        "wideRatio": shot_type_summary.get("distribution", {}).get("wide", 0),
    }
    
    # Effects patterns
    rules["effects"] = {
        "totalEffects": effects_summary.get("totalEffects", 0),
        "effectsPerShot": effects_summary.get("effectsPerShot", 0),
        "transitions": effects_summary.get("transitions", {}),
        "visualEffects": effects_summary.get("visualEffects", {}),
        "overlays": effects_summary.get("overlays", {}),
        "mostCommonEffect": effects_summary.get("mostCommonEffect", "none"),
        "effectVariety": effects_summary.get("effectVariety", 0),
        "hasTransitions": len(effects_summary.get("transitions", {})) > 0,
        "hasVisualEffects": len(effects_summary.get("visualEffects", {})) > 0,
        "hasOverlays": len(effects_summary.get("overlays", {})) > 0,
    }
    
    # Text patterns
    rules["text"] = {
        "hasText": text_summary.get("hasText", False),
        "textFrequency": text_summary.get("textFrequency", 0),
        "shotsWithText": text_summary.get("shotsWithText", 0),
        "dominantColor": text_summary.get("dominantColor", "white"),
        "dominantSize": text_summary.get("dominantSize", "medium"),
        "dominantPlacement": text_summary.get("dominantPlacement", "center"),
    }
    
    # Speed patterns
    rules["speed"] = {
        "avgSpeed": speed_summary.get("avgSpeed", 1.0),
        "dominantSpeed": speed_summary.get("dominantSpeed", "normal"),
        "hasSlowMotion": speed_summary.get("hasSlowMotion", False),
        "hasFastMotion": speed_summary.get("hasFastMotion", False),
        "hasRamps": speed_summary.get("hasRamps", False),
        "rampRatio": speed_summary.get("rampRatio", 0),
        "speedDistribution": speed_summary.get("speedDistribution", {}),
    }
    
    # Semantic patterns
    rules["semantic"] = {
        "totalEvents": semantic_summary.get("totalEvents", 0),
        "eventTypes": semantic_summary.get("eventTypes", {}),
        "emotions": semantic_summary.get("emotions", {}),
        "narrativeArc": semantic_summary.get("narrativeArc", {}),
        "avgImportance": semantic_summary.get("avgImportance", 5),
        "dominantEventType": semantic_summary.get("dominantEventType", "action"),
        "dominantEmotion": semantic_summary.get("dominantEmotion", "neutral"),
        "climaxPosition": semantic_summary.get("climaxPosition", 0.5),
        "hasNarrativeArc": len(semantic_summary.get("narrativeArc", {})) >= 2,
    }
    
    # Editing style summary
    rules["styleSummary"] = {
        "isBeatDriven": rules.get("rhythm", {}).get("isBeatDriven", False),
        "isHighEnergy": rules["motion"]["hasHighMotion"],
        "isDesaturated": rules["color"]["saturationLevel"] == "low",
        "isDark": rules["color"]["grade"] in ["dark", "bw"],
        "pacingType": "fast" if rules["pacing"]["avgDuration"] < 1.0 else 
                     "medium" if rules["pacing"]["avgDuration"] < 2.0 else "slow",
    }
    
    return rules

def main():
    if len(sys.argv) < 3:
        print("Usage: python grammar_extractor.py <video_path> <name>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    name = sys.argv[2]
    
    # Extract grammar
    dna = extract_grammar(video_path, name)
    
    # Save
    output_dir = WORKSPACE / "src" / "server" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"grammar-{name.lower().replace(' ', '-')}.json"
    
    with open(output_path, "w") as f:
        json.dump(dna, f, indent=2, cls=NumpyEncoder)
    
    print(f"\n{'='*60}")
    print(f"Grammar Extracted: {name}")
    print(f"{'='*60}")
    print(f"Output: {output_path}")
    print(f"\nGrammar Rules:")
    print(json.dumps(dna["grammarRules"], indent=2, cls=NumpyEncoder))

if __name__ == "__main__":
    main()
