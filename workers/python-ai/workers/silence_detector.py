"""
Silence Detector — Detects silent/dead sections in video audio.

Inspired by auto-editor's audio loudness detection. Uses FFmpeg silencedetect
to find quiet sections, then returns segments with silence labels.

Usage:
    python silence_detector.py <video_path>
    Or via subprocess import: from silence_detector import detect_silence
"""

import json
import sys
import subprocess
import re

def detect_silence(video_path: str, threshold_db: float = -30, min_duration: float = 0.3) -> dict:
    """
    Detect silent sections in video audio using FFmpeg silencedetect.

    Args:
        video_path: Path to video file
        threshold_db: Silence threshold in dB (default -30, auto-editor uses -30 to -40)
        min_duration: Minimum silence duration to report (seconds)

    Returns:
        dict with silence_segments, speech_segments, silence_ratio, total_silence_duration
    """
    try:
        # Run FFmpeg silencedetect
        cmd = [
            "ffmpeg", "-i", video_path,
            "-af", f"silencedetect=noise={threshold_db}dB:d={min_duration}",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        # Get total duration
        dur_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        dur_result = subprocess.run(dur_cmd, capture_output=True, text=True, timeout=15)
        total_duration = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 60

        # Parse silence intervals from stderr
        silence_starts = []
        silence_ends = []

        for line in result.stderr.split("\n"):
            start_match = re.search(r"silence_start:\s*([\d.]+)", line)
            end_match = re.search(r"silence_end:\s*([\d.]+)", line)

            if start_match:
                silence_starts.append(float(start_match.group(1)))
            if end_match:
                silence_ends.append(float(end_match.group(1)))

        # Build silence segments (pair starts with ends)
        silence_segments = []
        for i in range(min(len(silence_starts), len(silence_ends))):
            start = silence_starts[i]
            end = silence_ends[i]
            duration = end - start
            if duration >= min_duration:
                silence_segments.append({
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "duration": round(duration, 3),
                })

        # Handle case where silence starts but doesn't end (extends to end of video)
        if len(silence_starts) > len(silence_ends):
            last_start = silence_starts[-1]
            if total_duration - last_start >= min_duration:
                silence_segments.append({
                    "start": round(last_start, 3),
                    "end": round(total_duration, 3),
                    "duration": round(total_duration - last_start, 3),
                })

        # Build speech segments (gaps between silence)
        speech_segments = []
        prev_end = 0
        for seg in silence_segments:
            if seg["start"] > prev_end + 0.05:
                speech_segments.append({
                    "start": round(prev_end, 3),
                    "end": round(seg["start"], 3),
                    "duration": round(seg["start"] - prev_end, 3),
                })
            prev_end = seg["end"]
        if prev_end < total_duration - 0.05:
            speech_segments.append({
                "start": round(prev_end, 3),
                "end": round(total_duration, 3),
                "duration": round(total_duration - prev_end, 3),
            })

        total_silence = sum(s["duration"] for s in silence_segments)
        silence_ratio = total_silence / max(total_duration, 0.001)

        return {
            "silenceSegments": silence_segments,
            "speechSegments": speech_segments,
            "silenceRatio": round(silence_ratio, 4),
            "totalSilenceDuration": round(total_silence, 3),
            "totalDuration": round(total_duration, 3),
            "silenceCount": len(silence_segments),
            "speechCount": len(speech_segments),
            "thresholdDb": threshold_db,
            "minDuration": min_duration,
        }

    except Exception as e:
        return {"error": str(e), "silenceSegments": [], "speechSegments": [], "silenceRatio": 0}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python silence_detector.py <video_path>"}))
        sys.exit(1)
    result = detect_silence(sys.argv[1])
    print(json.dumps(result))
