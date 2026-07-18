"""Stranger footage stress tests — runs director on diverse real-world inputs.

Usage:
    python scripts/test_stranger_footage.py                          # run all tests
    python scripts/test_stranger_footage.py --list                   # list registered tests
    python scripts/test_stranger_footage.py --test montage           # run specific test group
    python scripts/test_stranger_footage.py --save-failures          # copy failed EDLs/videos
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FAILURES_DIR = REPO_ROOT / "failed_generations"
RESULTS_FILE = REPO_ROOT / "test_stranger_results.csv"

KMP_ENV = os.environ.copy()
KMP_ENV["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Test registry: (name, footage_path, mode, profile_path or None for auto)
# Categories: montage, dialogue, vertical, noisy, mixed, screen_recording
TESTS: list[dict] = [
    # ── Montage (beat-driven edits) ──
    {
        "name": "montage_steph_highlights",
        "footage": "test/High Quality Steph Curry Clips for Edits! (2024-25).mp4",
        "mode": "montage",
        "profile": "tests/fixtures/fixture-c/profile.json",
        "category": "montage",
        "notes": "Sports highlights, 72s, 1280x720",
    },
    {
        "name": "montage_hamilton_clip",
        "footage": "external/face-recognition/examples/hamilton_clip.mp4",
        "mode": "montage",
        "profile": "tests/fixtures/fixture-c/profile.json",
        "category": "montage",
        "notes": "Dialogue scene (treated as montage), 78s, 640x360, low res",
    },
    {
        "name": "montage_vertical_clip",
        "footage": "workers/render-worker/fixtures/test_clip.mp4",
        "mode": "montage",
        "profile": "tests/fixtures/fixture-c/profile.json",
        "category": "vertical",
        "notes": "Vertical 1080x1920, 5s, phone-style",
    },

    # ── Dialogue (speech-led edits) ──
    {
        "name": "dialogue_mike_ross",
        "footage": "test/MikeRoss.mp4",
        "mode": "dialogue",
        "profile": "tests/fixtures/youtube_talking_head/profile.json",
        "category": "dialogue",
        "notes": "Talking head, 114s, 1280x720",
    },
    {
        "name": "dialogue_youtube_fixture",
        "footage": "tests/fixtures/youtube_talking_head/footage.mp4",
        "mode": "dialogue",
        "profile": "tests/fixtures/youtube_talking_head/profile.json",
        "category": "dialogue",
        "notes": "Known good fixture, 15s, 1280x720",
    },
    {
        "name": "dialogue_hamilton",
        "footage": "external/face-recognition/examples/hamilton_clip.mp4",
        "mode": "dialogue",
        "profile": "tests/fixtures/youtube_talking_head/profile.json",
        "category": "dialogue",
        "notes": "Dialogue scene, 78s, 640x360, low res",
    },

    # ── Auto mode (let router decide) ──
    {
        "name": "auto_steph_highlights",
        "footage": "test/High Quality Steph Curry Clips for Edits! (2024-25).mp4",
        "mode": "auto",
        "profile": "tests/fixtures/fixture-c/profile.json",
        "category": "auto",
        "notes": "Sports, auto-detect",
    },
    {
        "name": "auto_mike_ross",
        "footage": "test/MikeRoss.mp4",
        "mode": "auto",
        "profile": "tests/fixtures/youtube_talking_head/profile.json",
        "category": "auto",
        "notes": "Talking head, auto-detect (should route to montage due to <60s? Actually 114s > 60s)",
    },

    # ── Aspect ratio / resolution edge cases ──
    {
        "name": "edge_portrait_spiderman",
        "footage": "monet-reference-edits/SPIDERMAN (IMPORTANT).MP4",
        "mode": "montage",
        "profile": "tests/fixtures/fixture-c/profile.json",
        "category": "edge",
        "notes": "Portrait 576x1104, 46s",
    },
    {
        "name": "edge_square_1x1",
        "footage": "monet-reference-edits/v1c044g50000d7u06h7og65mnbolgl90.MP4",
        "mode": "montage",
        "profile": "tests/fixtures/fixture-c/profile.json",
        "category": "edge",
        "notes": "Square 576x576, 24s",
    },
    {
        "name": "edge_lowres_640x360",
        "footage": "external/face-recognition/examples/short_hamilton_clip.mp4",
        "mode": "montage",
        "profile": "tests/fixtures/fixture-c/profile.json",
        "category": "edge",
        "notes": "Low res 640x360, 9s",
    },
]


def check_footage(test: dict) -> bool:
    """Verify footage file exists and is valid."""
    path = REPO_ROOT / test["footage"]
    if not path.exists():
        test["error"] = f"File not found: {path}"
        return False
    try:
        result = subprocess.run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration,size",
            "-show_entries", "stream=width,height,codec_name",
            "-of", "json", str(path),
        ], capture_output=True, text=True, timeout=15)
        info = json.loads(result.stdout)
        fmt = info.get("format", {})
        test["duration"] = round(float(fmt.get("duration", 0)), 1)
        test["size_mb"] = round(int(fmt.get("size", 0)) / (1024 * 1024), 1)
        streams = info.get("streams", [])
        for s in streams:
            if s.get("codec_type") == "video":
                w = s.get("width", 0)
                h = s.get("height", 0)
                test["width"] = w if w and h else 0
                test["height"] = h if w and h else 0
                break
        return True
    except Exception as e:
        test["error"] = f"ffprobe failed: {e}"
        return False


def run_single_test(test: dict, render: bool = False) -> dict:
    """Run Kove director on one test case."""
    footage_path = str(REPO_ROOT / test["footage"])
    profile_path = str(REPO_ROOT / test["profile"])
    mode = test["mode"]

    output_edl = os.path.join(tempfile.gettempdir(), f"stranger_{test['name']}.edl.json")
    output_video = os.path.join(tempfile.gettempdir(), f"stranger_{test['name']}.mp4") if render else None

    cmd = [
        sys.executable, str(REPO_ROOT / "scripts/analyzers/edit_director.py"),
        footage_path,
        profile_path,
        "-o", output_edl,
        "--no-llm",  # no LLM for test consistency
    ]

    if mode != "auto":
        cmd.extend(["--mode", mode])

    if output_video:
        cmd.extend(["--render", output_video])

    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=KMP_ENV)
    elapsed = time.time() - start

    test_result = {
        "name": test["name"],
        "mode": mode,
        "category": test.get("category", ""),
        "duration_s": test.get("duration", 0),
        "resolution": f"{test.get('width', '?')}x{test.get('height', '?')}",
        "elapsed_s": round(elapsed, 1),
        "returncode": result.returncode,
        "stdout_truncated": result.stdout[:200] if result.stdout else "",
        "stderr_truncated": result.stderr[:300] if result.stderr else "",
    }

    # Check if EDL was produced
    if os.path.exists(output_edl):
        try:
            with open(output_edl) as f:
                edl = json.load(f)
            clips = []
            for track in edl.get("timeline", {}).get("tracks", []):
                if track.get("type") == "video":
                    clips = track.get("clips", [])
                    break
            test_result["num_shots"] = len(clips)
            if clips:
                total_dur = sum(c.get("duration", 0) for c in clips)
                test_result["output_duration"] = round(total_dur, 1)
                test_result["avg_shot"] = round(total_dur / len(clips), 2)

            # Check for caption track
            has_captions = any(
                t.get("type") == "text"
                for t in edl.get("timeline", {}).get("tracks", [])
            )
            test_result["has_captions"] = has_captions
        except Exception as e:
            test_result["edl_error"] = str(e)
    else:
        test_result["edl_error"] = "EDL not produced"

    # Check if video was rendered
    if output_video and os.path.exists(output_video):
        test_result["render_size_mb"] = round(os.path.getsize(output_video) / (1024 * 1024), 1)
    elif output_video:
        test_result["render_error"] = "Render output not found"

    # Determine pass/fail
    test_result["passed"] = (
        result.returncode == 0
        and not test_result.get("edl_error")
        and test_result.get("num_shots", 0) >= 1
    )

    return test_result


def save_failure(test_name: str):
    """Copy failed EDL and render to failed_generations/."""
    src_edl = os.path.join(tempfile.gettempdir(), f"stranger_{test_name}.edl.json")
    src_video = os.path.join(tempfile.gettempdir(), f"stranger_{test_name}.mp4")
    dst_dir = FAILURES_DIR / f"{test_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    dst_dir.mkdir(parents=True, exist_ok=True)
    if os.path.exists(src_edl):
        import shutil
        shutil.copy2(src_edl, dst_dir / "output.edl.json")
    if os.path.exists(src_video):
        import shutil
        shutil.copy2(src_video, dst_dir / "output.mp4")


def run_all(test_list=None, render: bool = False, save_failures: bool = False):
    """Run all registered tests."""
    if test_list is None:
        test_list = TESTS
    results = []
    passed = 0
    failed = 0
    skipped = 0

    print(f"{'='*80}")
    print(f"  Kove Stranger Footage Stress Tests")
    print(f"  {datetime.now().isoformat()}")
    print(f"  {len(test_list)} registered tests")
    print(f"{'='*80}\n")

    for i, test in enumerate(test_list):
        print(f"[{i+1}/{len(test_list)}] {test['name']} ({test['mode']}, {test['category']})")
        print(f"  Footage: {test['footage']}")

        # Check footage
        if not check_footage(test):
            print(f"  ⏭  SKIP: {test.get('error', 'unknown error')}")
            results.append({
                "name": test["name"], "passed": False, "error": test.get("error"),
            })
            skipped += 1
            continue

        print(f"  Input: {test.get('duration', '?')}s, {test.get('width', '?')}x{test.get('height', '?')}, "
              f"{test.get('size_mb', '?')}MB")

        # Run
        result = run_single_test(test, render=render)
        results.append(result)

        status = "✓" if result["passed"] else "✗"
        print(f"  {status} Code={result['returncode']}, "
              f"Shots={result.get('num_shots', 'N/A')}, "
              f"Elapsed={result['elapsed_s']}s")
        if result.get("edl_error"):
            print(f"  EDL Error: {result['edl_error']}")
        if result.get("avg_shot"):
            print(f"  Avg shot: {result['avg_shot']}s, "
                  f"Output: {result.get('output_duration', 0)}s")
        if result.get("has_captions"):
            print(f"  Captions: yes")
        if result.get("render_error"):
            print(f"  Render Error: {result['render_error']}")

        if result["passed"]:
            passed += 1
        else:
            failed += 1
            if save_failures:
                save_failure(test["name"])

        print()

    # Summary
    print(f"{'='*80}")
    print(f"  Results: {passed} passed, {failed} failed, {skipped} skipped / {len(test_list)} total")
    print(f"{'='*80}\n")

    # Write CSV
    if results:
        with open(RESULTS_FILE, "w", newline="") as f:
            fieldnames = [
                "name", "mode", "category", "passed", "returncode",
                "duration_s", "resolution", "num_shots", "avg_shot",
                "output_duration", "has_captions", "edl_error",
                "render_error", "render_size_mb", "elapsed_s",
            ]
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(results)
        print(f"Results saved to {RESULTS_FILE}")

    return failed == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kove stranger footage stress tests")
    parser.add_argument("--list", action="store_true", help="List registered tests")
    parser.add_argument("--test", help="Run only tests in this category (montage, dialogue, edge, auto)")
    parser.add_argument("--render", action="store_true", help="Also render to video")
    parser.add_argument("--save-failures", action="store_true", help="Save failed EDLs/videos")
    args = parser.parse_args()

    if args.list:
        by_category = defaultdict(list)
        for t in TESTS:
            by_category[t["category"]].append(t)
        for cat, tests in sorted(by_category.items()):
            print(f"\n[{cat}]")
            for t in tests:
                print(f"  {t['name']:40s} {t['mode']:10s} {t['notes']}")
        print()
        sys.exit(0)

    test_list = TESTS
    if args.test:
        test_list = [t for t in TESTS if t["category"] == args.test]
        if not test_list:
            print(f"No tests found in category '{args.test}'")
            print(f"Available categories: montage, dialogue, edge, auto")
            sys.exit(1)

    success = run_all(test_list=test_list, render=args.render, save_failures=args.save_failures)
    sys.exit(0 if success else 1)
