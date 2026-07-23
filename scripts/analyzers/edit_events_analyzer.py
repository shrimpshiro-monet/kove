"""
Edit Events Analyzer

Unified detection of three editing event types:

1. TRANSITIONS (between cuts):
   - cut, crossfade, fade_to_black, fade_from_black, fade_to_white,
     fade_from_white, wipe, glitch, blur_transition, zoom_transition

2. SPEED RAMPS (within segments):
   - slow_motion, fast_motion, ramp_up, ramp_down, freeze_frame

3. KEYFRAMES (within segments):
   - zoom_in, zoom_out, pan_left, pan_right, pan_up, pan_down,
     fade_in, fade_out, text_appears, text_disappears

Uses frame-sequence analysis around cut points and dense optical flow within segments.
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
from PIL import Image


# ═══════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════

def _extract_frame_cache(video_path, fps=30.0):
    """Extract all frames once into a temp directory at given fps."""
    import subprocess, tempfile, os, math
    cache_dir = tempfile.mkdtemp(prefix="edit-cache-")
    out_pattern = os.path.join(cache_dir, "frame_%06d.jpg")
    # Get duration to know how many frames to extract
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", video_path],
        capture_output=True, text=True, timeout=10,
    )
    duration = float(result.stdout.strip())
    max_frames = int(math.ceil(duration * fps)) + 2
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path,
         "-vf", f"fps={fps},scale=320:240",
         "-q:v", "3", "-frames:v", str(max_frames), out_pattern],
        capture_output=True, timeout=120,
    )
    frames = sorted(os.listdir(cache_dir))
    frame_map = {}
    for i, f in enumerate(frames):
        fpath = os.path.join(cache_dir, f)
        if os.path.getsize(fpath) > 500:
            frame_map[round(i / fps, 3)] = fpath
    return cache_dir, frame_map, fps


def analyze_edit_events(
    video_path: str,
    cuts: list[dict],
    segments: list[dict],
    fps: float = 30.0,
    motion_data: Optional[list] = None,
    shared_frame_cache: Optional[tuple] = None,
    profile: Optional[dict] = None,
) -> dict:
    """
    Run all three analyses and return a unified edit events report.

    Args:
        cuts: List of cut points (each with 'time')
        segments: List of segment dicts (each with 'start', 'end', 'index')
        fps: Video frame rate
        motion_data: Pre-computed optical flow data (optional)
        shared_frame_cache: Pre-extracted (cache_dir, frame_map, fps) tuple

    Returns:
        dict with keys: transitions, speed_ramps, keyframes, events (flat list)
    """
    print("  Analyzing edit events (transitions + speed ramps + keyframes)...")

    # profile: available for genre-conditioned threshold tuning

    if shared_frame_cache:
        cache_dir, frame_map, cache_fps = shared_frame_cache
        print(f"    Using shared cache: {len(frame_map)} frames at {cache_fps}fps")
    else:
        cache_dir, frame_map, cache_fps = _extract_frame_cache(video_path, fps=10.0)
        print(f"    Cached {len(frame_map)} frames at {cache_fps}fps")

    transitions = _classify_all_transitions(video_path, cuts, fps, cache_dir, frame_map, cache_fps)
    speed_ramps = _analyze_all_speed_ramps(video_path, segments, fps, cache_dir, frame_map, cache_fps)
    keyframes = _detect_all_keyframes(video_path, segments, fps, motion_data, cache_dir, frame_map, cache_fps)

    # Flatten into a single timeline of events
    events = []
    for t in transitions:
        events.append({
            "type": "transition",
            "subtype": t["type"],
            "time": t["time"],
            "duration": t["duration"],
            "confidence": t["confidence"],
        })
    for s in speed_ramps:
        for r in s.get("rampPoints", []):
            events.append({
                "type": "speed_ramp",
                "subtype": r.get("type", "speed_change"),
                "time": r["time"],
                "duration": r.get("duration", 0.5),
                "confidence": r.get("confidence", 0.7),
            })
    for k in keyframes:
        for kf in k.get("keyframes", []):
            events.append({
                "type": "keyframe",
                "subtype": kf["type"],
                "time": kf["time"],
                "duration": kf.get("duration", 0.0),
                "confidence": kf.get("confidence", 0.7),
                "properties": kf.get("properties", {}),
            })

    events.sort(key=lambda e: e["time"])

    # Cleanup cache (only if we created it)
    if not shared_frame_cache:
        try:
            import shutil
            shutil.rmtree(cache_dir, ignore_errors=True)
        except Exception:
            pass

    return {
        "transitions": transitions,
        "speed_ramps": speed_ramps,
        "keyframes": keyframes,
        "events": events,
        "total_events": len(events),
    }


# ═══════════════════════════════════════════════════════════════
# TRANSITION CLASSIFICATION
# ═══════════════════════════════════════════════════════════════

def _classify_all_transitions(
    video_path: str, cuts: list[dict], fps: float,
    cache_dir: str = "", frame_map: dict = None, cache_fps: float = 10.0,
) -> list[dict]:
    """Classify the transition type for each cut point."""
    if frame_map is None:
        frame_map = {}
    transitions = []
    for i, cut in enumerate(cuts):
        t = _classify_single_transition(cut["time"], fps, i, frame_map, cache_fps)
        transitions.append(t)
    return transitions


def _get_frames_at_time(frame_map: dict, time: float, n_before: int, n_after: int, source_fps: float) -> list[str]:
    """Get cached frame paths around a given time."""
    frames = []
    step = 1.0 / source_fps
    for j in range(-n_before, n_after + 1):
        t = round(time + j * step, 2)
        # Find nearest cached frame
        best = None
        best_dt = 99
        for ct, path in frame_map.items():
            dt = abs(ct - t)
            if dt < best_dt:
                best_dt = dt
                best = path
        if best and best_dt < step * 1.5:
            frames.append(best)
    return frames


def _classify_single_transition(
    cut_time: float, fps: float, idx: int,
    frame_map: dict, cache_fps: float,
) -> dict:
    """Sample frames around a cut point from cache and classify transition."""
    times = sorted(frame_map.keys())
    cut_times = [t for t in times if abs(t - cut_time) <= 0.5]
    if len(cut_times) < 3:
        return {"time": cut_time, "type": "cut", "duration": 0.0,
                "confidence": 0.8, "properties": {}, "cut_index": idx}

    cut_idx = min(range(len(cut_times)), key=lambda i: abs(cut_times[i] - cut_time))
    start_idx = max(0, cut_idx - 5)
    end_idx = min(len(cut_times), cut_idx + 6)
    selected = cut_times[start_idx:end_idx]
    frame_paths = [frame_map[t] for t in selected]

    metrics = [_frame_metrics(p) for p in frame_paths]
    local_cut_idx = cut_idx - start_idx
    before = metrics[:local_cut_idx]
    after = metrics[local_cut_idx:]
    result = _classify_from_metrics(before or metrics[:1], after or metrics[-1:], cut_time,
                                    frame_paths, local_cut_idx, start_idx)
    result["cut_index"] = idx
    return result


def _compute_flow_features(path_before: str, path_after: str) -> dict:
    """Compute motion features between two frames using sparse optical flow.
    
    Returns dict with: magnitude, coherence, divergence, rotation.
    High magnitude + high coherence = whip/slide. 
    High divergence = zoom. High rotation = spin.
    """
    try:
        import cv2
        img1 = cv2.imread(path_before, cv2.IMREAD_GRAYSCALE)
        img2 = cv2.imread(path_after, cv2.IMREAD_GRAYSCALE)
        if img1 is None or img2 is None:
            return {}

        features = cv2.goodFeaturesToTrack(img1, maxCorners=200, qualityLevel=0.01, minDistance=7)
        if features is None or len(features) < 5:
            return {}

        next_pts, status, _ = cv2.calcOpticalFlowPyrLK(img1, img2, features, None)
        valid = status.ravel() == 1
        pts1 = features[valid].reshape(-1, 2)
        pts2 = next_pts[valid].reshape(-1, 2)

        if len(pts1) < 3:
            return {}

        vectors = pts2 - pts1
        magnitudes = np.linalg.norm(vectors, axis=1)
        angles = np.arctan2(vectors[:, 1], vectors[:, 0])

        h, w = img1.shape
        cx, cy = w / 2, h / 2
        centers = pts1 - np.array([cx, cy])
        radial_dirs = centers / (np.linalg.norm(centers, axis=1, keepdims=True) + 1e-6)
        radial_mag = np.sum(vectors * radial_dirs, axis=1)

        avg_mag = float(np.mean(magnitudes))
        coherence = float(np.sqrt(np.mean(np.cos(angles))**2 + np.mean(np.sin(angles))**2))
        divergence = float(np.mean(radial_mag))
        rotation = float(np.mean(np.abs(vectors[:, 0] * radial_dirs[:, 1] - vectors[:, 1] * radial_dirs[:, 0])))

        return {
            "magnitude": avg_mag,
            "coherence": coherence,
            "divergence": divergence,
            "rotation": rotation,
        }
    except Exception:
        return {}


def _frame_metrics(path: str) -> dict:
    """Compute brightness, edge density, and color histogram for a frame."""
    try:
        img = Image.open(path).convert("RGB")
        px = np.array(img, dtype=np.float32)
        gray = np.mean(px, axis=2)

        brightness = float(gray.mean() / 255.0)

        dx = np.abs(np.diff(gray, axis=1))
        dy = np.abs(np.diff(gray, axis=0))
        edge_density = float((dx.mean() + dy.mean()) / 2 / 255.0)

        # Color histogram (3 bins per channel = 27 dim, summed to 3 dims)
        r_hist = np.histogram(px[:, :, 0], bins=8, range=(0, 256))[0]
        g_hist = np.histogram(px[:, :, 1], bins=8, range=(0, 256))[0]
        b_hist = np.histogram(px[:, :, 2], bins=8, range=(0, 256))[0]
        # Normalize
        total = max(1.0, r_hist.sum() + g_hist.sum() + b_hist.sum())
        color_profile = np.concatenate([r_hist, g_hist, b_hist]) / total

        return {
            "brightness": brightness,
            "edge_density": edge_density,
            "color_profile": color_profile.tolist(),
        }
    except Exception:
        return {"brightness": 0.5, "edge_density": 0.05, "color_profile": []}


def _classify_from_metrics(
    before: list[dict], after: list[dict], cut_time: float,
    frame_paths=None,
    local_cut_idx: int = 0, start_idx: int = 0,
) -> dict:
    """
    Classify transition type from before/after frame metrics.

    Strategy:
    - Fade to black: brightness drops near 0 before cut
    - Fade from black: brightness rises from near 0 after cut
    - Fade to white: brightness spikes near 1 before cut
    - Fade from white: brightness drops from near 1 after cut
    - Crossfade: significant frame overlap / gradual hist shift
    - Blur transition: edge density drops then recovers
    - Wipe: histogram shifts from one dominant pattern to another without overlap
    - Glitch: high variance in brightness across frames
    - Whip pan: high magnitude, coherent directional flow between cut frames
    - Zoom: divergent/convergent flow (radial expansion/contraction)
    - Slide: high coherence, uniform directional flow
    - Light sweep: brightness band moving across frame
    - Cut: no intermediate state (default)
    """
    result = {
        "time": cut_time,
        "type": "cut",
        "duration": 0.0,
        "confidence": 0.8,
        "properties": {},
    }

    if not before or not after:
        return result

    last_before = before[-1]
    first_after = after[0]

    # ── Check for fades ──
    b_vals = [m["brightness"] for m in before]
    a_vals = [m["brightness"] for m in after]
    b_edges = [m["edge_density"] for m in before]
    a_edges = [m["edge_density"] for m in after]

    last_b_brightness = b_vals[-1] if b_vals else 0.5
    first_a_brightness = a_vals[0] if a_vals else 0.5
    b_trend = b_vals[-1] - b_vals[0] if len(b_vals) > 1 else 0
    a_trend = a_vals[-1] - a_vals[0] if len(a_vals) > 1 else 0

    # ── Compute all metrics up front ──
    b_vals = [m["brightness"] for m in before]
    a_vals = [m["brightness"] for m in after]
    b_edges = [m["edge_density"] for m in before]
    a_edges = [m["edge_density"] for m in after]

    last_b_brightness = b_vals[-1] if b_vals else 0.5
    first_a_brightness = a_vals[0] if a_vals else 0.5
    b_trend = b_vals[-1] - b_vals[0] if len(b_vals) > 1 else 0
    a_trend = a_vals[-1] - a_vals[0] if len(a_vals) > 1 else 0

    # Frame-to-frame brightness jump at the cut point
    brightness_jump = abs(last_b_brightness - first_a_brightness)

    # Max brightness change rate within before/after windows
    b_max_delta = max((abs(b_vals[i] - b_vals[i-1]) for i in range(1, len(b_vals))), default=0)
    a_max_delta = max((abs(a_vals[i] - a_vals[i-1]) for i in range(1, len(a_vals))), default=0)

    lb_color = np.array(last_before.get("color_profile", []))
    fa_color = np.array(first_after.get("color_profile", []))
    hist_diff = float(np.abs(lb_color - fa_color).mean()) if len(lb_color) > 0 and len(fa_color) > 0 else 0.5

    # ── Priority 1: Fades (brightness extremes at cut boundary) ──
    # Fade to black: brightness drops near 0 before cut
    if last_b_brightness < 0.15 and b_trend < -0.05:
        result.update({
            "type": "fade_to_black",
            "duration": _estimate_transition_duration(b_vals, a_vals),
            "confidence": min(1.0, (0.15 - last_b_brightness) / 0.15),
        })
        return result

    # Fade from black: brightness rises from near 0 after cut
    if first_a_brightness < 0.15 and a_trend > 0.05:
        result.update({
            "type": "fade_from_black",
            "duration": _estimate_transition_duration(b_vals, a_vals),
            "confidence": min(1.0, (0.15 - first_a_brightness) / 0.15),
        })
        return result

    # Fade to white: brightness spikes near 1 before cut
    if last_b_brightness > 0.85 and b_trend > 0.05:
        result.update({
            "type": "fade_to_white",
            "duration": _estimate_transition_duration(b_vals, a_vals),
            "confidence": min(1.0, (last_b_brightness - 0.85) / 0.15),
        })
        return result

    # Fade from white: brightness drops from near 1 after cut
    if first_a_brightness > 0.85 and a_trend < -0.05:
        result.update({
            "type": "fade_from_white",
            "duration": _estimate_transition_duration(b_vals, a_vals),
            "confidence": min(1.0, (first_a_brightness - 0.85) / 0.15),
        })
        return result

    # ── Priority 2: Rapid brightness oscillation (whiplash / flash cuts) ──
    # If brightness swings wildly across the window, it's a rapid flash sequence
    all_bright = b_vals + a_vals
    if len(all_bright) >= 4:
        bright_range = max(all_bright) - min(all_bright)
        bright_var = float(np.var(all_bright))
        if bright_range > 0.4 and bright_var > 0.01:
            # Check direction: ends bright → flash, ends dark → dark flash
            if last_b_brightness > 0.7 and first_a_brightness > 0.7:
                result.update({
                    "type": "flash_white",
                    "duration": _estimate_transition_duration(b_vals, a_vals),
                    "confidence": min(1.0, bright_var / 0.03),
                })
                return result
            elif last_b_brightness < 0.3 and first_a_brightness < 0.3:
                result.update({
                    "type": "flash_black",
                    "duration": _estimate_transition_duration(b_vals, a_vals),
                    "confidence": min(1.0, bright_var / 0.03),
                })
                return result

    # ── Priority 2.5: Motion-based transitions (optical flow at cut boundary) ──
    if frame_paths is not None and len(frame_paths) > local_cut_idx + 1:
        b_idx = max(0, local_cut_idx - 1)
        a_idx = min(len(frame_paths) - 1, local_cut_idx + 1)
        if b_idx < a_idx:
            flow = _compute_flow_features(frame_paths[b_idx], frame_paths[a_idx])
            if flow:
                mag = flow.get("magnitude", 0)
                coh = flow.get("coherence", 0)
                div = flow.get("divergence", 0)
                rot = flow.get("rotation", 0)

                # Whip pan: fast, coherent motion with rotational component
                if mag > 30.0 and coh > 0.7 and rot > 10.0:
                    result.update({
                        "type": "whip_pan", "duration": 0.15,
                        "confidence": min(1.0, mag / 80.0),
                    })
                    return result

                # Zoom: radial expansion (positive) or contraction (negative)
                if abs(div) > 15.0 and coh > 0.5:
                    result.update({
                        "type": "zoom_transition", "duration": 0.2,
                        "confidence": min(1.0, abs(div) / 50.0),
                    })
                    return result

                # Slide/push: uniform directional motion, very high coherence
                if mag > 30.0 and coh > 0.85 and abs(div) < 10.0:
                    result.update({
                        "type": "slide", "duration": 0.2,
                        "confidence": min(1.0, coh),
                    })
                    return result

                # Spin: strong rotation, chaotic flow (for true spins, not just cuts)
                if rot > 40.0 and mag > 30.0 and coh < 0.4 and abs(div) < 20.0:
                    result.update({
                        "type": "spin", "duration": 0.2,
                        "confidence": min(1.0, rot / 60.0),
                    })
                    return result

    # ── Priority 3: Hard cut (large brightness jump at cut) ──
    if brightness_jump > 0.2:
        result.update({
            "type": "cut",
            "duration": 0.0,
            "confidence": min(1.0, 0.5 + brightness_jump),
        })
        return result

    # ── Priority 4: Blur transition (edge density drops before cut) ──
    if len(b_edges) > 1 and b_edges[-1] < b_edges[0] * 0.7:
        edge_drop = (b_edges[0] - b_edges[-1]) / max(b_edges[0], 0.001)
        result.update({
            "type": "blur_transition",
            "duration": 0.2,
            "confidence": min(1.0, edge_drop * 1.5),
        })
        return result

    # ── Priority 5: Glitch (high brightness variance across frames) ──
    b_var = float(np.var(b_vals)) if len(b_vals) > 1 else 0
    if b_var > 0.015:
        result.update({
            "type": "glitch",
            "duration": 0.15,
            "confidence": min(1.0, b_var / 0.04),
        })
        return result

    # ── Priority 6: Wipe (large histogram shift, no overlap) ──
    if hist_diff > 0.2:
        result.update({
            "type": "wipe",
            "duration": 0.3,
            "confidence": min(1.0, hist_diff / 0.35),
        })
        return result

    # ── Priority 7: Crossfade (similar frames, gradual shift) ──
    # Must also pass pixel MSE check — hard cuts between scenes with similar
    # brightness/histogram are NOT crossfades.
    pixel_mse = 1.0
    if frame_paths is not None and local_cut_idx is not None:
        b_idx = max(0, local_cut_idx - 1)
        a_idx = min(len(frame_paths) - 1, local_cut_idx)
        if b_idx < a_idx:
            try:
                img_b = cv2.imread(frame_paths[b_idx])
                img_a = cv2.imread(frame_paths[a_idx])
                if img_b is not None and img_a is not None:
                    if img_b.shape != img_a.shape:
                        img_a = cv2.resize(img_a, (img_b.shape[1], img_b.shape[0]))
                    pixel_mse = float(np.mean((img_b.astype(np.float32) - img_a.astype(np.float32)) ** 2)) / 65025.0
            except Exception:
                pass

    if hist_diff < 0.06 and brightness_jump < 0.1 and pixel_mse < 0.15:
        result.update({
            "type": "crossfade",
            "duration": 0.3,
            "confidence": min(1.0, (0.06 - hist_diff) / 0.06 * 0.7 + 0.3),
        })
        return result

    # ── Default: hard cut ──
    result["confidence"] = min(1.0, 0.5 + brightness_jump * 0.5)
    return result


def _estimate_transition_duration(b_vals: list, a_vals: list) -> float:
    """Estimate transition duration from brightness curves."""
    # Count frames in transition state (not fully bright nor fully dark)
    trans = [v for v in b_vals + a_vals if 0.1 < v < 0.9]
    return min(1.0, len(trans) / 30.0)


# ═══════════════════════════════════════════════════════════════
# SPEED RAMP DETECTION
# ═══════════════════════════════════════════════════════════════

def _analyze_all_speed_ramps(
    video_path: str, segments: list[dict], fps: float,
    cache_dir: str = "", frame_map: dict = None, cache_fps: float = 10.0,
) -> list[dict]:
    """Analyze speed ramps for each segment."""
    if frame_map is None:
        frame_map = {}
    results = []
    for seg in segments:
        ramp = _analyze_segment_speed(seg, frame_map)
        ramp["segment_index"] = seg["index"]
        results.append(ramp)
    return results


def _analyze_segment_speed(
    segment: dict, frame_map: dict,
) -> dict:
    """Analyze speed characteristics within a single segment."""
    result = {
        "avg_motion": 0.0,
        "speed_type": "normal",
        "has_ramp": False,
        "ramp_points": [],
        "motion_curve": [],
    }

    start, end = segment["start"], segment["end"]
    duration = end - start
    if duration < 0.3:
        return result

    # Use cached frames within this segment's time range
    seg_frames = sorted([
        (ct, path) for ct, path in frame_map.items()
        if start <= ct <= end
    ])
    frames = [p for _, p in seg_frames]

    if len(frames) < 3:
        return result

    # Compute frame-to-frame pixel differences
    magnitudes = []
    prev = None
    for f_path in frames:
        img = np.array(Image.open(f_path).convert("L"), dtype=np.float32)
        if prev is not None:
            diff = np.abs(img - prev).mean()
            magnitudes.append(diff)
        prev = img

    if not magnitudes:
        return result

    avg = float(np.mean(magnitudes))
    result["avg_motion"] = avg

    if avg < 0.8:
        result["speed_type"] = "slow_motion"
    elif avg > 25.0:
        result["speed_type"] = "fast_motion"
    else:
        result["speed_type"] = "normal"

    # Detect ramps: significant slope in motion magnitude
    if len(magnitudes) >= 5:
        window = 3
        ramp_pts = []
        for i in range(window, len(magnitudes) - window):
            before = np.mean(magnitudes[i - window:i])
            after = np.mean(magnitudes[i:i + window])
            if after > before * 1.8:
                t = start + duration * i / max(1, len(magnitudes))
                ramp_pts.append({
                    "time": round(t, 2),
                    "type": "ramp_up",
                    "confidence": min(1.0, (after / before - 1.0) / 2.0),
                })
            elif before > after * 1.8:
                t = start + duration * i / max(1, len(magnitudes))
                ramp_pts.append({
                    "time": round(t, 2),
                    "type": "ramp_down",
                    "confidence": min(1.0, (before / after - 1.0) / 2.0),
                })

        if ramp_pts:
            result["has_ramp"] = True
            result["ramp_points"] = ramp_pts

    mag_max = max(magnitudes) if magnitudes else 1
    result["motion_curve"] = [round(m / mag_max, 3) for m in magnitudes]

    return result


# ═══════════════════════════════════════════════════════════════
# KEYFRAME / ZOOM / PAN DETECTION
# ═══════════════════════════════════════════════════════════════

def _detect_all_keyframes(
    video_path: str,
    segments: list[dict],
    fps: float,
    motion_data: Optional[list] = None,
    cache_dir: str = "",
    frame_map: dict = None,
    cache_fps: float = 10.0,
) -> list[dict]:
    """Detect keyframe events (zoom, pan, fade) for each segment."""
    if frame_map is None:
        frame_map = {}
    results = []
    for seg in segments:
        kf = _detect_segment_keyframes(seg, fps, motion_data, frame_map)
        kf["segment_index"] = seg["index"]
        results.append(kf)
    return results


def _detect_segment_keyframes(
    segment: dict,
    fps: float,
    motion_data: Optional[list] = None,
    frame_map: dict = None,
) -> dict:
    """
    Detect keyframe events within a segment.

    Checks for:
    - Zoom in/out: scale change via feature distance tracking
    - Pan: directional optical flow bias
    - Fade in/out: brightness ramp at start/end
    - Text appear/disappear: new text region emergence
    - Shake: high-frequency motion
    """
    result = {
        "has_keyframes": False,
        "keyframes": [],
    }

    start, end = segment["start"], segment["end"]
    duration = end - start
    if duration < 0.5 or not frame_map:
        return result

    seg_frames = sorted([
        (ct, path) for ct, path in frame_map.items()
        if start <= ct <= end
    ])
    frames = [p for _, p in seg_frames]

    if len(frames) < 4:
        return result

    zoom_events = _detect_zoom(frames, start, duration)
    result["keyframes"].extend(zoom_events)

    pan_events = _detect_pan(frames, start, duration, fps)
    result["keyframes"].extend(pan_events)

    fade_events = _detect_fade(frames, start, duration)
    result["keyframes"].extend(fade_events)

    shake_events = _detect_shake(frames, start, duration)
    result["keyframes"].extend(shake_events)

    if result["keyframes"]:
        result["has_keyframes"] = True
        result["keyframes"].sort(key=lambda e: e["time"])

    return result


def _detect_zoom(
    frames: list[str], start: float, duration: float
) -> list[dict]:
    """Detect zoom in/out by tracking feature point distances."""
    events = []
    if len(frames) < 4:
        return events

    try:
        # Use first frame as reference: detect feature points
        ref = cv2.imread(frames[0], cv2.IMREAD_GRAYSCALE)
        if ref is None:
            return events

        ref_pts = cv2.goodFeaturesToTrack(ref, maxCorners=100,
                                           qualityLevel=0.01, minDistance=10)
        if ref_pts is None or len(ref_pts) < 10:
            return events

        # Compute centroid distance for reference frame
        ref_center = ref_pts.mean(axis=0).flatten()
        ref_dists = np.sqrt(((ref_pts - ref_center) ** 2).sum(axis=2)).flatten()
        ref_mean_dist = ref_dists.mean()

        if ref_mean_dist < 1:
            return events

        # Track scale across subsequent frames
        scales = [(0, 1.0)]
        prev_gray = ref
        prev_pts = ref_pts.reshape(-1, 1, 2).astype(np.float32)

        for i in range(1, min(len(frames), 15)):
            curr = cv2.imread(frames[i], cv2.IMREAD_GRAYSCALE)
            if curr is None:
                break
            next_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                prev_gray, curr, prev_pts, None,
                winSize=(21, 21), maxLevel=3,
            )
            good = status.flatten() == 1
            if good.sum() < 5:
                break

            matched_pts = next_pts[good]
            center = matched_pts.mean(axis=0)
            dists = np.sqrt(((matched_pts - center) ** 2).sum(axis=1))
            mean_dist = dists.mean()
            scale = mean_dist / ref_mean_dist if ref_mean_dist > 0 else 1.0
            frac = i / (len(frames) - 1)
            scales.append((frac, scale))

            prev_gray = curr
            prev_pts = next_pts.reshape(-1, 1, 2).astype(np.float32)

        # Detect significant scale trends
        if len(scales) >= 3:
            scale_vals = [s[1] for s in scales]
            first_half = np.mean(scale_vals[:len(scale_vals)//2])
            second_half = np.mean(scale_vals[len(scale_vals)//2:])
            change = second_half / max(0.001, first_half)

            if change > 1.15:
                mid_t = start + duration * 0.5
                events.append({
                    "time": round(mid_t, 2),
                    "type": "zoom_in",
                    "confidence": min(1.0, (change - 1.0) / 0.5),
                    "properties": {"scale_change": round(change, 3)},
                })
            elif change < 0.85:
                mid_t = start + duration * 0.5
                events.append({
                    "time": round(mid_t, 2),
                    "type": "zoom_out",
                    "confidence": min(1.0, (1.0 - change) / 0.5),
                    "properties": {"scale_change": round(change, 3)},
                })
    except Exception:
        pass

    return events


def _detect_pan(
    frames: list[str], start: float, duration: float, fps: float
) -> list[dict]:
    """Detect camera pan by tracking directional flow bias."""
    events = []
    if len(frames) < 4:
        return events

    try:
        dx_total, dy_total = 0.0, 0.0
        prev_gray = None
        count = 0

        for i in range(len(frames)):
            curr = cv2.imread(frames[i], cv2.IMREAD_GRAYSCALE)
            if curr is None:
                break
            if prev_gray is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_gray, curr, None, 0.5, 3, 15, 3, 5, 1.2, 0,
                )
                dx_total += float(flow[:, :, 0].mean())
                dy_total += float(flow[:, :, 1].mean())
                count += 1
            prev_gray = curr

        if count < 2:
            return events

        dx_avg = dx_total / count
        dy_avg = dy_total / count
        magnitude = np.sqrt(dx_avg**2 + dy_avg**2)

        if magnitude < 1.0:
            return events

        mid_t = start + duration * 0.5
        if abs(dx_avg) > abs(dy_avg) * 1.5:
            direction = "pan_right" if dx_avg > 0 else "pan_left"
        else:
            direction = "pan_down" if dy_avg > 0 else "pan_up"

        events.append({
            "time": round(mid_t, 2),
            "type": direction,
            "confidence": min(1.0, magnitude / 5.0),
            "properties": {"dx": round(dx_avg, 2), "dy": round(dy_avg, 2)},
        })
    except Exception:
        pass

    return events


def _detect_fade(
    frames: list[str], start: float, duration: float
) -> list[dict]:
    """Detect fade in/out by tracking brightness at segment boundaries."""
    events = []

    try:
        # Check start: brightness ramp up?
        n_check = min(3, len(frames))
        start_brightness = []
        for i in range(n_check):
            img = Image.open(frames[i]).convert("L")
            px = np.array(img, dtype=np.float32)
            start_brightness.append(float(px.mean() / 255.0))

        if len(start_brightness) >= 2:
            rise = start_brightness[-1] - start_brightness[0]
            if rise > 0.2 and start_brightness[0] < 0.3:
                events.append({
                    "time": round(start + 0.1, 2),
                    "type": "fade_in",
                    "confidence": min(1.0, rise / 0.5),
                    "properties": {"brightness_range": [round(b, 3) for b in start_brightness]},
                })

        # Check end: brightness ramp down?
        end_brightness = []
        for i in range(max(0, len(frames) - n_check), len(frames)):
            img = Image.open(frames[i]).convert("L")
            px = np.array(img, dtype=np.float32)
            end_brightness.append(float(px.mean() / 255.0))

        if len(end_brightness) >= 2:
            drop = end_brightness[0] - end_brightness[-1]
            if drop > 0.2 and end_brightness[-1] < 0.3:
                events.append({
                    "time": round(start + duration - 0.1, 2),
                    "type": "fade_out",
                    "confidence": min(1.0, drop / 0.5),
                    "properties": {"brightness_range": [round(b, 3) for b in end_brightness]},
                })
    except Exception:
        pass

    return events


def _detect_shake(
    frames: list[str], start: float, duration: float
) -> list[dict]:
    """Detect handheld/shake camera motion."""
    events = []
    if len(frames) < 6:
        return events

    try:
        magnitudes = []
        prev_gray = None
        for i in range(len(frames)):
            curr = cv2.imread(frames[i], cv2.IMREAD_GRAYSCALE)
            if curr is None:
                break
            if prev_gray is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_gray, curr, None, 0.5, 3, 15, 3, 5, 1.2, 0,
                )
                mag = np.sqrt(flow[:, :, 0]**2 + flow[:, :, 1]**2).mean()
                magnitudes.append(float(mag))
            prev_gray = curr

        if len(magnitudes) < 3:
            return events

        # Shake = high average motion magnitude (calibrated for 320x240 grayscale)
        avg_mag = float(np.mean(magnitudes))
        if avg_mag > 5.0:
            mid_t = start + duration * 0.5
            events.append({
                "time": round(mid_t, 2),
                "type": "shake",
                "confidence": min(1.0, (avg_mag - 5.0) / 10.0),
                "properties": {"avg_motion_mag": round(avg_mag, 2)},
            })
    except Exception:
        pass

    return events


# ═══════════════════════════════════════════════════════════════
# CLI / DEV
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python edit_events_analyzer.py <video_path>")
        sys.exit(1)

    video = sys.argv[1]
    from reference_engine import detect_cuts, build_shots_from_cuts, get_video_info

    info = get_video_info(video)
    duration = float(info["format"]["duration"])
    fps_parts = info["streams"][0]["r_frame_rate"].split("/")
    fps = float(fps_parts[0]) / float(fps_parts[1])

    cuts = detect_cuts(video)
    shots = build_shots_from_cuts(cuts, duration)

    result = analyze_edit_events(video, [c.model_dump() for c in cuts], shots, fps)

    print(f"\n=== EDIT EVENTS ({result['total_events']} total) ===\n")

    print("TRANSITIONS:")
    for t in result["transitions"]:
        print(f"  cut@{t['time']:.2f}s: {t['type']} (conf={t['confidence']:.2f}, dur={t['duration']:.2f}s)")

    print("\nSPEED RAMPS:")
    for s in result["speed_ramps"]:
        if s.get("has_ramp"):
            for rp in s["ramp_points"]:
                print(f"  seg@{s['segment_index']}: {rp['type']} @ {rp['time']:.2f}s (conf={rp['confidence']:.2f})")
        if s["speed_type"] != "normal":
            print(f"  seg@{s['segment_index']}: avg_motion={s['avg_motion']:.2f} → {s['speed_type']}")

    print("\nKEYFRAMES:")
    for k in result["keyframes"]:
        for kf in k.get("keyframes", []):
            props = ""
            if kf.get("properties"):
                props = str(kf["properties"])
            print(f"  seg@{k['segment_index']}: {kf['type']} @ {kf['time']:.2f}s (conf={kf['confidence']:.2f}) {props}")
