"""E33 dialogue-mode eval: sentence-boundary cut F1, dead-air removal, caption WER.

Usage:
    python scripts/eval_dialogue.py                          # run on default fixture
    python scripts/eval_dialogue.py --fixture youtube_talking_head  # explicit
    python scripts/eval_dialogue.py --save-baseline                 # save as baseline
    python scripts/eval_dialogue.py --compare baseline              # compare vs saved
    python scripts/eval_dialogue.py --list                          # list saved baselines

Metrics:
  1. sentence_boundary_cut_rate — F1 of generated cuts vs reference sentence-boundary cuts
     (mir_eval onset.f_measure with 150ms tolerance)
  2. dead_air_removed — how much silence was compressed
     (silence_before → silence_after, removed_pct)
  3. caption_wer — word error rate of burned captions vs ground truth transcript
     (jiwer.wer)

Returns non-zero exit if any metric drops 5+ points below baseline.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

# Prevent OpenMP crash from multiple libiomp5.dylib (torch + librosa clash)
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import numpy as np

BASELINE_DIR = Path("tests/fixtures/baselines")
FIXTURE_ROOT = Path("tests/fixtures")

# Default fixture
DEFAULT_FIXTURE = "youtube_talking_head"

# Allowed regression from baseline
REGRESSION_TOLERANCE = {
    "cut_f1": 0.05,
    "caption_wer": 0.05,
    "removed_pct": 10.0,
}


def _ensure_mir_eval():
    try:
        import mir_eval
        return mir_eval
    except ImportError:
        print("[eval] mir_eval not installed — run: pip install mir_eval")
        sys.exit(1)


def _ensure_jiwer():
    try:
        import jiwer
        return jiwer
    except ImportError:
        print("[eval] jiwer not installed — run: pip install jiwer")
        sys.exit(1)


def _extract_cuts_from_edl(edl_path: str) -> list[float]:
    """Extract cut times from an EDL JSON file.

    Returns transition times between clips (ignoring shot 0 which has no
    incoming transition).
    """
    with open(edl_path) as f:
        edl = json.load(f)

    video_track = None
    for track in edl["timeline"]["tracks"]:
        if track["type"] == "video":
            video_track = track
            break

    if not video_track:
        return []

    clips = video_track["clips"]
    cuts = []
    cumulative = 0.0
    for i, clip in enumerate(clips):
        dur = clip.get("duration", 0)
        if i > 0:
            cuts.append(round(cumulative, 3))
        cumulative += dur

    return cuts


def _extract_captions_from_edl(edl_path: str) -> str:
    """Concatenate all caption text from the EDL's caption track."""
    with open(edl_path) as f:
        edl = json.load(f)

    texts = []
    for track in edl["timeline"]["tracks"]:
        if track["type"] == "text":
            for clip in track["clips"]:
                role = clip.get("meta", {}).get("role", "")
                if role == "caption":
                    text = clip.get("meta", {}).get("text_content", "")
                    if text:
                        texts.append(text)
    return " ".join(texts)


def _measure_silence(video_path: str) -> tuple[float, float]:
    """Measure total silence in video before and after editing.

    Returns (original_silence_s, output_silence_s).
    For the fixture, original silence is computed from the transcript's
    dead_air list. Output silence is measured via ffmpeg silence detection.
    """
    # Measure silence in the output video via ffmpeg silencedetect
    try:
        result = subprocess.run([
            "ffmpeg", "-i", video_path, "-af",
            "silencedetect=noise=-30dB:d=0.3",
            "-f", "null", "-",
        ], capture_output=True, text=True, timeout=30)

        output_silence = 0.0
        for line in result.stderr.split("\n"):
            if "silence_duration" in line:
                dur = float(line.split(":")[1].strip().split()[0])
                output_silence += dur

        return (0.0, round(output_silence, 3))  # original measured from transcript
    except Exception as e:
        print(f"  [eval] Silence detection failed: {e}")
        return (0.0, 0.0)


def run_metrics(fixture_name: str, generated_edl: str, generated_video: str) -> dict:
    """Compute all three metrics for a generated EDL vs fixture ground truth."""
    mir_eval = _ensure_mir_eval()
    jiwer = _ensure_jiwer()

    fixture_dir = FIXTURE_ROOT / fixture_name

    # Load ground truth
    with open(fixture_dir / "transcript.json") as f:
        transcript = json.load(f)
    with open(fixture_dir / "reference_cuts.json") as f:
        ref_data = json.load(f)

    ref_cuts = np.array(ref_data["cuts"])
    gen_cuts_raw = _extract_cuts_from_edl(generated_edl)
    gen_cuts = np.array(gen_cuts_raw) if gen_cuts_raw else np.array([0.0])

    # Metric 1: sentence-boundary cut F1
    if len(ref_cuts) > 0 and len(gen_cuts) > 0:
        f1, p, r = mir_eval.onset.f_measure(ref_cuts, gen_cuts, window=0.15)
    else:
        f1, p, r = 0.0, 0.0, 0.0

    cut_metrics = {
        "cut_f1": round(float(f1), 3),
        "cut_precision": round(float(p), 3),
        "cut_recall": round(float(r), 3),
        "generated_cuts": len(gen_cuts_raw),
        "reference_cuts": len(ref_cuts),
    }

    # Metric 2: dead-air removed
    orig_silence = sum(
        da.get("duration", 0) for da in transcript.get("dead_air", [])
    )
    _, output_silence = _measure_silence(generated_video)
    removed_pct = round(
        100 * (1 - output_silence / max(orig_silence, 1e-6)), 1
    ) if orig_silence > 0 else 100.0

    silence_metrics = {
        "silence_before_s": round(orig_silence, 2),
        "silence_after_s": round(output_silence, 2),
        "removed_pct": removed_pct,
    }

    # Metric 3: caption WER
    gen_text = _extract_captions_from_edl(generated_edl)
    gt_text = " ".join(s["text"] for s in transcript.get("sentences", []))

    if gen_text.strip() and gt_text.strip():
        caption_wer_val = jiwer.wer(gt_text, gen_text)
    else:
        caption_wer_val = 1.0 if gt_text.strip() else 0.0

    caption_metrics = {
        "caption_wer": round(float(caption_wer_val), 3),
        "generated_words": len(gen_text.split()) if gen_text.strip() else 0,
        "reference_words": len(gt_text.split()) if gt_text.strip() else 0,
    }

    return {
        "fixture": fixture_name,
        "cut_metrics": cut_metrics,
        "silence_metrics": silence_metrics,
        "caption_metrics": caption_metrics,
    }


def check_regression(metrics: dict, baseline: dict) -> list[str]:
    """Compare metrics against baseline, return list of regressions."""
    failures = []
    for key in ("cut_f1",):
        val = metrics["cut_metrics"].get(key, 0)
        base = baseline.get("cut_metrics", {}).get(key, 0)
        if val < base - REGRESSION_TOLERANCE.get(key, 0.05):
            failures.append(
                f"{key}: {val:.3f} vs baseline {base:.3f} "
                f"(tolerance {REGRESSION_TOLERANCE[key]:.3f})"
            )

    key = "caption_wer"
    val = metrics["caption_metrics"].get(key, 1.0)
    base = baseline.get("caption_metrics", {}).get(key, 1.0)
    if val > base + REGRESSION_TOLERANCE.get(key, 0.05):
        failures.append(
            f"{key}: {val:.3f} vs baseline {base:.3f} "
            f"(tolerance {REGRESSION_TOLERANCE[key]:.3f})"
        )

    key = "removed_pct"
    val = metrics["silence_metrics"].get(key, 0)
    base = baseline.get("silence_metrics", {}).get(key, 0)
    if val < base - REGRESSION_TOLERANCE.get(key, 10.0):
        failures.append(
            f"{key}: {val:.1f}% vs baseline {base:.1f}% "
            f"(tolerance {REGRESSION_TOLERANCE[key]:.1f}pp)"
        )

    return failures


def run_dialogue_eval(fixture_name: str, save_baseline: bool = False,
                       compare_baseline: Optional[str] = None) -> dict:
    """Run the full dialogue eval pipeline.

    1. Runs direct_edit with mode=dialogue on the fixture
    2. Collects metrics
    3. Optionally saves/compares against baseline
    """
    fixture_dir = FIXTURE_ROOT / fixture_name
    footage_path = fixture_dir / "footage.mp4"
    profile_path = fixture_dir / "profile.json"

    if not footage_path.exists():
        print(f"[eval] Fixture not found: {fixture_dir}")
        return {"error": f"Fixture not found: {fixture_name}"}

    # Run direct_edit with dialogue mode
    print(f"\n=== Dialogue Eval: {fixture_name} ===")
    output_edl = os.path.join(tempfile.gettempdir(), "dialogue_eval_output.edl.json")
    output_video = os.path.join(tempfile.gettempdir(), "dialogue_eval_output.mp4")

    env = os.environ.copy()
    env["KMP_DUPLICATE_LIB_OK"] = "TRUE"  # macOS OpenMP workaround

    cmd = [
        sys.executable, "scripts/analyzers/edit_director.py",
        str(footage_path),
        str(profile_path),
        "-o", output_edl,
        "--mode", "dialogue",
    ]

    # Also render to video for silence measurement
    cmd.extend(["--render", output_video])

    print(f"  Running: {' '.join(cmd[-8:])}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, env=env)

    if result.returncode != 0:
        print(f"  [eval] direct_edit failed:\n{result.stderr[:500]}")
        return {"error": f"direct_edit failed: {result.stderr[:200]}"}

    print(result.stdout)

    if not os.path.exists(output_edl):
        print(f"  [eval] EDL not produced at {output_edl}")
        return {"error": "EDL not produced"}

    # Compute metrics
    metrics = run_metrics(fixture_name, output_edl, output_video)

    print(f"\n  Metrics for {fixture_name}:")
    print(f"    Cut F1:          {metrics['cut_metrics']['cut_f1']:.3f} "
          f"({metrics['cut_metrics']['generated_cuts']} gen vs "
          f"{metrics['cut_metrics']['reference_cuts']} ref)")
    print(f"    Silence removed: {metrics['silence_metrics']['removed_pct']:.0f}% "
          f"({metrics['silence_metrics']['silence_before_s']:.2f}s → "
          f"{metrics['silence_metrics']['silence_after_s']:.2f}s)")
    print(f"    Caption WER:     {metrics['caption_metrics']['caption_wer']:.3f} "
          f"({metrics['caption_metrics']['generated_words']} gen vs "
          f"{metrics['caption_metrics']['reference_words']} ref)")

    # Baseline comparison
    baseline_path = BASELINE_DIR / f"{fixture_name}.json"
    if compare_baseline:
        if not baseline_path.exists():
            print(f"\n  No saved baseline for {fixture_name}")
        else:
            with open(baseline_path) as f:
                baseline = json.load(f)
            failures = check_regression(metrics, baseline)
            if failures:
                print(f"\n  REGRESSIONS FOUND ({len(failures)}):")
                for f_msg in failures:
                    print(f"    - {f_msg}")
                metrics["regressions"] = failures
            else:
                print(f"\n  All metrics within tolerance ✓")

    if save_baseline:
        BASELINE_DIR.mkdir(parents=True, exist_ok=True)
        with open(baseline_path, "w") as f:
            json.dump(metrics, f, indent=2)
        print(f"\n  Baseline saved to {baseline_path}")

    return metrics


def list_baselines() -> list[str]:
    """List all saved baselines."""
    if not BASELINE_DIR.exists():
        return []
    return sorted(
        f.stem for f in BASELINE_DIR.iterdir() if f.suffix == ".json"
    )


def main():
    parser = argparse.ArgumentParser(
        description="E33 dialogue-mode evaluation harness"
    )
    parser.add_argument("--fixture", default=DEFAULT_FIXTURE,
                        help=f"Fixture name (default: {DEFAULT_FIXTURE})")
    parser.add_argument("--save-baseline", action="store_true",
                        help="Save metrics as new baseline")
    parser.add_argument("--compare", nargs="?", const="default", default=None,
                        help="Compare against saved baseline")
    parser.add_argument("--list", action="store_true",
                        help="List saved baselines")
    args = parser.parse_args()

    if args.list:
        baselines = list_baselines()
        if baselines:
            print("Saved baselines:")
            for b in baselines:
                print(f"  {b}")
        else:
            print("No saved baselines found")
        return

    metrics = run_dialogue_eval(
        args.fixture,
        save_baseline=args.save_baseline,
        compare_baseline=args.compare,
    )

    if metrics.get("error"):
        sys.exit(1)

    if metrics.get("regressions"):
        sys.exit(1)


if __name__ == "__main__":
    main()
