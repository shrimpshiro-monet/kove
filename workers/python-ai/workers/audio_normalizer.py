"""
Audio Normalizer — Normalizes audio levels in video.

Inspired by auto-editor's EBU R128 and peak normalization.
Extracts audio, computes loudness stats, and returns normalization parameters.

Usage:
    python audio_normalizer.py <video_path>
    Or via subprocess import: from audio_normalizer import normalize_audio
"""

import json
import sys
import subprocess
import tempfile
import os
import re

def normalize_audio(video_path: str, target_lufs: float = -16.0) -> dict:
    """
    Analyze audio loudness and return normalization parameters.

    Uses FFmpeg's loudnorm filter for EBU R128 analysis.

    Args:
        video_path: Path to video file
        target_lufs: Target integrated loudness in LUFS (default -16, podcast standard)

    Returns:
        dict with loudness stats and normalization parameters
    """
    try:
        # Extract audio to temp WAV for analysis
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_audio:
            tmp_path = tmp_audio.name

        try:
            # Extract audio
            extract_cmd = [
                "ffmpeg", "-i", video_path,
                "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1",
                tmp_path, "-y", "-loglevel", "error"
            ]
            subprocess.run(extract_cmd, timeout=30, check=False)

            # Get duration
            dur_cmd = [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path
            ]
            dur_result = subprocess.run(dur_cmd, capture_output=True, text=True, timeout=15)
            total_duration = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 60

            # Run loudnorm for first pass (analysis)
            loudnorm_cmd = [
                "ffmpeg", "-i", tmp_path,
                "-af", f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11:print_format=json",
                "-f", "null", "-"
            ]
            result = subprocess.run(loudnorm_cmd, capture_output=True, text=True, timeout=60)

            # Parse loudnorm JSON output from stderr
            json_str = ""
            in_json = False
            for line in result.stderr.split("\n"):
                if "{" in line and "input_i" in line:
                    in_json = True
                if in_json:
                    json_str += line
                if "}" in line and in_json:
                    break

            # Try to extract the JSON block
            try:
                # Find the JSON object in the output
                start = result.stderr.rfind("{")
                end = result.stderr.rfind("}") + 1
                if start >= 0 and end > start:
                    json_str = result.stderr[start:end]
                    loudness_data = json.loads(json_str)
                else:
                    loudness_data = None
            except json.JSONDecodeError:
                loudness_data = None

            if loudness_data:
                input_i = float(loudness_data.get("input_i", -23))
                input_tp = float(loudness_data.get("input_tp", -23))
                input_lra = float(loudness_data.get("input_lra", 7))
                input_thresh = float(loudness_data.get("input_thresh", -34))
                target_offset = float(loudness_data.get("target_offset", 0))

                # Calculate normalization gain
                gain_db = target_lufs - input_i

                return {
                    "inputLoudness": round(input_i, 2),
                    "inputTruePeak": round(input_tp, 2),
                    "inputLRA": round(input_lra, 2),
                    "inputThreshold": round(input_thresh, 2),
                    "targetLoudness": target_lufs,
                    "targetOffset": round(target_offset, 2),
                    "gainDb": round(gain_db, 2),
                    "gainLinear": round(10 ** (gain_db / 20), 4),
                    "needsNormalization": abs(gain_db) > 1.0,
                    "totalDuration": round(total_duration, 2),
                    "normalizationType": "ebu_r128",
                }
            else:
                # Fallback: use simple peak analysis
                return _peak_analysis(tmp_path, total_duration, target_lufs)

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        return {"error": str(e), "needsNormalization": False}


def _peak_analysis(audio_path: str, total_duration: float, target_lufs: float) -> dict:
    """Fallback peak-based normalization analysis."""
    try:
        # Use astats for peak analysis
        cmd = [
            "ffmpeg", "-i", audio_path,
            "-af", "astats=metadata=1:reset=0",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        # Parse peak level
        peak_match = re.search(r"Peak level dB:\s*([-\d.]+)", result.stderr)
        rms_match = re.search(r"RMS level dB:\s*([-\d.]+)", result.stderr)

        peak_db = float(peak_match.group(1)) if peak_match else -20
        rms_db = float(rms_match.group(1)) if rms_match else -25

        # Estimate LUFS from RMS (rough approximation)
        estimated_lufs = rms_db - 0.691  # Rough LUFS estimation from RMS

        gain_db = target_lufs - estimated_lufs

        return {
            "inputLoudness": round(estimated_lufs, 2),
            "inputTruePeak": round(peak_db, 2),
            "inputLRA": 7.0,  # Default assumption
            "inputThreshold": round(estimated_lufs - 10, 2),
            "targetLoudness": target_lufs,
            "targetOffset": 0,
            "gainDb": round(gain_db, 2),
            "gainLinear": round(10 ** (gain_db / 20), 4),
            "needsNormalization": abs(gain_db) > 1.0,
            "totalDuration": round(total_duration, 2),
            "normalizationType": "peak_fallback",
        }
    except Exception:
        return {
            "inputLoudness": -23, "inputTruePeak": -20, "inputLRA": 7,
            "targetLoudness": target_lufs, "gainDb": 0, "gainLinear": 1.0,
            "needsNormalization": False, "totalDuration": round(total_duration, 2),
            "normalizationType": "unknown",
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python audio_normalizer.py <video_path>"}))
        sys.exit(1)
    result = normalize_audio(sys.argv[1])
    print(json.dumps(result))
