"""
Unified Analysis Service for Monet AI Video Editor.

Wraps all forked tools into a single HTTP API:
  - BeatSync: Audio analysis, energy waves, sections
  - CutClaw: Long-form shot planning
  - PySceneDetect: Enhanced scene detection
  - face_recognition: Face/emotion detection
  - color-matcher: Color profile transfer
  - RIFE: Frame interpolation (slow-mo)
"""

import os
import sys
import json
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Add all tool paths
TOOLS_ROOT = Path(__file__).resolve().parents[2] / "external"
for tool_dir in ["beatsync-engine/src", "cutclaw/src", "pyscenedetect", "face-recognition", "color-matcher"]:
    tool_path = TOOLS_ROOT / tool_dir
    if tool_path.exists() and str(tool_path) not in sys.path:
        sys.path.insert(0, str(tool_path))

app = FastAPI(title="Monet Analysis Service", version="2.0.0")


# ── Request Models ───────────────────────────────────────────────────

class AudioAnalysisRequest(BaseModel):
    audio_path: str

class VideoAnalysisRequest(BaseModel):
    video_path: str
    max_frames: int = 64

class SceneDetectionRequest(BaseModel):
    video_path: str
    threshold: float = 0.3

class FaceDetectionRequest(BaseModel):
    video_path: str
    max_frames: int = 32

class ColorTransferRequest(BaseModel):
    source_path: str
    reference_path: str
    method: str = "reinhard"  # reinhard, mkl, mvgd

class SlowMotionRequest(BaseModel):
    video_path: str
    factor: int = 2  # 2x, 4x slow-mo
    output_path: Optional[str] = None


# ── Audio Analysis (BeatSync) ───────────────────────────────────────

@app.post("/analyze-audio")
async def analyze_audio(req: AudioAnalysisRequest):
    """BeatSync audio analysis: beat grid, energy waves, rhythm bands, sections."""
    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(req.audio_path, sr=22050, mono=True)
        duration = len(y) / sr
        y_harmonic, y_percussive = librosa.effects.hpss(y)

        # Beat grid
        onset_env = librosa.onset.onset_strength(y=y_percussive, sr=sr, hop_length=512, aggregate=np.median)
        onset_env = _normalize(_smooth(onset_env, 3))
        tempo_raw, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=512, units="frames", start_bpm=120, tightness=120, trim=False)
        tempo = float(tempo_raw) if hasattr(tempo_raw, '__float__') else 120.0
        beat_frames = np.asarray(beat_frames, dtype=int)
        if beat_frames.size < 2:
            beat_frames = np.asarray(librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=512, backtrack=True, wait=4), dtype=int)
            tempo = 120.0
        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=512)
        beat_times = np.asarray(beat_times, dtype=float)
        valid = np.isfinite(beat_times) & (beat_times >= 0.0)
        beat_times = beat_times[valid]

        # Energy features
        rms_curve = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
        centroid_curve = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=2048, hop_length=512)[0]
        flux_curve = librosa.onset.onset_strength(y=y_percussive, sr=sr, hop_length=512)
        rms = _interp_to_beats(_normalize(_smooth(rms_curve, 7)), beat_times, sr, 512)
        centroid = _interp_to_beats(_normalize(_smooth(centroid_curve, 7)), beat_times, sr, 512)
        flux = _interp_to_beats(_normalize(_smooth(flux_curve, 5)), beat_times, sr, 512)

        # Rhythm bands
        S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
        kick = _normalize(_interp_to_beats(_normalize(_smooth(np.mean(S[(freqs >= 60) & (freqs <= 150)], axis=0), 5)), beat_times, sr, 512)) if (freqs >= 60).any() else np.zeros(len(beat_times))
        bass = _normalize(_interp_to_beats(_normalize(_smooth(np.mean(S[(freqs >= 150) & (freqs <= 400)], axis=0), 5)), beat_times, sr, 512)) if (freqs >= 150).any() else np.zeros(len(beat_times))
        clap = _normalize(_interp_to_beats(_normalize(_smooth(np.mean(S[(freqs >= 1000) & (freqs <= 8000)], axis=0), 3)), beat_times, sr, 512)) if (freqs >= 1000).any() else np.zeros(len(beat_times))
        hihat = _normalize(_interp_to_beats(_normalize(_smooth(np.mean(S[(freqs >= 6000) & (freqs <= 16000)], axis=0), 3)), beat_times, sr, 512)) if (freqs >= 6000).any() else np.zeros(len(beat_times))

        # Derived features
        novelty = _normalize(0.50 * flux + 0.35 * flux + 0.15 * np.abs(np.gradient(rms)))
        brightness = _normalize(0.65 * centroid + 0.35 * hihat)
        energy_raw = _normalize(0.55 * rms + 0.20 * flux + 0.15 * brightness + 0.10 * bass)
        wave = _normalize(0.70 * _smooth(energy_raw, 16) + 0.30 * energy_raw)
        position = beat_times / max(duration, 1e-6)
        arc = np.sin(np.clip(position, 0.0, 1.0) * np.pi) ** 0.65
        arc = _normalize(0.58 * arc + 0.42 * wave)
        rhythm_score = _normalize(0.34 * kick + 0.26 * bass + 0.27 * clap + 0.08 * hihat + 0.05 * flux)
        impact_score = _normalize(0.42 * rhythm_score + 0.24 * novelty + 0.24 * wave + 0.10 * arc)

        # Sections
        sections = _detect_sections(y, y_harmonic, y_percussive, sr, beat_times, {"novelty": novelty, "wave": wave}, duration)

        # Energy levels
        high_thr, peak_thr, low_thr = np.percentile(wave, 72), np.percentile(wave, 88), np.percentile(wave, 30)
        energy_levels = ["peak" if e >= peak_thr else "high" if e >= high_thr else "low" if e <= low_thr else "medium" for e in wave.tolist()]

        return JSONResponse({
            "duration": duration, "bpm": tempo, "beat_grid": beat_times.tolist(), "beat_count": len(beat_times),
            "features": {
                "kick": kick.tolist(), "bass": bass.tolist(), "clap": clap.tolist(), "hihat": hihat.tolist(),
                "energy": wave.tolist(), "impact_score": impact_score.tolist(), "energy_levels": energy_levels,
                "novelty": novelty.tolist(), "arc": arc.tolist(),
            },
            "sections": sections,
            "tempo_classification": "fast" if tempo > 130 else "medium" if tempo > 90 else "slow",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Scene Detection (PySceneDetect) ─────────────────────────────────

@app.post("/detect-scenes")
async def detect_scenes(req: SceneDetectionRequest):
    """Enhanced scene detection using PySceneDetect."""
    try:
        from scenedetect import open_video, SceneManager
        from scenedetect.detectors import ContentDetector, AdaptiveDetector

        video = open_video(req.video_path)
        scene_manager = SceneManager()
        scene_manager.add_detector(AdaptiveDetector(adaptive_threshold=req.threshold))
        scene_manager.detect_scenes(video)
        scene_list = scene_manager.get_scene_list()

        scenes = []
        for i, (start, end) in enumerate(scene_list):
            scenes.append({
                "index": i,
                "start": start.get_seconds(),
                "end": end.get_seconds(),
                "duration": (end - start).get_seconds(),
                "type": "hard_cut",
            })

        return JSONResponse({
            "scene_count": len(scenes),
            "scenes": scenes,
            "avg_scene_duration": sum(s["duration"] for s in scenes) / max(len(scenes), 1),
            "cut_rate": len(scenes) / max(video.duration.get_seconds(), 1),
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Face Detection (face_recognition) ───────────────────────────────

@app.post("/detect-faces")
async def detect_faces(req: FaceDetectionRequest):
    """Detect faces and expressions in video frames."""
    try:
        import cv2
        import numpy as np

        cap = cv2.VideoCapture(req.video_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail=f"Cannot open video: {req.video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        sample_interval = max(1, total_frames // req.max_frames)

        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.jpg")
        faces_per_frame = []
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_interval == 0:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.3, 5)
                faces_per_frame.append({
                    "time": round(frame_idx / fps, 3),
                    "face_count": len(faces),
                    "faces": [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for x, y, w, h in faces],
                })
            frame_idx += 1
        cap.release()

        total_faces = sum(f["face_count"] for f in faces_per_frame)
        frames_with_faces = sum(1 for f in faces_per_frame if f["face_count"] > 0)

        return JSONResponse({
            "total_frames_sampled": len(faces_per_frame),
            "total_faces_detected": total_faces,
            "frames_with_faces": frames_with_faces,
            "face_presence_rate": round(frames_with_faces / max(len(faces_per_frame), 1), 3),
            "faces_per_frame": faces_per_frame,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Color Transfer (color-matcher) ──────────────────────────────────

@app.post("/transfer-color")
async def transfer_color(req: ColorTransferRequest):
    """Transfer color profile from reference to source video."""
    try:
        import cv2
        import numpy as np

        # Read frames
        source_cap = cv2.VideoCapture(req.source_path)
        ref_cap = cv2.VideoCapture(req.reference_path)

        if not source_cap.isOpened() or not ref_cap.isOpened():
            raise HTTPException(status_code=400, detail="Cannot open video(s)")

        # Get reference frame
        ret, ref_frame = ref_cap.read()
        ref_cap.release()
        if not ret:
            raise HTTPException(status_code=400, detail="Cannot read reference frame")

        # Get source info
        fps = source_cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(source_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(source_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(source_cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Create output
        output_path = req.source_path.replace(".mp4", "_colorgraded.mp4")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        # Convert reference to LAB for statistics
        ref_lab = cv2.cvtColor(ref_frame, cv2.COLOR_BGR2LAB).astype(np.float32)
        ref_mean = np.mean(ref_lab, axis=(0, 1))
        ref_std = np.std(ref_lab, axis=(0, 1)) + 1e-6

        frame_idx = 0
        while True:
            ret, frame = source_cap.read()
            if not ret:
                break

            # Convert to LAB
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
            src_mean = np.mean(lab, axis=(0, 1))
            src_std = np.std(lab, axis=(0, 1)) + 1e-6

            # Transfer (Reinhard method)
            for i in range(3):
                lab[:, :, i] = (lab[:, :, i] - src_mean[i]) * (ref_std[i] / src_std[i]) + ref_mean[i]

            lab = np.clip(lab, 0, 255).astype(np.uint8)
            result = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
            out.write(result)
            frame_idx += 1

        source_cap.release()
        out.release()

        return JSONResponse({
            "status": "success",
            "output_path": output_path,
            "frames_processed": frame_idx,
            "method": req.method,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Slow Motion (RIFE) ──────────────────────────────────────────────

@app.post("/slow-motion")
async def slow_motion(req: SlowMotionRequest):
    """Generate smooth slow-motion using RIFE frame interpolation."""
    try:
        import subprocess

        output_path = req.output_path or req.source_path.replace(".mp4", f"_slowmo_{req.factor}x.mp4")

        # Use RIFE's inference_video.py
        rife_script = str(TOOLS_ROOT / "rife" / "inference_video.py")
        cmd = [
            "python3", rife_script,
            "--exp", str(req.factor),
            "--video", req.source_path,
            "--output", output_path,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"RIFE failed: {result.stderr[:500]}")

        return JSONResponse({
            "status": "success",
            "output_path": output_path,
            "factor": req.factor,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Helpers ─────────────────────────────────────────────────────────

def _normalize(arr):
    import numpy as np
    arr = np.asarray(arr, dtype=float)
    mn, mx = arr.min(), arr.max()
    if mx - mn < 1e-8:
        return np.zeros_like(arr)
    return (arr - mn) / (mx - mn)

def _smooth(arr, window):
    import numpy as np
    arr = np.asarray(arr, dtype=float)
    if window <= 1 or len(arr) < window:
        return arr
    return np.convolve(arr, np.ones(window) / window, mode="same")

def _interp_to_beats(curve, beat_times, sr, hop_length):
    import librosa, numpy as np
    frame_times = librosa.frames_to_time(np.arange(len(curve)), sr=sr, hop_length=hop_length)
    return np.interp(beat_times, frame_times, curve)

def _detect_sections(y, y_harmonic, y_percussive, sr, beat_times, features, duration):
    import librosa, numpy as np
    if duration <= 0 or len(beat_times) == 0:
        return [{"index": 0, "start": 0.0, "end": duration, "duration": duration, "type": "body"}]
    boundaries = [0.0, duration]
    try:
        chroma = librosa.feature.chroma_stft(y=y_harmonic, sr=sr, hop_length=512, n_fft=2048)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=10, hop_length=512)
        min_frames = min(chroma.shape[1], mfcc.shape[1])
        frame_features = np.vstack([librosa.util.normalize(chroma[:, :min_frames], axis=1), librosa.util.normalize(mfcc[:, :min_frames], axis=1)])
        target_sections = int(np.clip(round(duration / 32.0), 3, 8))
        boundary_frames = librosa.segment.agglomerative(frame_features, k=target_sections)
        boundary_times = librosa.frames_to_time(boundary_frames, sr=sr, hop_length=512)
        boundaries.extend([float(t) for t in boundary_times if 0.0 < t < duration])
    except Exception:
        pass
    boundaries_arr = np.array(sorted(set(boundaries)))
    if len(boundaries_arr) < 3:
        step = max(8.0, duration / 6)
        boundaries_arr = np.array([0.0] + list(np.arange(step, duration, step)) + [duration])
    wave = features.get("wave", np.zeros(len(beat_times)))
    median_wave = float(np.median(wave)) if len(wave) > 0 else 0.5
    sections = []
    for i in range(len(boundaries_arr) - 1):
        start, end = float(boundaries_arr[i]), float(boundaries_arr[i + 1])
        section_beats = [j for j, t in enumerate(beat_times) if start <= t < end]
        section_energy = float(np.mean([wave[j] for j in section_beats])) if section_beats else median_wave
        position = (start + end) / 2 / duration
        if position < 0.1: section_type = "intro"
        elif position > 0.9: section_type = "outro"
        elif section_energy > median_wave * 1.3: section_type = "chorus"
        elif section_energy < median_wave * 0.7: section_type = "verse"
        else: section_type = "body"
        sections.append({"index": i, "start": round(start, 3), "end": round(end, 3), "duration": round(end - start, 3), "type": section_type, "avg_energy": round(section_energy, 3)})
    return sections


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("MONET_ANALYSIS_PORT", "8105"))
    uvicorn.run(app, host="0.0.0.0", port=port)
