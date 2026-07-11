"""
Motion Scorer — Scores motion intensity per video segment.

Inspired by auto-editor's motion detection. Uses FFmpeg to extract
per-frame motion data and computes segment-level motion scores.

Usage:
    python motion_scorer.py <video_path>
    Or via subprocess import: from motion_scorer import score_motion
"""

import json
import sys
import subprocess
import tempfile
import os
import struct
from pathlib import Path

def extract_motion_data(video_path: str, interval: float = 0.5) -> list:
    """Extract per-frame motion using FFmpeg frame difference."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Extract grayscale frames
        pattern = os.path.join(tmp_dir, "frame_%06d.png")
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", f"fps=1/{interval},format=gray",
            "-q:v", "2", pattern,
            "-y", "-loglevel", "error"
        ]
        subprocess.run(cmd, timeout=60, check=False)

        frames = sorted(Path(tmp_dir).glob("frame_*.png"))
        if len(frames) < 2:
            return []

        motion_data = []
        prev_data = None

        for i, frame_path in enumerate(frames):
            with open(frame_path, "rb") as f:
                data = f.read()

            # Simple byte-level motion estimation
            # Sample every 100th byte for speed
            sample = data[100::100]
            if prev_data is not None:
                prev_sample = prev_data[100::100] if len(prev_data) > 100 else prev_data
                min_len = min(len(sample), len(prev_sample))
                if min_len > 0:
                    diff = sum(abs(a - b) for a, b in zip(sample[:min_len], prev_sample[:min_len])) / min_len
                    normalized = min(1.0, diff / 50.0)  # Normalize to 0-1
                else:
                    normalized = 0
            else:
                normalized = 0

            motion_data.append({
                "timestamp": round(i * interval, 3),
                "motion": round(normalized, 4),
            })
            prev_data = data

        return motion_data


def score_motion(video_path: str, interval: float = 0.5) -> dict:
    """
    Score motion intensity per segment of a video.

    Returns segments with motion scores, motionless detection,
    and overall motion profile.
    """
    try:
        # Get total duration
        dur_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        dur_result = subprocess.run(dur_cmd, capture_output=True, text=True, timeout=15)
        total_duration = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 60

        # Extract motion data
        motion_data = extract_motion_data(video_path, interval)

        if not motion_data:
            return {"segments": [], "totalDuration": total_duration, "error": "no motion data"}

        # Build segments from motion data
        # Group into ~3-second segments
        segment_duration = 3.0
        segments = []

        for seg_start in range(0, int(total_duration), int(segment_duration)):
            seg_end = min(seg_start + segment_duration, total_duration)
            seg_frames = [
                m for m in motion_data
                if m["timestamp"] >= seg_start and m["timestamp"] < seg_end
            ]

            if not seg_frames:
                continue

            avg_motion = sum(f["motion"] for f in seg_frames) / len(seg_frames)
            max_motion = max(f["motion"] for f in seg_frames)
            min_motion = min(f["motion"] for f in seg_frames)

            # Classify motion level
            if avg_motion < 0.02:
                motion_level = "motionless"
            elif avg_motion < 0.1:
                motion_level = "low"
            elif avg_motion < 0.3:
                motion_level = "medium"
            else:
                motion_level = "high"

            segments.append({
                "start": round(seg_start, 3),
                "end": round(seg_end, 3),
                "duration": round(seg_end - seg_start, 3),
                "avgMotion": round(avg_motion, 4),
                "maxMotion": round(max_motion, 4),
                "minMotion": round(min_motion, 4),
                "motionLevel": motion_level,
                "isMotionless": avg_motion < 0.02,
                "frameCount": len(seg_frames),
            })

        # Overall stats
        all_motion = [m["motion"] for m in motion_data]
        avg_overall = sum(all_motion) / len(all_motion) if all_motion else 0
        motionless_segments = [s for s in segments if s["isMotionless"]]
        motionless_ratio = sum(s["duration"] for s in motionless_segments) / max(total_duration, 0.001)

        return {
            "segments": segments,
            "totalDuration": round(total_duration, 3),
            "avgMotion": round(avg_overall, 4),
            "motionlessRatio": round(motionless_ratio, 4),
            "motionlessCount": len(motionless_segments),
            "totalSegments": len(segments),
            "sampleInterval": interval,
        }

    except Exception as e:
        return {"error": str(e), "segments": [], "totalDuration": 0}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python motion_scorer.py <video_path>"}))
        sys.exit(1)
    result = score_motion(sys.argv[1])
    print(json.dumps(result))
