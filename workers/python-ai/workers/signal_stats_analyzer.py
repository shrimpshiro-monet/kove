"""
Signal Stats Analyzer — FFmpeg signalstats for color/flash detection.

Extracts luma, saturation, hue curves and detects flash frames
using FFmpeg's signalstats filter.

Usage:
    python signal_stats_analyzer.py <video_path>
    Or via subprocess import: from signal_stats_analyzer import analyze_signal_stats
"""

import json
import sys
import subprocess
import re

def analyze_signal_stats(video_path: str) -> dict:
    """
    Main entry point. Runs FFmpeg signalstats to extract color metrics
    and detect flash frames.
    """
    try:
        # Run FFmpeg with signalstats filter and metadata output
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", "signalstats=stat=brng",
            "-an", "-f", "null", "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        # Parse signalstats output from stderr
        luma_values = []
        saturation_values = []
        hue_values = []
        timestamps = []

        for line in result.stderr.split("\n"):
            if "Parsed_signalstats" not in line and "YAVG" not in line:
                continue

            # Parse YAVG (luma average)
            y_match = re.search(r"YAVG:(\d+\.?\d*)", line)
            s_match = re.search(r"SAV:(\d+\.?\d*)", line)
            h_match = re.search(r"HAV:(\d+\.?\d*)", line)
            t_match = re.search(r"n:(\d+)", line)

            if y_match:
                luma_values.append(float(y_match.group(1)) / 255.0)  # Normalize to 0-1
            if s_match:
                saturation_values.append(float(s_match.group(1)) / 255.0)
            if h_match:
                hue_values.append(float(h_match.group(1)) / 360.0)  # Normalize to 0-1
            if t_match:
                timestamps.append(int(t_match.group(1)))

        if not luma_values:
            return _fallback_analysis(video_path)

        # Compute statistics
        avg_luma = sum(luma_values) / len(luma_values) if luma_values else 0.5
        avg_saturation = sum(saturation_values) / len(saturation_values) if saturation_values else 0.5
        avg_hue = sum(hue_values) / len(hue_values) if hue_values else 0.5

        luma_var = sum((x - avg_luma) ** 2 for x in luma_values) / max(len(luma_values), 1)
        sat_var = sum((x - avg_saturation) ** 2 for x in saturation_values) / max(len(saturation_values), 1)

        # Detect flash frames (luma > 0.9 sudden spike)
        flash_timestamps = []
        for i in range(1, len(luma_values)):
            if luma_values[i] > 0.9 and luma_values[i-1] < 0.6:
                # Approximate timestamp from frame index
                t = i * 0.033  # ~30fps assumption
                flash_timestamps.append(round(t, 3))

        # Detect exposure pulses (significant luma change)
        exposure_pulses = 0
        for i in range(1, len(luma_values)):
            if abs(luma_values[i] - luma_values[i-1]) > 0.3:
                exposure_pulses += 1

        # Build downsampled curves (50 points max)
        n = len(luma_values)
        step = max(1, n // 50)
        luma_curve = [round(luma_values[i], 3) for i in range(0, n, step)]
        sat_curve = [round(saturation_values[i], 3) for i in range(0, min(len(saturation_values), n), step)]
        hue_curve = [round(hue_values[i], 3) for i in range(0, min(len(hue_values), n), step)]

        return {
            "avgSaturation": round(avg_saturation, 4),
            "avgHue": round(avg_hue, 4),
            "avgLuma": round(avg_luma, 4),
            "saturationVariance": round(sat_var, 6),
            "flashCount": len(flash_timestamps),
            "flashTimestamps": flash_timestamps[:20],
            "exposurePulseCount": exposure_pulses,
            "saturationCurve": sat_curve,
            "lumaCurve": luma_curve,
            "hueCurve": hue_curve,
        }

    except Exception as e:
        return _fallback_analysis(video_path, str(e))


def _fallback_analysis(video_path: str, error: str = None) -> dict:
    """Fallback: extract basic color info from a few frames."""
    try:
        # Extract 5 frames and compute basic color stats
        import subprocess
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmp_dir:
            # Extract frames
            subprocess.run([
                "ffmpeg", "-i", video_path,
                "-vf", "select='not(mod(n\,100))',setpts=N/FRAME_RATE/TB",
                "-frames:v", "5",
                "-q:v", "3",
                os.path.join(tmp_dir, "frame_%02d.jpg"),
                "-y", "-loglevel", "error"
            ], timeout=15, check=False)

            frames = sorted([f for f in os.listdir(tmp_dir) if f.endswith(".jpg")])
            if not frames:
                return {"error": "no frames extracted"}

            # Use ffmpeg to get average color
            for frame in frames:
                frame_path = os.path.join(tmp_dir, frame)
                cmd = [
                    "ffmpeg", "-i", frame_path,
                    "-vf", "signalstats",
                    "-f", "null", "-"
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

                y_match = re.search(r"YAVG:(\d+\.?\d*)", result.stderr)
                s_match = re.search(r"SAV:(\d+\.?\d*)", result.stderr)

                if y_match and s_match:
                    return {
                        "avgSaturation": round(float(s_match.group(1)) / 255.0, 4),
                        "avgHue": 0.5,
                        "avgLuma": round(float(y_match.group(1)) / 255.0, 4),
                        "saturationVariance": 0.01,
                        "flashCount": 0,
                        "flashTimestamps": [],
                        "exposurePulseCount": 0,
                        "saturationCurve": [],
                        "lumaCurve": [],
                        "hueCurve": [],
                        "source": "fallback",
                    }

        return {"error": error or "signalstats analysis failed"}

    except Exception:
        return {"error": error or "all methods failed"}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python signal_stats_analyzer.py <video_path>"}))
        sys.exit(1)
    result = analyze_signal_stats(sys.argv[1])
    print(json.dumps(result))
