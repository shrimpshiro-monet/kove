"""
Editorial Style Export
Runs all analyzers on a reference video and exports a complete
editorial style breakdown: color phases, speed direction, transitions, etc.
"""

import os, sys, json
from typing import Optional
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from monet_pipeline import (
    get_video_info, detect_cuts, analyze_motion, compute_motion_stats,
    detect_beats, analyze_rhythm,
)
from color_analyzer import analyze_color
from shot_type_classifier import classify_shot_type, aggregate_shot_types
from effect_detector import detect_effects, aggregate_effects
from text_detector import detect_text, aggregate_text_results
from speed_ramp_detector import detect_speed_ramps, aggregate_speed_results
from color_grade_tracker import track_color_grades
from transition_classifier import classify_transitions
from speed_direction_analyzer import analyze_speed_direction


def export_editorial_style(
    video_path: str,
    name: str,
    verbose: bool = True,
    profile: Optional[dict] = None,
) -> dict:
    """Run all analyzers and produce a consolidated editorial style export."""

    info = get_video_info(video_path)
    if verbose:
        print(f"Video: {info['width']}x{info['height']}, {info['duration']:.2f}s, {info['fps']:.1f}fps")

    # ── Build shots from cuts ──
    cut_threshold = (profile or {}).get("cut_detection", {}).get("threshold", 0.15)
    cuts = detect_cuts(video_path, threshold=cut_threshold)
    cut_times = [0] + [c["time"] for c in cuts] + [info["duration"]]
    shots = []
    for i in range(len(cut_times) - 1):
        start = cut_times[i]
        end = cut_times[i + 1]
        dur = end - start
        if dur < 0.034:
            continue
        shots.append({"index": len(shots), "start": start, "end": end, "duration": dur})

    if verbose:
        print(f"Shots: {len(shots)}")

    # ── Standard analyzers ──
    if verbose:
        print("\n--- Standard Analysis ---")

    motion_data = analyze_motion(video_path, fps=10.0)
    motion_stats = compute_motion_stats(motion_data)

    beat_result = None
    if info.get("has_audio"):
        import tempfile, subprocess
        audio_path = tempfile.mktemp(suffix=".wav")
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
            "-ar", "44100", "-ac", "1", audio_path
        ], capture_output=True, timeout=60)
        if os.path.exists(audio_path) and os.path.getsize(audio_path) > 1000:
            beat_result = detect_beats(audio_path)
        os.remove(audio_path)

    color_data = analyze_color(video_path, sample_rate=2.0)
    shot_type_results = classify_shot_type(video_path, shots)
    shot_type_summary = aggregate_shot_types(shot_type_results)

    effects_results = detect_effects(video_path, shots)
    effects_summary = aggregate_effects(effects_results)

    text_results = detect_text(video_path, shots)
    text_summary = aggregate_text_results(text_results)

    speed_results = detect_speed_ramps(video_path, shots)
    speed_summary = aggregate_speed_results(speed_results)

    # Inject results into shots
    for i, shot in enumerate(shots):
        shot["shotType"] = shot_type_results[i]["shotType"] if i < len(shot_type_results) else "medium"
        if i < len(effects_results):
            raw_fx = effects_results[i].get("effects", [])
            raw_vfx = effects_results[i].get("visualEffects", [])
            shot["effects"] = list(dict.fromkeys([e for e in raw_fx if e != "cut"]))[:1]
            shot["transitions_list"] = effects_results[i].get("transitions", [])
            shot["visualEffects"] = list(dict.fromkeys([e for e in raw_vfx if e != "cut"]))[:1]
        else:
            shot["effects"] = []
            shot["transitions_list"] = []
            shot["visualEffects"] = []
        shot["hasText"] = text_results[i].get("hasText", False) if i < len(text_results) else False
        shot["textCount"] = text_results[i].get("textCount", 0) if i < len(text_results) else 0
        shot["avgSpeed"] = speed_results[i].get("avgSpeed", 1.0) if i < len(speed_results) else 1.0
        shot["speedType"] = speed_results[i].get("speedType", "normal") if i < len(speed_results) else "normal"
        shot["hasRamp"] = speed_results[i].get("hasRamp", False) if i < len(speed_results) else False

        # Per-shot motion
        shot_motion = [m for m in motion_data if shot["start"] <= m["time"] <= shot["end"]]
        if shot_motion:
            sm = compute_motion_stats(shot_motion)
            shot["motion_magnitude"] = sm["avg_magnitude"]
        else:
            shot["motion_magnitude"] = 0

    # ── Enhanced analyzers ──
    if verbose:
        print("\n--- Enhanced Analysis ---")

    color_grades = track_color_grades(video_path, shots)
    transitions = classify_transitions(video_path, shots)
    speed_direction = analyze_speed_direction(video_path, shots)

    # Build complete editorial style document
    export = {
        "video": {
            "path": video_path,
            "name": name,
            "duration": info["duration"],
            "resolution": f"{info['width']}x{info['height']}",
            "fps": info["fps"],
            "shots": len(shots),
        },
        "colorTimeline": color_grades,
        "transitions": transitions,
        "speedDirection": speed_direction,
        "standard": {
            "motion": {
                "avgMagnitude": motion_stats["avg_magnitude"],
                "peakMagnitude": motion_stats["peak_magnitude"],
                "peakTime": motion_stats.get("peak_time", 0),
            },
            "audio": {
                "bpm": beat_result["tempo_bpm"] if beat_result else None,
                "beatCount": beat_result["beat_count"] if beat_result else 0,
            } if beat_result else None,
            "color": {
                "grade": color_data["grade"],
                "saturation": color_data["saturation_mean"],
                "temperature": color_data["color_temperature"],
            },
            "shotTypes": shot_type_summary,
            "effects": effects_summary,
            "text": text_summary,
            "speed": speed_summary,
        },
        "shots": [],
    }

    for i, shot in enumerate(shots):
        export["shots"].append({
            "index": i,
            "time": f"{shot['start']:.1f}-{shot['end']:.1f}s",
            "duration": round(shot["duration"], 2),
            "type": shot["shotType"],
            "motion": round(shot["motion_magnitude"], 3),
            "color": color_grades["perShot"][i] if i < len(color_grades["perShot"]) else {},
            "speed_base": {
                "speed": shot["avgSpeed"],
                "type": shot["speedType"],
                "hasRamp": shot["hasRamp"],
            },
            "speed_direction": speed_direction["perShot"][i] if i < len(speed_direction["perShot"]) else {},
            "transition": transitions["transitions"][i] if i < len(transitions["transitions"]) else {},
            "effects": shot.get("effects", []),
            "text": shot.get("hasText", False),
        })

    return export


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("video", help="Reference video path")
    parser.add_argument("--name", default="reference", help="Export name")
    parser.add_argument("--output", default=None, help="Output JSON path")
    args = parser.parse_args()

    result = export_editorial_style(args.video, args.name)

    output_path = args.output or f"/tmp/{args.name}-editorial-style.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    # Print summary
    c = result.get("colorTimeline", {})
    t = result.get("transitions", {})
    sd = result.get("speedDirection", {})

    print(f"\n{'='*60}")
    print(f"  EDITORIAL STYLE: {args.name}")
    print(f"{'='*60}")

    print(f"\n  COLOR PHASES:")
    for phase in c.get("phases", []):
        print(f"    {phase['type'].upper():>8}: {phase['start']:.1f}s - {phase['end']:.1f}s  ({phase.get('grade','?')})")

    print(f"\n  SPEED:")
    print(f"    Avg: {sd.get('avgSpeed', 1):.1f}x")
    print(f"    Dominant: {sd.get('dominantSpeedType', 'normal')}")
    print(f"    Reverse shots: {sd.get('reverseShotCount', 0)}/{result['video']['shots']}")
    print(f"    Ramps: {sd.get('rampShotCount', 0)}/{result['video']['shots']}")
    for sp in sd.get("perShot", []):
        if sp.get("isReverse"):
            print(f"      REVERSE shot #{sp.get('_', '?')}")
    for sp in sd.get("perShot", []):
        if sp.get("hasRamp"):
            print(f"      RAMP: {sp.get('speed', 1):.1f}x {sp.get('rampType','?')}")

    print(f"\n  TRANSITIONS:")
    for tt, count in t.get("transitionCounts", {}).items():
        print(f"    {tt}: {count}x")
