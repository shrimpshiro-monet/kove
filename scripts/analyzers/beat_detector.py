"""
Beat Detector
Analyzes audio to detect beats, tempo, and rhythmic patterns.
Primary method: librosa beat tracking (real beat detection).
Fallback: FFmpeg energy-based peak detection.
"""

import subprocess
import re
import json
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Tolerance window for beat-cut alignment (seconds)
# A cut is "on beat" if a beat falls within this window
BEAT_CUT_TOLERANCE = 0.1  # 100ms

# Threshold for isBeatDriven flag
BEAT_DRIVEN_THRESHOLD = 0.4  # 40% of cuts on beat = beat-driven


def detect_beats(audio_path: str, profile: Optional[dict] = None) -> Dict:
    """
    Detect beats in audio.
    Primary: librosa beat tracking.
    Fallback: FFmpeg energy peaks.
    
    Returns dict with:
        tempo_bpm: float
        beats: List[{"time": float, "strength": float}]
        beat_count: int
        avg_beat_interval: float
        beat_method: str ("librosa" | "energy")
    """
    print("  Detecting beats...")
    
    # profile passed through for analyze_rhythm threshold consumption
    
    # Try librosa first (real beat tracking)
    try:
        result = detect_beats_librosa(audio_path)
        if result and result["beat_count"] > 0:
            return result
    except ImportError:
        logger.warning("librosa not available, falling back to energy-based detection")
    except Exception as e:
        logger.warning(f"librosa beat detection failed: {e}, falling back to energy-based")
    
    # Fallback to energy-based
    return detect_beats_energy(audio_path)


def detect_beats_librosa(audio_path: str) -> Dict:
    """
    Real beat detection using librosa.
    
    Uses librosa.load() + librosa.beat.beat_track() for proper
    onset detection and tempo estimation.
    """
    import librosa
    import numpy as np
    
    print("    Using librosa beat tracking...")
    
    # Load audio (mono, sr=22050 for efficiency)
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    
    # Track beats
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    
    # Convert frame indices to times
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    
    # Get tempo as scalar (librosa may return array)
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0]) if len(tempo) > 0 else 0.0
    else:
        tempo = float(tempo)
    
    # Get onset strength for beat strength
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_times = librosa.times_like(onset_env, sr=sr)
    
    # Compute beat strengths from onset envelope
    beats = []
    for bt in beat_times:
        # Find closest onset strength
        idx = np.argmin(np.abs(onset_times - bt))
        strength = float(onset_env[idx]) / float(onset_env.max()) if onset_env.max() > 0 else 0.5
        
        beats.append({
            "time": float(bt),
            "strength": min(1.0, strength),
        })
    
    print(f"    Librosa found {len(beats)} beats at {tempo:.1f} BPM")
    
    return {
        "tempo_bpm": round(tempo, 1),
        "beats": beats,
        "beat_count": len(beats),
        "avg_beat_interval": 60.0 / tempo if tempo > 0 else 0,
        "beat_method": "librosa",
    }


def detect_beats_energy(audio_path: str) -> Dict:
    """
    Fallback beat detection using FFmpeg energy peaks.
    Less accurate than librosa but works without dependencies.
    """
    print("    Using energy-based fallback...")
    
    # Get RMS energy
    cmd = [
        "ffmpeg", "-i", audio_path,
        "-af", "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
        "-f", "null", "-"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    
    # Parse RMS levels
    energy_data = []
    frame_count = 0
    
    for line in result.stderr.split("\n"):
        if "frame:" in line:
            frame_match = re.search(r'frame:\s*(\d+)', line)
            if frame_match:
                frame_count = int(frame_match.group(1))
        
        if "RMS_level" in line:
            rms_match = re.search(r'RMS_level=(-?\d+\.?\d*)', line)
            if rms_match:
                try:
                    rms = float(rms_match.group(1))
                    time = frame_count * 1024 / 44100.0
                    energy_data.append({
                        "time": time,
                        "energy": 10 ** (rms / 20)
                    })
                except:
                    pass
    
    # Find peaks (beats)
    beats = []
    if len(energy_data) > 10:
        window = 5
        smoothed = []
        for i in range(len(energy_data)):
            start = max(0, i - window)
            end = min(len(energy_data), i + window + 1)
            avg = sum(e["energy"] for e in energy_data[start:end]) / (end - start)
            smoothed.append(avg)
        
        for i in range(1, len(smoothed) - 1):
            if smoothed[i] > smoothed[i-1] and smoothed[i] > smoothed[i+1]:
                if smoothed[i] > 0.1:
                    beats.append({
                        "time": energy_data[i]["time"],
                        "strength": min(1.0, smoothed[i] * 2),
                    })
    
    # Estimate tempo
    tempo = _estimate_tempo_from_beats(beats)
    
    return {
        "tempo_bpm": round(tempo, 1),
        "beats": beats,
        "beat_count": len(beats),
        "avg_beat_interval": 60.0 / tempo if tempo > 0 else 0,
        "beat_method": "energy",
    }


def _estimate_tempo_from_beats(beats: List[Dict]) -> float:
    """Estimate tempo from beat times (fallback method)."""
    if len(beats) < 2:
        return 0.0
    
    intervals = []
    for i in range(1, len(beats)):
        interval = beats[i]["time"] - beats[i-1]["time"]
        if 0.2 < interval < 2.0:
            intervals.append(interval)
    
    if not intervals:
        return 0.0
    
    avg_interval = sum(intervals) / len(intervals)
    bpm = 60.0 / avg_interval
    
    while bpm < 60:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    
    return bpm


def analyze_rhythm(beats: List[Dict], cut_times: List[float], profile: Optional[dict] = None) -> Dict:
    """
    Analyze rhythm: how cuts align with beats.
    """
    p = profile or {}
    bc = p.get("beat", {})
    beat_cut_tolerance = bc.get("beat_cut_tolerance", 0.1)
    beat_driven_threshold = bc.get("beat_driven_threshold", 0.4)
    
    if not beats or not cut_times:
        return {
            "cuts_on_beat": 0.0,
            "cuts_off_beat": 100.0,
            "avg_beats_between_cuts": 0.0,
            "isBeatDriven": False,
            "rhythm_pattern": [],
        }
    
    beat_times = [b["time"] for b in beats]
    
    cuts_on_beat = 0
    beats_between_cuts = []
    rhythm_pattern = []
    
    for cut_time in cut_times:
        on_beat = any(
            abs(cut_time - bt) <= beat_cut_tolerance
            for bt in beat_times
        )
        
        if on_beat:
            cuts_on_beat += 1
            rhythm_pattern.append("beat")
        else:
            rhythm_pattern.append("off")
    
    for i in range(1, len(cut_times)):
        beats_in_segment = sum(
            1 for bt in beat_times
            if cut_times[i-1] <= bt <= cut_times[i]
        )
        beats_between_cuts.append(beats_in_segment)
    
    on_beat_pct = (cuts_on_beat / len(cut_times) * 100) if cut_times else 0
    avg_beats = sum(beats_between_cuts) / len(beats_between_cuts) if beats_between_cuts else 0
    
    return {
        "cuts_on_beat": on_beat_pct,
        "cuts_off_beat": 100 - on_beat_pct,
        "avg_beats_between_cuts": avg_beats,
        "isBeatDriven": on_beat_pct / 100 > beat_driven_threshold,
        "rhythm_pattern": rhythm_pattern,
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python beat_detector.py <audio_path>")
        sys.exit(1)
    
    audio_path = sys.argv[1]
    result = detect_beats(audio_path)
    
    print(f"\nBeat Detection:")
    print(f"  Method: {result['beat_method']}")
    print(f"  Tempo: {result['tempo_bpm']} BPM")
    print(f"  Beat count: {result['beat_count']}")
    print(f"  Avg interval: {result['avg_beat_interval']:.3f}s")
