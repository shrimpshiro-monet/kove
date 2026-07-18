"""E33 — Evaluation harness for Monet edit director.

Cut-point F1, beat-alignment rate, VMAF, and regression guard.

Usage:
    python eval.py --generated output.mp4 --reference ref.mp4 --music music.mp3
    python eval.py --generated output.mp4 --music music.mp3
    python eval.py --generated output.mp4 --reference ref.mp4 --save-baseline baseline.json
    python eval.py --generated output.mp4 --reference ref.mp4 --compare baseline.json
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


# ── Cut-point extraction ──────────────────────────────────────────

def extract_cut_times(video_path: str) -> list[float]:
    """Extract cut (scene-change) timestamps from a video via ffmpeg.

    Uses the same method as detect_candidate_cuts / reference_engine.
    Returns sorted list of cut times in seconds.
    """
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", "select='gt(scene,0.3)',metadata=print:file=-",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    cuts = []
    for line in (result.stdout + result.stderr).split("\n"):
        if "pts_time:" in line:
            try:
                pts = float(line.split("pts_time:")[1].split()[0])
                cuts.append(pts)
            except (IndexError, ValueError):
                pass
    return sorted(set(cuts))


# ── Metric 1: Cut-point agreement (F1) ────────────────────────────

def cut_point_f1(
    generated_cuts: list[float],
    reference_cuts: list[float],
    tolerance: float = 0.05,
) -> dict:
    """Compute precision, recall, F1 for cut-point agreement.

    A generated cut is considered a true positive if it falls within
    `tolerance` seconds of a reference cut. Uses bipartite matching
    (each ref cut matches at most one generated cut).

    Tolerance default 0.05s ≈ 1-2 frames at 24-30fps, matching the
    standard mir_eval onset F-measure convention.
    """
    gen = sorted(generated_cuts)
    ref = sorted(reference_cuts)
    if not ref:
        return {"precision": 1.0 if not gen else 0.0, "recall": 0.0, "f1": 0.0, "tp": 0, "fp": len(gen), "fn": 0}
    if not gen:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0, "tp": 0, "fp": 0, "fn": len(ref)}

    import numpy as np

    # Greedy matching: for each generated cut, find nearest unmatched reference
    used_ref = set()
    tp = 0
    matched_gen = []
    for g in gen:
        best_offset = tolerance + 1
        best_idx = -1
        for j, r in enumerate(ref):
            if j in used_ref:
                continue
            off = abs(g - r)
            if off < best_offset:
                best_offset = off
                best_idx = j
        if best_idx >= 0 and best_offset <= tolerance:
            used_ref.add(best_idx)
            tp += 1
            matched_gen.append({"generated": round(g, 3), "reference": round(ref[best_idx], 3), "offset_ms": round(best_offset * 1000, 1)})

    fp = len(gen) - tp
    fn = len(ref) - tp
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tolerance_s": tolerance,
        "matches": matched_gen,
    }


# ── Metric 2: Beat-alignment rate ─────────────────────────────────

def beat_alignment_rate(cut_times: list[float], music_path: str, tolerance: float = 0.05) -> dict:
    """What fraction of cuts land within tolerance of a music beat.

    Uses librosa beat_track on the music file. Higher is better
    for beat-synced edits.
    """
    import librosa
    import numpy as np

    y, sr = librosa.load(music_path, sr=22050, mono=True)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    if not cut_times or not beat_times:
        return {"aligned": 0, "total": len(cut_times), "rate": 0.0, "bpm": 0.0}

    beat_array = np.array(beat_times)
    aligned = 0
    offsets = []
    for c in cut_times:
        idx = np.searchsorted(beat_array, c)
        nearest = min(
            (beat_array[max(0, idx - 1)], beat_array[min(len(beat_array) - 1, idx)]),
            key=lambda b: abs(b - c),
        )
        off = abs(c - nearest)
        offsets.append(off * 1000)
        if off < tolerance:
            aligned += 1

    rate = aligned / len(cut_times) if cut_times else 0.0
    return {
        "aligned": aligned,
        "total": len(cut_times),
        "rate": round(rate, 4),
        "bpm": round(float(tempo.item() if hasattr(tempo, 'item') else tempo), 1),
        "tolerance_s": tolerance,
        "mean_offset_ms": round(float(np.mean(offsets)), 2) if offsets else 0.0,
        "median_offset_ms": round(float(np.median(offsets)), 2) if offsets else 0.0,
    }


# ── Metric 3: VMAF / PSNR / SSIM ──────────────────────────────────

def quality_vs_reference(generated: str, reference: str, temp_dir: str) -> dict:
    """Compute VMAF, PSNR, and SSIM against a reference video.

    Returns dict of scores. VMAF is primary (0-100), PSNR/SSIM secondary.
    """
    # Ensure both have same resolution and fps by normalizing to reference
    norm_ref = os.path.join(temp_dir, "ref_norm.mp4")
    norm_gen = os.path.join(temp_dir, "gen_norm.mp4")

    # Probe reference for target specs
    probe = subprocess.run([
        "ffprobe", "-v", "error",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "json", reference,
    ], capture_output=True, text=True, timeout=15)
    info = json.loads(probe.stdout)
    vs = info.get("streams", [{}])[0]
    w = vs.get("width", 1920)
    h = vs.get("height", 1080)
    fps_str = vs.get("r_frame_rate", "30/1")
    fps_num, fps_den = (int(x) for x in fps_str.split("/"))
    fps = round(float(fps_num) / float(fps_den) if fps_den else 30.0, 2)

    # Normalize both to same target
    norm_filter = (
        f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
        f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"setsar=1,fps={fps},format=yuv420p"
    )
    for src, dst in [(reference, norm_ref), (generated, norm_gen)]:
        subprocess.run([
            "ffmpeg", "-y", "-i", src,
            "-vf", norm_filter,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-frames:v", str(min(_get_frame_count(src, fps), 300)),  # cap to 300 frames for speed
            dst,
        ], capture_output=True, timeout=120)

    # VMAF
    vmaf_score = None
    try:
        vmaf_cmd = [
            "ffmpeg", "-y",
            "-i", norm_gen,
            "-i", norm_ref,
            "-filter_complex",
            "[0:v]setpts=PTS-STARTPTS[g];[1:v]setpts=PTS-STARTPTS[r];"
            f"[g][r]libvmaf=model=path=/usr/local/share/model/vmaf_v0.6.1.json:"
            f"n_threads=2:n_subsample=1",
            "-f", "null", "-",
        ]
        r = subprocess.run(vmaf_cmd, capture_output=True, text=True, timeout=300)
        for line in (r.stdout + r.stderr).split("\n"):
            if "VMAF score:" in line:
                vmaf_score = float(line.split("VMAF score:")[1].strip())
                break
    except Exception as e:
        print(f"  [eval] VMAF failed: {e}")

    # PSNR
    psnr_score = None
    try:
        psnr_cmd = [
            "ffmpeg", "-y",
            "-i", norm_gen, "-i", norm_ref,
            "-filter_complex", "psnr",
            "-f", "null", "-",
        ]
        r = subprocess.run(psnr_cmd, capture_output=True, text=True, timeout=120)
        for line in (r.stdout + r.stderr).split("\n"):
            if "average:" in line and "min:" in line:
                for part in line.split():
                    if part.startswith("average:"):
                        psnr_score = float(part.split(":")[1])
                        break
    except Exception:
        pass

    # SSIM
    ssim_score = None
    try:
        ssim_cmd = [
            "ffmpeg", "-y",
            "-i", norm_gen, "-i", norm_ref,
            "-filter_complex", "ssim",
            "-f", "null", "-",
        ]
        r = subprocess.run(ssim_cmd, capture_output=True, text=True, timeout=120)
        for line in (r.stdout + r.stderr).split("\n"):
            if "All:" in line:
                for part in line.split():
                    if part.startswith("All:"):
                        ssim_score = float(part.split(":")[1])
                        break
    except Exception:
        pass

    return {
        "vmaf": round(vmaf_score, 2) if vmaf_score is not None else None,
        "psnr": round(psnr_score, 2) if psnr_score is not None else None,
        "ssim": round(ssim_score, 4) if ssim_score is not None else None,
    }


def _get_frame_count(video_path: str, fps: float) -> int:
    """Get approximate frame count from duration * fps."""
    try:
        r = subprocess.run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json", video_path,
        ], capture_output=True, text=True, timeout=15)
        dur = float(json.loads(r.stdout)["format"]["duration"])
        return int(dur * fps)
    except Exception:
        return 0


# ── Full evaluation ────────────────────────────────────────────────

def evaluate(
    generated: str,
    reference: Optional[str] = None,
    music: Optional[str] = None,
    ref_cuts: Optional[list[float]] = None,
) -> dict:
    """Run all applicable metrics on a generated edit.

    Args:
        generated: Path to generated MP4.
        reference: Optional path to reference MP4 (ground truth edit).
        music: Optional path to music file (for beat alignment).
        ref_cuts: Optional list of ground-truth cut times (bypasses video extraction).

    Returns:
        Dict with all computed metrics.
    """
    result = {"generated": generated, "metrics": {}}

    # Extract cut times from generated
    gen_cuts = extract_cut_times(generated)
    result["generated_cuts"] = len(gen_cuts)

    # Cut-point F1 vs reference
    if ref_cuts is not None:
        result["reference_cuts"] = len(ref_cuts)
        result["metrics"]["cut_point_f1"] = cut_point_f1(gen_cuts, ref_cuts)
    elif reference and os.path.exists(reference):
        ref_cuts_extracted = extract_cut_times(reference)
        result["reference_cuts"] = len(ref_cuts_extracted)
        result["metrics"]["cut_point_f1"] = cut_point_f1(gen_cuts, ref_cuts_extracted)

    # Beat alignment
    if music and os.path.exists(music):
        result["metrics"]["beat_alignment"] = beat_alignment_rate(gen_cuts, music)

    # Quality vs reference
    if reference and os.path.exists(reference):
        with tempfile.TemporaryDirectory(prefix="eval_") as tmp:
            result["metrics"]["quality"] = quality_vs_reference(generated, reference, tmp)

    return result


# ── Regression guard ───────────────────────────────────────────────

def save_baseline(metrics: dict, path: str):
    """Save evaluation results as a baseline for regression comparison."""
    baseline = {
        "cut_point_f1": metrics.get("metrics", {}).get("cut_point_f1", {}).get("f1"),
        "beat_alignment_rate": metrics.get("metrics", {}).get("beat_alignment", {}).get("rate"),
        "vmaf": metrics.get("metrics", {}).get("quality", {}).get("vmaf"),
        "psnr": metrics.get("metrics", {}).get("quality", {}).get("psnr"),
        "ssim": metrics.get("metrics", {}).get("quality", {}).get("ssim"),
    }
    with open(path, "w") as f:
        json.dump(baseline, f, indent=2)
    print(f"  [eval] Baseline saved to {path}")


def compare_against_baseline(metrics: dict, baseline_path: str, thresholds: Optional[dict] = None) -> dict:
    """Compare current metrics against a saved baseline.

    Returns dict of regressions: {metric: {"before": x, "now": y, "delta": z}}
    Any metric that drops below threshold is flagged.
    """
    if not os.path.exists(baseline_path):
        return {"error": f"Baseline not found: {baseline_path}"}

    with open(baseline_path) as f:
        baseline = json.load(f)

    if thresholds is None:
        thresholds = {"cut_point_f1": 0.05, "beat_alignment_rate": 0.05, "vmaf": 2.0, "psnr": 1.0, "ssim": 0.01}

    current = {
        "cut_point_f1": metrics.get("metrics", {}).get("cut_point_f1", {}).get("f1"),
        "beat_alignment_rate": metrics.get("metrics", {}).get("beat_alignment", {}).get("rate"),
        "vmaf": metrics.get("metrics", {}).get("quality", {}).get("vmaf"),
        "psnr": metrics.get("metrics", {}).get("quality", {}).get("psnr"),
        "ssim": metrics.get("metrics", {}).get("quality", {}).get("ssim"),
    }

    regressions = {}
    for metric, baseline_val in baseline.items():
        if baseline_val is None:
            continue
        current_val = current.get(metric)
        if current_val is None:
            continue
        delta = round(current_val - baseline_val, 4)
        threshold = thresholds.get(metric, 0)
        if delta < -threshold:
            regressions[metric] = {
                "before": baseline_val,
                "now": current_val,
                "delta": delta,
                "threshold": threshold,
                "regressed": True,
            }

    return {
        "baseline": baseline_path,
        "current": current,
        "regressions": regressions,
        "passed": len(regressions) == 0,
    }


# ── CLI ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="E33 — Evaluation harness for Monet edit director")
    parser.add_argument("--generated", "-g", required=True, help="Generated MP4 to evaluate")
    parser.add_argument("--reference", "-r", help="Reference MP4 (ground truth edit)")
    parser.add_argument("--reference-cuts", help="JSON file with reference cut times (e.g. {'cuts': [3.0, 6.0]})")
    parser.add_argument("--music", "-m", help="Music file (for beat alignment)")
    parser.add_argument("--save-baseline", help="Save metrics as baseline JSON")
    parser.add_argument("--compare", help="Compare against a saved baseline JSON")
    parser.add_argument("--output", "-o", help="Output metrics JSON path")
    args = parser.parse_args()

    if not os.path.exists(args.generated):
        print(f"Error: generated file not found: {args.generated}")
        sys.exit(1)

    ref_cuts = None
    if args.reference_cuts:
        with open(args.reference_cuts) as f:
            data = json.load(f)
        if isinstance(data, dict):
            ref_cuts = data.get("cuts", data.get("reference_cuts", []))
        elif isinstance(data, list):
            ref_cuts = data

    print(f"=== E33 Evaluation ===")
    print(f"Generated: {args.generated}")
    if args.reference:
        print(f"Reference: {args.reference}")
    if args.music:
        print(f"Music:     {args.music}")

    metrics = evaluate(
        generated=args.generated,
        reference=args.reference,
        music=args.music,
        ref_cuts=ref_cuts,
    )

    if args.save_baseline:
        save_baseline(metrics, args.save_baseline)

    if args.compare:
        comparison = compare_against_baseline(metrics, args.compare)
        metrics["regression"] = comparison
        if comparison.get("passed"):
            print(f"\nRegression check: PASSED (no regressions)")
        else:
            print(f"\nRegression check: FAILED")
            for name, info in comparison.get("regressions", {}).items():
                print(f"  {name}: {info['before']} → {info['now']} (Δ{info['delta']}, threshold {info['threshold']})")

    if args.output:
        with open(args.output, "w") as f:
            json.dump(metrics, f, indent=2, default=str)
        print(f"\nMetrics written to {args.output}")
    else:
        print(json.dumps(metrics, indent=2, default=str))
