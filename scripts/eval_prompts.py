"""Prompt compliance evaluation — measures whether Kove output matches prompt intent.

Usage:
    python scripts/eval_prompts.py                          # run all prompt tests
    python scripts/eval_prompts.py --list                   # list registered tests
    python scripts/eval_prompts.py --test clean_youtube     # run specific test
    python scripts/eval_prompts.py --save-baseline          # save as baseline
    python scripts/eval_prompts.py --compare                # compare vs baseline
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BASELINE_DIR = REPO_ROOT / "tests/fixtures/baselines"

KMP_ENV = os.environ.copy()
KMP_ENV["KMP_DUPLICATE_LIB_OK"] = "TRUE"

PROMPT_TESTS: list[dict] = [
    {
        "id": "clean_youtube",
        "description": "Clean YouTube talking-head edit",
        "footage": "tests/fixtures/youtube_talking_head/footage.mp4",
        "preset": "clean_youtube",
        "expected": {
            "mode": "dialogue",
            "min_shots": 2,
            "max_shots": 5,
            "min_output_duration": 8.0,
            "min_captions": 5,
            "max_avg_shot_duration": 6.0,
            "transition_preference": "hard_cut",
        },
    },
    {
        "id": "fast_tiktok_montage",
        "description": "Fast TikTok style on sports footage",
        "footage": "test/High Quality Steph Curry Clips for Edits! (2024-25).mp4",
        "preset": "fast_tiktok",
        "expected": {
            "mode": "montage",
            "min_shots": 15,
            "max_shots": 40,
            "min_output_duration": 20.0,
            "max_avg_shot_duration": 2.5,
            "transition_variety": True,
        },
    },
    {
        "id": "cinematic_travel",
        "description": "Cinematic travel style on action footage",
        "footage": "test/High Quality Steph Curry Clips for Edits! (2024-25).mp4",
        "preset": "cinematic_travel",
        "expected": {
            "mode": "montage",
            "min_shots": 5,
            "max_shots": 20,
            "min_output_duration": 15.0,
            "min_avg_shot_duration": 2.5,
            "transition_vocab_contains": ["crossfade"],
        },
    },
    {
        "id": "founder_launch",
        "description": "Founder launch on talking-head footage",
        "footage": "test/MikeRoss.mp4",
        "preset": "founder_launch",
        "expected": {
            "mode": "dialogue",
            "min_shots": 8,
            "max_shots": 30,
            "min_captions": 10,
            "min_output_duration": 30.0,
        },
    },
    {
        "id": "product_ad",
        "description": "Product ad on sports footage",
        "footage": "test/High Quality Steph Curry Clips for Edits! (2024-25).mp4",
        "preset": "product_ad",
        "expected": {
            "mode": "montage",
            "min_shots": 10,
            "max_shots": 30,
            "min_output_duration": 15.0,
            "max_avg_shot_duration": 3.0,
        },
    },
    {
        "id": "podcast_shorts",
        "description": "Podcast shorts on talking-head footage",
        "footage": "tests/fixtures/youtube_talking_head/footage.mp4",
        "preset": "podcast_shorts",
        "expected": {
            "mode": "dialogue",
            "min_shots": 2,
            "max_shots": 5,
            "min_captions": 5,
            "min_output_duration": 8.0,
        },
    },
]


def run_prompt_test(test: dict) -> dict:
    """Run a prompt test and return metrics."""
    footage_path = str(REPO_ROOT / test["footage"])
    output_edl = os.path.join(tempfile.gettempdir(), f"prompt_eval_{test['id']}.edl.json")

    cmd = [
        sys.executable, str(REPO_ROOT / "scripts/analyzers/edit_director.py"),
        footage_path,
        "--preset", test["preset"],
        "-o", output_edl,
        "--no-llm",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=KMP_ENV)
    if result.returncode != 0:
        return {"id": test["id"], "error": f"Director crashed: {result.stderr[:300]}"}

    if not os.path.exists(output_edl):
        return {"id": test["id"], "error": "EDL not produced"}

    with open(output_edl) as f:
        edl = json.load(f)

    # Extract metrics from EDL
    video_clips = []
    caption_clips = []
    timeline = edl.get("timeline", {})
    for track in timeline.get("tracks", []):
        if track.get("type") == "video":
            video_clips = track.get("clips", [])
        if track.get("type") == "text":
            for c in track.get("clips", []):
                meta = c.get("meta", {})
                if meta.get("role") == "caption":
                    caption_clips.append(c)

    # Compute shot stats
    shots = len(video_clips)
    total_dur = sum(c.get("duration", 0) for c in video_clips) if video_clips else 0
    avg_shot = round(total_dur / max(shots, 1), 2)

    # Transition vocabulary
    cut_types = set()
    for c in video_clips:
        ct = c.get("meta", {}).get("cut_type", "hard_cut")
        cut_types.add(ct)

    # Captions
    caption_count = len(caption_clips)

    # Determine mode from preset
    mode = test.get("expected", {}).get("mode", "unknown")

    return {
        "id": test["id"],
        "mode": mode,
        "shots": shots,
        "output_dur": round(total_dur, 1),
        "avg_shot": avg_shot,
        "captions": caption_count,
        "cut_types": sorted(cut_types),
        "has_captions": caption_count > 0,
    }


def check_compliance(metrics: dict, expected: dict) -> tuple[bool, list[str]]:
    """Check if metrics comply with expected characteristics."""
    violations = []

    if "min_shots" in expected and metrics["shots"] < expected["min_shots"]:
        violations.append(
            f"shots: {metrics['shots']} < min {expected['min_shots']}"
        )
    if "max_shots" in expected and metrics["shots"] > expected["max_shots"]:
        violations.append(
            f"shots: {metrics['shots']} > max {expected['max_shots']}"
        )
    if "min_output_duration" in expected and metrics["output_dur"] < expected["min_output_duration"]:
        violations.append(
            f"output_dur: {metrics['output_dur']}s < min {expected['min_output_duration']}s"
        )
    if "min_captions" in expected and metrics["captions"] < expected["min_captions"]:
        violations.append(
            f"captions: {metrics['captions']} < min {expected['min_captions']}"
        )
    if "max_avg_shot_duration" in expected and metrics["avg_shot"] > expected["max_avg_shot_duration"]:
        violations.append(
            f"avg_shot: {metrics['avg_shot']}s > max {expected['max_avg_shot_duration']}s"
        )
    if "min_avg_shot_duration" in expected and metrics["avg_shot"] < expected["min_avg_shot_duration"]:
        violations.append(
            f"avg_shot: {metrics['avg_shot']}s < min {expected['min_avg_shot_duration']}s"
        )
    if "transition_preference" in expected:
        pref = expected["transition_preference"]
        if pref not in metrics["cut_types"]:
            violations.append(
                f"cut_types: {pref} not in {metrics['cut_types']}"
            )
    if "transition_vocab_contains" in expected:
        for vt in expected["transition_vocab_contains"]:
            if vt not in metrics["cut_types"]:
                violations.append(
                    f"cut_types: expected '{vt}' in {metrics['cut_types']}"
                )

    return len(violations) == 0, violations


def run_all(save_baseline: bool = False, compare: bool = False):
    """Run all prompt tests."""
    results = []
    passed = 0
    failed = 0
    skipped = 0

    print(f"{'='*80}")
    print(f"  Kove Prompt Compliance Evaluation")
    print(f"  {datetime.now().isoformat()}")
    print(f"  {len(PROMPT_TESTS)} registered tests")
    print(f"{'='*80}\n")

    for i, test in enumerate(PROMPT_TESTS):
        print(f"[{i+1}/{len(PROMPT_TESTS)}] {test['id']}")
        print(f"  {test['description']}")
        print(f"  Footage: {test['footage']}")

        footage_path = REPO_ROOT / test["footage"]
        if not footage_path.exists():
            print(f"  ⏭  SKIP: footage not found")
            results.append({"id": test["id"], "error": "footage not found"})
            skipped += 1
            continue

        metrics = run_prompt_test(test)

        if "error" in metrics:
            print(f"  ✗ ERROR: {metrics['error']}")
            results.append(metrics)
            failed += 1
            continue

        expected = test["expected"]
        compliant, violations = check_compliance(metrics, expected)

        status = "✓" if compliant else "✗"
        print(f"  {status} Mode={metrics['mode']}, "
              f"Shots={metrics['shots']}, Dur={metrics['output_dur']}s, "
              f"Avg={metrics['avg_shot']}s, Caps={metrics['captions']}")
        print(f"  Cut types: {', '.join(metrics['cut_types'])}")

        if violations:
            print(f"  Violations:")
            for v in violations:
                print(f"    - {v}")
            failed += 1
        else:
            passed += 1

        results.append({
            "id": test["id"],
            "passed": compliant,
            "mode": metrics["mode"],
            "shots": metrics["shots"],
            "output_dur": metrics["output_dur"],
            "avg_shot": metrics["avg_shot"],
            "captions": metrics["captions"],
            "cut_types": metrics["cut_types"],
            "violations": violations,
        })
        print()

    # Summary
    total = len(PROMPT_TESTS) - skipped
    print(f"{'='*80}")
    print(f"  Results: {passed} passed, {failed} failed, {skipped} skipped / {total} attempted")
    print(f"{'='*80}\n")

    # Save baseline
    if save_baseline:
        baseline = {r["id"]: r for r in results}
        baseline_path = BASELINE_DIR / "prompt_compliance.json"
        BASELINE_DIR.mkdir(parents=True, exist_ok=True)
        with open(baseline_path, "w") as f:
            json.dump(baseline, f, indent=2)
        print(f"Baseline saved to {baseline_path}")

    return passed == 0 or (failed == 0 and skipped == 0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kove prompt compliance evaluation")
    parser.add_argument("--list", action="store_true", help="List registered tests")
    parser.add_argument("--test", help="Run specific test by ID")
    parser.add_argument("--save-baseline", action="store_true", help="Save metrics as baseline")
    parser.add_argument("--compare", action="store_true", help="Compare against saved baseline")
    args = parser.parse_args()

    if args.list:
        for t in PROMPT_TESTS:
            print(f"  {t['id']:25s} {t['description']}")
            print(f"  {'':25s} Footage: {t['footage']}, Preset: {t['preset']}")
            print()
        sys.exit(0)

    if args.test:
        test_list = [t for t in PROMPT_TESTS if t["id"] == args.test]
        if not test_list:
            print(f"Test '{args.test}' not found")
            sys.exit(1)
    else:
        test_list = PROMPT_TESTS

    success = run_all(
        save_baseline=args.save_baseline,
        compare=args.compare,
    )
    sys.exit(0 if success else 1)
