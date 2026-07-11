#!/usr/bin/env python3
"""
verify-refinement-loop.py — Automated test harness for refinement scenarios.
Run: python3 scripts/verify-refinement-loop.py
"""

import json
import subprocess
import sys
import os
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
PYTHON = sys.executable
REFINE_SCRIPT = WORKSPACE / "scripts" / "monet_refine.py"

# Test EDL fixture
TEST_EDL = {
    "version": 1,
    "id": "test",
    "meta": {"createdAt": 0, "updatedAt": 0, "aspectRatio": "16:9", "fps": 30, "sampleRate": 48000},
    "assets": {"media": {}, "audio": {}, "overlays": {}},
    "timeline": {
        "duration": 10,
        "tracks": [{
            "id": "v", "type": "video", "order": 0, "locked": False, "hidden": False,
            "clips": [
                {"id": f"clip-{i}", "mediaId": "m1", "startTime": i * 2.5, "duration": 2.5,
                 "inPoint": i * 2.5, "outPoint": (i + 1) * 2.5, "speed": 1,
                 "transforms": {"position": [{"time": 0, "x": 0, "y": 0}],
                                "scale": [{"time": 0, "value": 1}],
                                "rotation": [{"time": 0, "value": 0}]},
                 "audio": {"gain": 1}, "effects": []}
                for i in range(4)
            ]
        }],
        "markers": []
    }
}


def run_refine(edl, prompt, scope=None):
    """Run monet_refine.py and return the refined EDL."""
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(edl, f)
        edl_path = f.name
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(prompt)
        prompt_path = f.name
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(edl, f)
        out_path = f.name

    args = [PYTHON, str(REFINE_SCRIPT), "--edl", edl_path, "--prompt", prompt_path, "--output", out_path]
    if scope:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(scope, f)
            scope_path = f.name
        args.extend(["--scope", scope_path])

    result = subprocess.run(args, capture_output=True, text=True, cwd=str(WORKSPACE))

    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[:200]}")
        for p in [edl_path, prompt_path, out_path]:
            try: os.unlink(p)
            except: pass
        if scope:
            try: os.unlink(scope_path)
            except: pass
        return None

    output = None
    try:
        with open(out_path) as f:
            output = json.load(f)
    except Exception as e:
        print(f"  ERROR reading output: {e}")
    finally:
        for p in [edl_path, prompt_path, out_path]:
            try: os.unlink(p)
            except: pass
        if scope:
            try: os.unlink(scope_path)
            except: pass

    return output


def assert_eq(actual, expected, msg):
    if actual == expected:
        print(f"  ✓ {msg}")
        return True
    else:
        print(f"  ✗ {msg} — got {actual}, expected {expected}")
        return False


def assert_true(cond, msg):
    if cond:
        print(f"  ✓ {msg}")
        return True
    else:
        print(f"  ✗ {msg}")
        return False


results = []


# === Scenario 1: Full timeline refinement ===
print("\n=== Scenario 1: Full timeline refinement (no scope) ===")
edl = run_refine(TEST_EDL, "add shake to clip 1")
if edl:
    clips = edl["timeline"]["tracks"][0]["clips"]
    r = assert_eq(len(clips), 4, "All 4 clips present")
    r &= all(assert_true(c["speed"] > 0, f"{c['id']} speed > 0") for c in clips)
    results.append(("Scenario 1", r))
else:
    results.append(("Scenario 1", False))


# === Scenario 2: Scoped refinement ===
print("\n=== Scenario 2: Scoped refinement ===")
edl = run_refine(TEST_EDL, "add slow-mo here", scope=["clip-2"])
if edl:
    clips = {c["id"]: c for c in edl["timeline"]["tracks"][0]["clips"]}
    r = assert_eq(clips["clip-2"]["speed"], 0.5, "clip-2 speed = 0.5")
    r &= assert_eq(clips["clip-0"]["speed"], 1, "clip-0 speed preserved = 1")
    r &= assert_eq(clips["clip-1"]["speed"], 1, "clip-1 speed preserved = 1")
    r &= assert_eq(clips["clip-3"]["speed"], 1, "clip-3 speed preserved = 1")
    results.append(("Scenario 2", r))
else:
    results.append(("Scenario 2", False))


# === Scenario 3: Manual edit preservation ===
print("\n=== Scenario 3: Manual edit preservation ===")
edl_manual = json.loads(json.dumps(TEST_EDL))
for c in edl_manual["timeline"]["tracks"][0]["clips"]:
    if c["id"] == "clip-3":
        c["speed"] = 0.5
        c["effects"] = [{"id": "user-fx", "type": "blur", "start": 0, "duration": 2.5, "params": {"amount": 0.3}}]

edl = run_refine(edl_manual, "make the ending punchier")
if edl:
    clips = {c["id"]: c for c in edl["timeline"]["tracks"][0]["clips"]}
    r = assert_eq(clips["clip-3"]["speed"], 0.5, "clip-3 speed preserved = 0.5")
    r &= assert_true(any(e["type"] == "blur" for e in clips["clip-3"].get("effects", [])), "clip-3 blur preserved")
    results.append(("Scenario 3", r))
else:
    results.append(("Scenario 3", False))


# === Scenario 4: Unsupported capability ===
print("\n=== Scenario 4: Unsupported capability request ===")
edl = run_refine(TEST_EDL, "add a text title over clip 3")
if edl:
    clips = edl["timeline"]["tracks"][0]["clips"]
    r = assert_eq(len(clips), 4, "All 4 clips present")
    r &= assert_true(all(c["speed"] == 1 for c in clips), "All speeds unchanged")
    results.append(("Scenario 4", r))
else:
    results.append(("Scenario 4", False))


# === Summary ===
print("\n" + "=" * 50)
print("SUMMARY")
print("=" * 50)
passed = sum(1 for _, r in results if r)
total = len(results)
for name, r in results:
    print(f"  {'✓' if r else '✗'} {name}")
print(f"\n{passed}/{total} scenarios passed")
sys.exit(0 if passed == total else 1)
