"""
beat_engine.py — Human-grade rhythmic analysis for cutting.
Priority chain: madmom (beats+downbeats) -> BeatNet -> librosa fallback.
Always returns REAL transients (onsets w/ strength+band), never a synthetic grid.

Install:
    pip install librosa numpy
    pip install cython numpy && pip install madmom   # best beats+downbeats
    # optional: pip install BeatNet
"""
from __future__ import annotations
import json
import sys
from dataclasses import dataclass, asdict
from typing import Optional
import numpy as np


@dataclass
class Onset:
    time: float
    strength: float          # 0..1 normalized
    band: str                # "low"=kick | "mid"=snare/vocal | "high"=hat


@dataclass
class RhythmMap:
    bpm: float
    beats: list[float]
    downbeats: list[float]           # bar starts -> hero/section-cut candidates
    onsets: list[dict]
    drop_candidates: list[float]     # strongest energy jumps ("the drop")
    source: str
    duration: float
    beat_sync_available: bool


# ---------- BAND-SPLIT ONSETS (kick vs snare vs hat) ----------
def _band_onsets(y: np.ndarray, sr: int) -> list[Onset]:
    from scipy.signal import stft, find_peaks
    onsets: list[Onset] = []
    bands = {"low": (20, 200), "mid": (200, 2000), "high": (2000, 11000)}
    hop = 256
    freqs, _, S = stft(y, fs=sr, nperseg=2048, noverlap=2048 - hop)
    S = np.abs(S)
    for band, (lo, hi) in bands.items():
        mask = (freqs >= lo) & (freqs < hi)
        if not mask.any():
            continue
        band_power = (S[mask, :] ** 2).sum(axis=0)
        # onset strength via spectral flux
        env = np.diff(band_power, prepend=0)
        env = np.maximum(env, 0)
        if env.size == 0 or env.max() <= 0:
            continue
        # smooth
        kernel = np.ones(5) / 5
        env = np.convolve(env, kernel, mode='same')
        peaks, _ = find_peaks(env, distance=4, prominence=0.15 * env.max())
        peak_norm = env / (env.max() + 1e-9)
        for p in peaks:
            t = float(p * hop / sr)
            onsets.append(Onset(time=t, strength=float(peak_norm[p]), band=band))
    onsets.sort(key=lambda o: o.time)
    return onsets


# ---------- DROP DETECTION (biggest energy jumps) ----------
def _drop_candidates(y: np.ndarray, sr: int, top_k: int = 3) -> list[float]:
    hop = 512
    frame_len = hop
    n_frames = len(y) // hop
    rms = np.array([
        np.sqrt(np.mean(y[i * hop:(i + 1) * hop] ** 2))
        for i in range(n_frames)
    ])
    if rms.size < 4:
        return []
    d = np.diff(rms)
    times = np.arange(d.size) * hop / sr
    thresh = float(np.std(d))
    idx = sorted(np.argsort(d)[-top_k:])
    return [float(times[i]) for i in idx if d[i] > thresh]


# ---------- ENGINE 1: madmom ----------
def _madmom_beats(path: str) -> Optional[tuple[float, list[float], list[float]]]:
    try:
        from madmom.features.downbeats import (
            RNNDownBeatProcessor, DBNDownBeatTrackingProcessor,
        )
        act = RNNDownBeatProcessor()(path)
        proc = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)
        out = proc(act)  # rows: [time, beat_position_in_bar]
        beats = [float(t) for t, _ in out]
        downbeats = [float(t) for t, pos in out if int(pos) == 1]
        bpm = 60.0 / float(np.median(np.diff(beats))) if len(beats) > 1 else 120.0
        return bpm, beats, downbeats
    except Exception:
        return None


# ---------- ENGINE 2: BeatNet ----------
def _beatnet_beats(path: str) -> Optional[tuple[float, list[float], list[float]]]:
    try:
        from BeatNet.BeatNet import BeatNet
        est = BeatNet(1, mode="offline", inference_model="DBN", plot=[], thread=False)
        out = est.process(path)  # [[time, beat_pos], ...]
        beats = [float(t) for t, _ in out]
        downbeats = [float(t) for t, pos in out if int(pos) == 1]
        bpm = 60.0 / float(np.median(np.diff(beats))) if len(beats) > 1 else 120.0
        return bpm, beats, downbeats
    except Exception:
        return None


# ---------- ENGINE 3: scipy fallback ----------
def _scipy_beats(y: np.ndarray, sr: int) -> tuple[float, list[float], list[float]]:
    from scipy.signal import find_peaks
    # compute onset envelope
    hop = 512
    frame_len = hop
    n_frames = len(y) // hop
    rms = np.array([
        np.sqrt(np.mean(y[i * hop:(i + 1) * hop] ** 2))
        for i in range(n_frames)
    ])
    if rms.size < 4:
        return 120.0, [], []
    # peak picking for beats
    peaks, _ = find_peaks(rms, distance=4, prominence=np.std(rms) * 0.3)
    beats = [float(p * hop / sr) for p in peaks]
    if len(beats) < 2:
        return 120.0, beats, []
    bpm = 60.0 / float(np.median(np.diff(beats)))
    downbeats = beats[::4] if beats else []
    return bpm, beats, downbeats


def analyze_rhythm(path: str) -> dict:
    import soundfile as sf
    import subprocess
    import tempfile
    import os

    # Extract audio from video if needed
    if path.lower().endswith(('.mp4', '.mov', '.avi', '.mkv', '.MP4', '.MOV')):
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp_path = tmp.name
        try:
            result = subprocess.run([
                'ffmpeg', '-i', path, '-vn', '-acodec', 'pcm_s16le',
                '-ar', '44100', '-ac', '1', tmp_path, '-y'
            ], capture_output=True, timeout=30)
            if result.returncode != 0:
                stderr = result.stderr.decode(errors='replace')
                raise RuntimeError(f"ffmpeg failed (rc={result.returncode}): {stderr[:300]}")
            if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) < 100:
                raise RuntimeError(f"ffmpeg produced invalid file: size={os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0}")
            y, sr = sf.read(tmp_path, dtype='float32')
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    else:
        y, sr = sf.read(path, dtype='float32')

    if y.ndim > 1:
        y = y.mean(axis=1)
    duration = float(len(y) / sr)

    bpm, beats, downbeats, source = 120.0, [], [], "none"
    for engine, name in ((_madmom_beats, "madmom"), (_beatnet_beats, "beatnet")):
        res = engine(path)
        if res and res[1]:
            bpm, beats, downbeats = res
            source = name
            break
    if not beats:
        bpm, beats, downbeats = _scipy_beats(y, sr)
        source = "scipy"

    onsets = _band_onsets(y, sr)
    drops = _drop_candidates(y, sr)

    return asdict(RhythmMap(
        bpm=round(bpm, 2),
        beats=beats,
        downbeats=downbeats,
        onsets=[asdict(o) for o in onsets],
        drop_candidates=drops,
        source=source,
        duration=duration,
        beat_sync_available=len(beats) > 0,
    ))


if __name__ == "__main__":
    print(json.dumps(analyze_rhythm(sys.argv[1])))
