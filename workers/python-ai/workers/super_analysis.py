"""
super_analysis.py — all-in-one analysis pipeline for the AI director.

Combines:
  - Beat detection (madmom + essentia)
  - Key/mood/genre (essentia)
  - Shot detection (TransNetV2 + PySceneDetect)
  - Optical flow (RAFT + Farneback)
  - Semantic tagging (CLIP)
  - Face detection (mediapipe)
  - Object detection (YOLO)
  - Text detection (pytesseract)
  - Background removal (rembg/GrabCut)
  - Depth estimation (MiDaS)

Install: see requirements.txt
"""
from __future__ import annotations
import json
import sys
import os
import numpy as np
from typing import Optional


def super_analyze_video(video_path: str) -> dict:
    """Run ALL analysis on a video file."""
    results = {}
    
    # 1. Beat + Music analysis (essentia)
    try:
        from audio_analysis_pro import analyze_audio
        results["audio"] = analyze_audio(video_path)
    except Exception as e:
        results["audio"] = {"error": str(e)}
    
    # 2. Shot detection
    try:
        from perception_pro import detect_shots
        shots, backend = detect_shots(video_path) if isinstance(detect_shots(video_path), tuple) else (detect_shots(video_path), "unknown")
        results["shots"] = {"shots": shots, "backend": backend, "count": len(shots)}
    except Exception as e:
        results["shots"] = {"error": str(e), "shots": [], "count": 0}
    
    # 3. Optical flow
    try:
        from perception_pro import flow_velocity
        velocity, flow_backend = flow_velocity(video_path) if isinstance(flow_velocity(video_path), tuple) else (flow_velocity(video_path), "unknown")
        results["flow"] = {"samples": len(velocity), "backend": flow_backend, "velocity": velocity[:10]}  # First 10 samples
    except Exception as e:
        results["flow"] = {"error": str(e), "samples": 0}
    
    # 4. CLIP semantics (on middle frame)
    try:
        import cv2
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        mid_frame = total_frames // 2
        cap.set(cv2.CAP_PROP_POS_FRAMES, mid_frame)
        ret, frame = cap.read()
        cap.release()
        
        if ret:
            # Save middle frame for analysis
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                cv2.imwrite(f.name, frame)
                temp_path = f.name
            
            # Run enhanced analysis
            from enhanced_analysis import analyze_frame
            results["enhanced"] = analyze_frame(temp_path)
            
            os.unlink(temp_path)
    except Exception as e:
        results["enhanced"] = {"error": str(e)}
    
    # 5. Depth estimation (on middle frame)
    try:
        import cv2
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        mid_frame = total_frames // 2
        cap.set(cv2.CAP_PROP_POS_FRAMES, mid_frame)
        ret, frame = cap.read()
        cap.release()
        
        if ret:
            small = cv2.resize(frame, (384, 384))
            from depth_estimation import estimate_depth
            results["depth"] = estimate_depth(small)
    except Exception as e:
        results["depth"] = {"error": str(e)}
    
    # 6. Compile director-ready summary
    results["director_summary"] = compile_director_summary(results)
    
    return results


def compile_director_summary(results: dict) -> dict:
    """Compile analysis into a director-ready summary."""
    summary = {
        "mood": "unknown",
        "energy": "medium",
        "pacing": "medium",
        "has_vocals": False,
        "key": "unknown",
        "bpm": 120,
        "composition": "unknown",
        "has_text": False,
        "has_subject": False,
        "parallax": False,
        "shot_count": 0,
        "avg_shot_duration": 0,
    }
    
    # Audio
    if "audio" in results and "error" not in results["audio"]:
        audio = results["audio"]
        summary["key"] = f"{audio.get('key', {}).get('name', 'unknown')} {audio.get('key', {}).get('scale', '')}"
        summary["bpm"] = audio.get("bpm", 120)
        summary["mood"] = audio.get("mood", {}).get("primary", "unknown")
        summary["energy"] = audio.get("mood", {}).get("energy_level", "medium")
        summary["has_vocals"] = audio.get("vocal", {}).get("has_vocals", False)
        summary["danceability"] = audio.get("danceability", 0.5)
    
    # Shots
    if "shots" in results:
        summary["shot_count"] = results["shots"].get("count", 0)
        if summary["shot_count"] > 0:
            shots = results["shots"].get("shots", [])
            if shots:
                durations = [s.get("duration", 0) for s in shots]
                summary["avg_shot_duration"] = round(np.mean(durations), 2) if durations else 0
    
    # Enhanced
    if "enhanced" in results and "error" not in results["enhanced"]:
        enhanced = results["enhanced"]
        summary["composition"] = enhanced.get("composition", "unknown")
        summary["has_text"] = enhanced.get("has_text", False)
        summary["has_subject"] = enhanced.get("has_subject", False)
    
    # Depth
    if "depth" in results and "error" not in results["depth"]:
        summary["parallax"] = results["depth"].get("has_parallax", False)
        summary["parallax_strength"] = results["depth"].get("parallax_strength", 0)
    
    return summary


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: super_analysis.py <video_path>"}))
        sys.exit(1)
    
    result = super_analyze_video(sys.argv[1])
    print(json.dumps(result))
