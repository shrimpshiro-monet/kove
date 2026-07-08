"""
Deep video analysis pipeline — Single-Pass Optimized.
PySceneDetect (AdaptiveDetector) + OpenCV optical flow + Librosa + HSV color grading.
All free, runs on CPU, no API calls.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field, asdict
from typing import Optional

import cv2
import numpy as np


@dataclass
class Shot:
    index: int
    start_time: float
    end_time: float
    duration: float
    start_frame: int
    end_frame: int


@dataclass
class VelocitySample:
    timestamp: float
    magnitude: float


@dataclass
class ColorSample:
    timestamp: float
    brightness: float
    saturation: float
    contrast: float
    temperature: float


@dataclass
class FlashFrame:
    timestamp: float
    frame_index: int
    brightness: float
    flash_type: str


@dataclass
class BeatInfo:
    bpm: float
    beats: list[float]
    onsets: list[float]


@dataclass
class AnalysisResult:
    total_duration: float
    fps: float
    total_frames: int
    width: int
    height: int
    shots: list[dict]
    velocity_curve: list[dict]
    color_samples: list[dict]
    flash_frames: list[dict]
    audio: Optional[dict]
    cut_frequency: float
    avg_shot_duration: float
    shot_duration_variance: float
    pacing: str
    dominant_palette: list[str]
    summary: dict = field(default_factory=dict)


FLOW_W = 320
FLOW_H = 180


def get_video_info(video_path: str) -> dict:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", video_path],
            capture_output=True, text=True, timeout=30,
        )
        info = json.loads(result.stdout)
        vs = next((s for s in info.get("streams", []) if s["codec_type"] == "video"), None)
        if not vs:
            return {"fps": 30, "total_frames": 0, "width": 0, "height": 0, "duration": 0}
        fps_parts = vs.get("r_frame_rate", "30/1").split("/")
        fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else 30.0
        duration = float(info.get("format", {}).get("duration", 0))
        return {
            "fps": fps,
            "total_frames": int(vs.get("nb_frames", 0) or duration * fps),
            "width": int(vs.get("width", 0)),
            "height": int(vs.get("height", 0)),
            "duration": duration,
        }
    except Exception:
        return {"fps": 30, "total_frames": 0, "width": 0, "height": 0, "duration": 0}


def detect_shots_pyscenedetect(video_path: str) -> list[Shot]:
    try:
        from scenedetect import detect, AdaptiveDetector
        scene_list = detect(video_path, AdaptiveDetector(
            adaptive_threshold=3.5, min_scene_len=45,
        ))
        return [
            Shot(index=i, start_time=s.get_seconds(), end_time=e.get_seconds(),
                 duration=e.get_seconds() - s.get_seconds(),
                 start_frame=s.get_frames(), end_frame=e.get_frames())
            for i, (s, e) in enumerate(scene_list)
        ]
    except Exception:
        return detect_shots_ffmpeg(video_path)


def detect_shots_ffmpeg(video_path: str) -> list[Shot]:
    try:
        info = get_video_info(video_path)
        fps = info["fps"]
        result = subprocess.run(
            ["ffmpeg", "-i", video_path, "-vf", "select='gt(scene,0.3)',showinfo",
             "-vsync", "vfr", "-f", "null", "-"],
            capture_output=True, text=True, timeout=120,
        )
        import re
        timestamps = [float(m) for m in re.findall(r"pts_time:\s*([\d.]+)", result.stderr or "")]
        timestamps = [0.0] + sorted(set(timestamps)) + [info["duration"]]
        # Filter out shots shorter than 0.5s by merging into adjacent shots
        min_shot_duration = 0.5
        merged = [timestamps[0]]
        for ts in timestamps[1:-1]:
            if ts - merged[-1] >= min_shot_duration:
                merged.append(ts)
        merged.append(timestamps[-1])
        return [
            Shot(index=i, start_time=merged[i], end_time=merged[i + 1],
                 duration=merged[i + 1] - merged[i],
                 start_frame=int(merged[i] * fps), end_frame=int(merged[i + 1] * fps))
            for i in range(len(merged) - 1)
        ]
    except Exception:
        return []


def extract_all_frame_metrics(
    video_path: str,
    flow_interval: int = 3,
    color_interval: int = 5,
    palette_interval: int = 5,
) -> tuple[list[VelocitySample], list[ColorSample], list[float], list[int], np.ndarray]:
    """
    Single-pass master loop. Opens VideoCapture ONCE.
    Sequential reads for reliable codec support.
    Brightness sampled EVERY frame for flash detection.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return [], [], [], [], np.empty((0, 3), dtype=np.float32)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    velocity_samples: list[VelocitySample] = []
    color_samples: list[ColorSample] = []
    brightness_timeline: list[float] = []
    brightness_indices: list[int] = []
    palette_pixels: list[np.ndarray] = []

    prev_flow_gray: Optional[np.ndarray] = None
    flow_counter = 0
    color_counter = 0
    palette_counter = 0
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        ts = frame_idx / fps
        gray_full = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        brightness_timeline.append(float(np.mean(gray_full) / 255.0))
        brightness_indices.append(frame_idx)

        flow_counter += 1
        if flow_counter >= flow_interval:
            flow_small = cv2.resize(gray_full, (FLOW_W, FLOW_H))
            if prev_flow_gray is not None and flow_small.shape == prev_flow_gray.shape:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_flow_gray, flow_small, None,
                    pyr_scale=0.5, levels=2, winsize=11,
                    iterations=2, poly_n=5, poly_sigma=1.2, flags=0,
                )
                mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
                velocity_samples.append(VelocitySample(timestamp=ts, magnitude=float(np.mean(mag))))
            prev_flow_gray = flow_small
            flow_counter = 0

        color_counter += 1
        if color_counter >= color_interval:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            brightness = float(np.mean(hsv[:, :, 2]) / 255.0)
            saturation = float(np.mean(hsv[:, :, 1]) / 255.0)
            contrast = float(np.std(gray_full) / 128.0)
            b_ch, _, r_ch = cv2.split(frame)
            temperature = float((np.mean(r_ch) - np.mean(b_ch)) / 255.0)
            color_samples.append(ColorSample(
                timestamp=ts, brightness=brightness, saturation=saturation,
                contrast=contrast, temperature=temperature,
            ))
            color_counter = 0

        palette_counter += 1
        if palette_counter >= palette_interval:
            palette_pixels.append(cv2.resize(frame, (16, 16)).reshape(-1, 3))
            palette_counter = 0

        frame_idx += 1

    cap.release()
    return (
        velocity_samples,
        color_samples,
        brightness_timeline,
        brightness_indices,
        np.vstack(palette_pixels) if palette_pixels else np.empty((0, 3), dtype=np.float32),
    )


def detect_flash_from_timeline(
    brightness_timeline: list[float],
    brightness_indices: list[int],
    fps: float,
) -> list[FlashFrame]:
    if len(brightness_timeline) < 3:
        return []
    arr = np.array(brightness_timeline)
    mean = np.mean(arr)
    std = np.std(arr)
    flashes: list[FlashFrame] = []
    for i in range(1, len(arr) - 1):
        curr, prev, nxt = arr[i], arr[i - 1], arr[i + 1]
        if prev == 0 or nxt == 0:
            continue
        if curr / prev > 2.5 and curr / nxt > 2.5 and curr > mean + 2 * std:
            flashes.append(FlashFrame(
                timestamp=brightness_indices[i] / fps,
                frame_index=brightness_indices[i],
                brightness=float(curr), flash_type="white",
            ))
        elif curr / prev < 0.4 and curr / nxt < 0.4 and curr < mean - 2 * std:
            flashes.append(FlashFrame(
                timestamp=brightness_indices[i] / fps,
                frame_index=brightness_indices[i],
                brightness=float(curr), flash_type="black",
            ))
    return flashes


def cluster_palette(palette_pixels: np.ndarray, n_colors: int = 5) -> list[str]:
    if palette_pixels.shape[0] < n_colors:
        return []
    try:
        from sklearn.cluster import MiniBatchKMeans
        kmeans = MiniBatchKMeans(
            n_clusters=n_colors, n_init=3, max_iter=100,
            random_state=42, batch_size=min(1024, palette_pixels.shape[0]),
        )
        kmeans.fit(palette_pixels.astype(np.float32))
        return [f"#{int(c[2]):02x}{int(c[1]):02x}{int(c[0]):02x}" for c in kmeans.cluster_centers_]
    except ImportError:
        return []
    except Exception:
        return []


def analyze_audio(video_path: str) -> Optional[BeatInfo]:
    try:
        import librosa
        y, sr = librosa.load(video_path, sr=22050, mono=True)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if np.isscalar(tempo) else float(tempo[0]) if len(tempo) > 0 else 120.0
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr).tolist()
        return BeatInfo(bpm=bpm, beats=beat_times, onsets=onset_times)
    except Exception:
        return None


def classify_pacing(cut_frequency: float, avg_shot_duration: float) -> str:
    if cut_frequency > 2.0 or avg_shot_duration < 0.5:
        return "frantic"
    if cut_frequency > 1.0 or avg_shot_duration < 1.0:
        return "fast"
    if cut_frequency > 0.5 or avg_shot_duration < 2.0:
        return "medium"
    return "slow"


def run_deep_analysis(video_path: str, audio_path: Optional[str] = None) -> dict:
    info = get_video_info(video_path)

    shots = detect_shots_pyscenedetect(video_path)

    velocity, color_samples, bright_tl, bright_idx, palette_px = extract_all_frame_metrics(
        video_path, flow_interval=3, color_interval=5, palette_interval=5,
    )

    flash_frames = detect_flash_from_timeline(bright_tl, bright_idx, info["fps"])
    palette = cluster_palette(palette_px)
    audio = analyze_audio(audio_path or video_path)

    durations = [s.duration for s in shots]
    avg_dur = float(np.mean(durations)) if durations else 0
    var = float(np.var(durations)) if durations else 0
    cut_freq = len(shots) / info["duration"] if info["duration"] > 0 else 0
    pacing = classify_pacing(cut_freq, avg_dur)

    result = AnalysisResult(
        total_duration=info["duration"], fps=info["fps"],
        total_frames=info["total_frames"], width=info["width"], height=info["height"],
        shots=[asdict(s) for s in shots],
        velocity_curve=[asdict(v) for v in velocity],
        color_samples=[asdict(c) for c in color_samples],
        flash_frames=[asdict(f) for f in flash_frames],
        audio=asdict(audio) if audio else None,
        cut_frequency=cut_freq, avg_shot_duration=avg_dur,
        shot_duration_variance=var, pacing=pacing,
        dominant_palette=palette,
        summary={
            "shot_count": len(shots), "velocity_samples": len(velocity),
            "color_samples": len(color_samples), "flash_frame_count": len(flash_frames),
            "has_audio": audio is not None, "bpm": audio.bpm if audio else None,
            "palette_colors": len(palette),
        },
    )
    return asdict(result)


# --- Backwards compatibility wrappers ---

def compute_optical_flow(video_path: str, sample_interval: int = 3) -> list[VelocitySample]:
    velocity, _, _, _, _ = extract_all_frame_metrics(
        video_path, flow_interval=sample_interval, color_interval=999999, palette_interval=999999,
    )
    return velocity


def extract_color_samples(video_path: str, sample_interval: int = 5) -> list[ColorSample]:
    _, color_samples, _, _, _ = extract_all_frame_metrics(
        video_path, flow_interval=999999, color_interval=sample_interval, palette_interval=999999,
    )
    return color_samples


def detect_flash_frames(video_path: str, sample_interval: int = 1) -> list[FlashFrame]:
    info = get_video_info(video_path)
    _, _, bright_tl, bright_idx, _ = extract_all_frame_metrics(
        video_path, flow_interval=999999, color_interval=999999, palette_interval=999999,
    )
    return detect_flash_from_timeline(bright_tl, bright_idx, info["fps"])


def extract_dominant_palette(video_path: str, n_colors: int = 5, sample_frames: int = 20) -> list[str]:
    _, _, _, _, palette_px = extract_all_frame_metrics(
        video_path, flow_interval=999999, color_interval=999999, palette_interval=1,
    )
    return cluster_palette(palette_px, n_colors=n_colors)
