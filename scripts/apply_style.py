#!/usr/bin/env python3
"""
Apply ReferenceStyleProfile to footage via the Monet EDL generation engine.

Reads a ReferenceStyleProfile JSON, bridges it to the DNA dict format
expected by generate_edl_from_dna() from monet_pipeline.py, then optionally renders.

Usage:
    python scripts/apply_style.py <profile.json> <footage.mp4> [-o output-base] [--render]
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

WORKSPACE = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = WORKSPACE / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from monet_pipeline import generate_edl_from_dna, render_with_editly


def reference_profile_to_dna(profile: dict) -> dict:
    """Bridge ReferenceStyleProfile JSON → DNA dict format for generate_edl_from_dna()."""
    segments = profile.get("segments", [])
    duration = profile.get("duration", 10)

    shots = []
    for i, seg in enumerate(segments):
        shots.append({
            "index": i,
            "start": seg.get("start", 0),
            "end": seg.get("end", 0),
            "duration": seg.get("duration", 0),
            "shotType": "medium",
            "camera_motion": seg.get("camera_motion", "static"),
            "subject_motion": "standing",
            "avgSpeed": seg.get("speed", 1.0),
            "speedType": "normal",
            "hasRamp": seg.get("speed", 1.0) != 1.0,
            "motion_magnitude": 0.1,
            "energy": 0.1,
            "effects": [],
            "transitions": [],
            "visualEffects": [],
            "hasText": seg.get("has_text", False),
            "textCount": 1 if seg.get("has_text", False) else 0,
            "textProperties": {},
            "semanticEvent": {
                "event_type": "action",
                "emotion": "neutral",
                "narrative_role": "building",
            },
        })

    cam_motion_dist = profile.get("camera_motion_distribution", {})
    dominant_motion = max(cam_motion_dist, key=cam_motion_dist.get) if cam_motion_dist else "static"

    shot_type_dist = {}
    for motion_type, ratio in cam_motion_dist.items():
        bucket = "wide" if motion_type in ("pan", "tilt") else "closeup" if motion_type == "zoom" else "medium"
        shot_type_dist[bucket] = shot_type_dist.get(bucket, 0) + ratio

    effect_fields = ["blur", "vignette", "grain", "glow", "shake", "rgb_split"]
    visual_effects = {}
    for seg in segments:
        for field in effect_fields:
            val = seg.get(field, 0)
            if val and val > 0:
                visual_effects[field] = visual_effects.get(field, 0) + 1

    total_effects = sum(visual_effects.values())

    transition_vocab = profile.get("transition_vocabulary", [])
    transitions = {t: 1 for t in transition_vocab}

    energy_curve = profile.get("energy_curve", [])
    n = max(len(energy_curve), 1)
    energy_points = [
        {"time": i * duration / n, "energy": e}
        for i, e in enumerate(energy_curve)
    ]

    cut_alignment = profile.get("cut_alignment", "none")
    cuts_on_beat = {"strict": 80, "loose": 50, "none": 10}.get(cut_alignment, 10)

    resolution = profile.get("resolution", [1920, 1080])
    if isinstance(resolution, tuple):
        resolution = list(resolution)

    dna = {
        "name": f"applied-{int(time.time())}",
        "source": profile.get("source_path", ""),
        "duration": duration,
        "resolution": {"width": resolution[0] if len(resolution) > 0 else 1920,
                       "height": resolution[1] if len(resolution) > 1 else 1080},
        "fps": profile.get("fps", 30),
        "referenceType": "unknown",
        "totalShots": len(shots),
        "avgShotDuration": profile.get("avg_shot_duration", 1.5),
        "cutRate": len(shots) / duration if duration > 0 else 0,
        "shots": shots,
        "motionStats": {
            "avg_magnitude": 0.1,
            "max_magnitude": 0.3,
            "std_magnitude": 0.05,
            "perc_10": 0.01,
            "perc_90": 0.2,
        },
        "colorProfile": {
            "grade": profile.get("color_signature", {}).get("style", "neutral"),
            "color_temperature": "neutral",
            "brightness": profile.get("color_signature", {}).get("brightness", 1.0),
            "contrast": profile.get("color_signature", {}).get("contrast", 1.0),
            "saturation": profile.get("color_signature", {}).get("saturation", 1.0),
        },
        "shotTypes": {
            "distribution": shot_type_dist,
            "dominantType": dominant_motion if dominant_motion in ("wide", "closeup", "medium") else "medium",
        },
        "effects": {
            "totalEffects": total_effects,
            "effectsPerShot": total_effects / len(shots) if shots else 0,
            "visualEffects": visual_effects,
            "transitions": transitions,
        },
        "text": {
            "hasText": any(s.get("has_text", False) for s in segments),
            "textFrequency": sum(1 for s in segments if s.get("has_text", False)) / len(segments) if segments else 0,
            "shotsWithText": sum(1 for s in segments if s.get("has_text", False)),
        },
        "speed": {
            "avgSpeed": profile.get("avg_speed", 1.0),
            "hasRamps": profile.get("speed_variance", 0) > 0.01,
            "speedTypes": {"normal": 1},
        },
        "semanticEvents": {
            "dominantEventType": "generic",
            "dominantEmotion": "neutral",
            "eventTypes": ["generic"],
            "emotions": ["neutral"],
        },
        "audioAnalysis": {
            "tempo_bpm": profile.get("bpm", 120),
            "beats": profile.get("beats", []),
            "has_audio": len(profile.get("beats", [])) > 0,
        },
        "rhythm": {
            "cuts_on_beat": cuts_on_beat,
            "beat_alignment_ratio": cuts_on_beat / 100,
        },
        "energyCurve": energy_points,
        "grammarRules": {
            "pacing": {
                "avgDuration": profile.get("avg_shot_duration", 1.5),
                "cutRate": len(shots) / duration if duration > 0 else 0,
            },
            "motion": {"avgMagnitude": 0.1, "hasHighMotion": False},
            "rhythm": {
                "tempo": profile.get("bpm", 0),
                "isBeatDriven": cut_alignment == "strict",
            },
            "color": {
                "grade": profile.get("color_signature", {}).get("style", "neutral"),
                "temperature": "neutral",
            },
            "shotTypes": {
                "distribution": shot_type_dist,
                "dominantType": dominant_motion if dominant_motion in ("wide", "closeup", "medium") else "medium",
            },
            "effects": {
                "totalEffects": total_effects,
                "effectsPerShot": total_effects / len(shots) if shots else 0,
            },
            "text": {
                "hasText": any(s.get("has_text", False) for s in segments),
                "textFrequency": sum(1 for s in segments if s.get("has_text", False)) / len(segments) if segments else 0,
            },
            "speed": {
                "avgSpeed": profile.get("avg_speed", 1.0),
                "hasRamps": profile.get("speed_variance", 0) > 0.01,
            },
            "semantic": {
                "dominantEventType": "generic",
                "dominantEmotion": "neutral",
            },
        },
    }

    return dna


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Apply ReferenceStyleProfile to footage via Monet EDL engine"
    )
    parser.add_argument("profile", help="Path to ReferenceStyleProfile JSON")
    parser.add_argument("footage", help="Path to footage video")
    parser.add_argument("-o", "--output", default=None,
                        help="Output path (EDL JSON, or base name)")
    parser.add_argument("--music", "-m", default=None, help="Music track (optional)")
    parser.add_argument("--render", action="store_true",
                        help="Render the EDL to MP4")

    args = parser.parse_args()

    with open(args.profile) as f:
        profile = json.load(f)

    if args.output:
        out = args.output
        if out.endswith(".json"):
            edl_path = out
            render_path = out.rsplit(".", 1)[0] + ".mp4"
        elif out.endswith(".mp4"):
            edl_path = out.rsplit(".", 1)[0] + "-edl.json"
            render_path = out
        else:
            edl_path = out + "-edl.json"
            render_path = out + ".mp4"
    else:
        base = f"applied-{int(time.time())}"
        edl_path = base + "-edl.json"
        render_path = base + ".mp4"

    print(f"\n{'=' * 60}")
    print("APPLY STYLE: Bridge ReferenceStyleProfile → DNA → EDL")
    print(f"{'=' * 60}")
    print(f"Profile: {args.profile}")
    print(f"Footage: {args.footage}")

    print("\n[1/3] Bridging ReferenceStyleProfile to DNA format...")
    dna = reference_profile_to_dna(profile)
    print(f"  Name: {dna['name']}")
    print(f"  Shots: {dna['totalShots']}")
    print(f"  Avg shot duration: {dna['avgShotDuration']:.3f}s")
    print(f"  Effects: {dna['effects']['totalEffects']}")

    print("\n[2/3] Generating EDL from DNA + footage...")
    edl = generate_edl_from_dna(dna, args.footage, args.music)
    edl["_dna"] = dna
    edl["_grammarRules"] = dna.get("grammarRules", {})

    with open(edl_path, "w") as f:
        json.dump(edl, f, indent=2)
    print(f"  EDL saved: {edl_path}")

    if args.render:
        print("\n[3/3] Rendering video...")
        success = render_with_editly(edl, render_path, args.music)
        if success:
            print(f"  Render complete: {render_path}")
        else:
            print("  Render failed")
    else:
        print("\n[3/3] Skipping render (use --render to enable)")
        print(f"  To render: --render flag")

    print(f"\n{'=' * 60}")
    print(f"Done. EDL: {edl_path}")
    if args.render:
        print(f"      Video: {render_path}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
