import numpy as np
from unittest.mock import patch, MagicMock
from src.beat_detection import BeatDetector

def test_detect_beats_with_click_track():
    """Use click track (impulses), not sine wave."""
    detector = BeatDetector()

    # Create synthetic click track: impulses at 140 BPM (0.4286s intervals)
    sr = 22050
    duration = 4.0
    bpm = 140.0
    beat_interval = 60.0 / bpm

    signal = np.zeros(int(sr * duration))
    beat_times = np.arange(0, duration, beat_interval)
    for bt in beat_times:
        idx = int(bt * sr)
        if idx < len(signal):
            signal[idx] = 1.0  # impulse

    result = detector.detect(signal, sr)

    assert 135 < result.bpm < 145
    assert len(result.beats) > 0
