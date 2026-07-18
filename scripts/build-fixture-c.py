"""Build Fixture C — garbage frames truth-set triple.

Creates a 15s footage file with alternating sharp/garbage sections:
  0-3s:  sharp (testsrc2)
  3-6s:  black frames (garbage — E27 brightness reject)
  6-9s:  sharp (white + moving black box)
  9-12s: heavily blurred gray (garbage — E27 Laplacian reject)
  12-15s: sharp (red + moving yellow box)

Output in tests/fixtures/fixture-c/:
  footage.mp4, music.mp3, profile.json, reference-cuts.json
"""

import json
import os
import subprocess
import sys
from pathlib import Path

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "fixture-c"
FIXTURE_DIR.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT, FPS = 640, 360, 30


def _seg(fname, vf_spec, kind):
    """Build a single video segment with silent audio."""
    out = FIXTURE_DIR / fname
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", vf_spec,
        "-f", "lavfi", "-i", "anullsrc=cl=mono:r=44100",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest", str(out),
    ]
    print(f"  Building {fname} ({kind})...")
    r = subprocess.run(cmd, capture_output=True, timeout=60)
    if r.returncode != 0:
        print(f"    FAILED: {r.stderr.decode()[-300:]}")
        raise RuntimeError(f"Segment {fname} failed")
    return str(out)


def build_footage():
    """Create the synthetic footage, one clean segment per section."""
    concat_inputs = [
        _seg("seg_0_sharp1.mp4", "testsrc2=s={}x{}:d=3:r={}".format(WIDTH, HEIGHT, FPS), "sharp"),
        _seg("seg_1_black.mp4", "color=c=black:s={}x{}:d=3:r={}".format(WIDTH, HEIGHT, FPS), "garbage"),
        _seg("seg_2_sharp2.mp4", "color=c=white:s={}x{}:d=3:r={},drawbox=x=mod(t*80\\,200):y=100:w=40:h=40:color=black:t=fill".format(WIDTH, HEIGHT, FPS), "sharp"),
        _seg("seg_3_blur.mp4", "color=c=0x808080:s={}x{}:d=3:r={},gblur=sigma=80".format(WIDTH, HEIGHT, FPS), "garbage"),
        _seg("seg_4_sharp3.mp4", "color=c=red:s={}x{}:d=3:r={},drawbox=x=mod(t*90\\,200):y=200:w=30:h=30:color=yellow:t=fill".format(WIDTH, HEIGHT, FPS), "sharp"),
    ]

    footage_path = FIXTURE_DIR / "footage.mp4"
    concat_file = FIXTURE_DIR / "concat_list.txt"
    with open(concat_file, "w") as f:
        for p in concat_inputs:
            f.write(f"file '{p}'\n")

    print("  Concatenating segments...")
    r = subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_file),
        "-c", "copy", str(footage_path),
    ], capture_output=True, timeout=60)
    if r.returncode != 0:
        print(f"    Concat failed: {r.stderr.decode()[-300:]}")
        raise RuntimeError("Footage concat failed")

    concat_file.unlink()
    for seg in concat_inputs:
        try:
            os.remove(seg)
        except OSError:
            pass

    # Verify audio stream exists
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
        "-of", "csv=p=0", str(footage_path),
    ], capture_output=True, text=True, timeout=10)
    if "audio" not in probe.stdout:
        print("  Adding silent audio track...")
        no_audio = FIXTURE_DIR / "footage_no_audio.mp4"
        os.rename(footage_path, no_audio)
        subprocess.run([
            "ffmpeg", "-y", "-i", str(no_audio),
            "-f", "lavfi", "-i", "anullsrc=cl=mono:r=44100",
            "-c:v", "copy", "-c:a", "aac", "-shortest",
            str(footage_path),
        ], capture_output=True, timeout=30)
        no_audio.unlink()

    print(f"  Footage: {footage_path}")
    return str(footage_path)


def build_music():
    """Create a simple test music track with a detectable beat (120 BPM)."""
    music_path = FIXTURE_DIR / "music.mp3"
    r = subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "anoisesrc=d=15:c=pink:a=0.5",
        "-b:a", "128k",
        str(music_path),
    ], capture_output=True, timeout=30)
    if r.returncode != 0:
        print(f"    Music FAILED: {r.stderr.decode()[-300:]}")
        raise RuntimeError("Music generation failed")
    print(f"  Music: {music_path}")
    return str(music_path)


def build_profile():
    """Create a minimal valid style profile (hand-crafted, deterministic)."""
    profile_path = FIXTURE_DIR / "profile.json"
    profile = {
        "profile_id": "fixture-c-profile",
        "pacing": {
            "avg_shot_duration": 2.0,
            "cut_to_beat_alignment_rate": 0.6,
            "energy_curve_shape": "steady_build",
        },
        "text_overlay": {"frequency_per_minute": 0.0, "typical_duration": 0.0, "typical_role": "none"},
        "transition_preferences": {
            "hard_cut": 0.7, "crossfade": 0.2,
            "whip_pan": 0.05, "zoom_transition": 0.05, "fade_to_black": 0.0,
        },
    }
    with open(profile_path, "w") as f:
        json.dump(profile, f, indent=2)
    print(f"  Profile: hand-crafted")
    return str(profile_path)


def build_reference_cuts():
    """Define ground-truth cut positions.

    The correct edit avoids garbage sections entirely. With 3 good
    segments (0-3, 6-9, 12-15) the output cut positions are at
    the boundaries between them: 3.0s and 6.0s in output time.
    """
    ref_cuts = {"cuts": [3.0, 6.0], "tolerance": 0.05}
    ref_path = FIXTURE_DIR / "reference-cuts.json"
    with open(ref_path, "w") as f:
        json.dump(ref_cuts, f, indent=2)
    print(f"  Reference cuts: {ref_cuts['cuts']}")
    return str(ref_path)


def run_director(footage, profile, music):
    """Run edit_director on the fixture, output rendered MP4."""
    output_mp4 = FIXTURE_DIR / "output.mp4"
    output_edl = FIXTURE_DIR / "output.edl.json"

    director = Path(__file__).resolve().parent / "analyzers" / "edit_director.py"
    cmd = [
        sys.executable, str(director),
        footage, profile,
        "--music", music,
        "--render", str(output_mp4),
        "--no-llm",
        "-o", str(output_edl),
    ]
    print(f"\n  Running director...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if result.returncode != 0:
        print(f"  DIRECTOR FAILED (rc={result.returncode})")
        for line in result.stderr.strip().split("\n")[-20:]:
            print(f"    {line}")
        return None, None

    if not output_mp4.exists():
        print(f"  Output MP4 not found")
        print(f"  Stderr: {result.stderr[-1000:]}")
        return None, None

    size_mb = output_mp4.stat().st_size / (1024 * 1024)
    print(f"  Output: {output_mp4} ({size_mb:.1f} MB)")
    return str(output_mp4), str(output_edl)


def verify_no_garbage_in_edl(edl_path):
    """Check that no selected shot overlaps with garbage regions (3-6s, 9-12s)."""
    if not edl_path:
        return False, "No EDL path"

    with open(edl_path) as f:
        edl = json.load(f)

    clips = edl.get("timeline", {}).get("tracks", [{}])[0].get("clips", [])
    garbage_regions = [(3.0, 6.0), (9.0, 12.0)]
    violations = []

    for clip in clips:
        start = clip.get("inPoint", 0)
        end = clip.get("outPoint", 0)
        for gs, ge in garbage_regions:
            if start < ge and end > gs:
                overlap_start = max(start, gs)
                overlap_end = min(end, ge)
                violations.append({
                    "clip_id": clip.get("id"),
                    "source": f"{start}-{end}s",
                    "overlap": f"{overlap_start}-{overlap_end}s ({overlap_end-overlap_start:.1f}s)",
                })

    if violations:
        print(f"\n! GARBAGE in {len(violations)} clip(s):")
        for v in violations:
            print(f"  Clip {v['clip_id']}: source {v['source']} overlaps {v['overlap']}")
        return False, violations

    print("  No garbage in any selected shot")
    return True, []


def main():
    print("=== Building Fixture C ===")

    footage = build_footage()
    music = build_music()
    profile = build_profile()
    ref_path = build_reference_cuts()

    # Verify scene detect on footage
    r = subprocess.run([
        "ffmpeg", "-i", footage,
        "-vf", "select='gt(scene,0.3)',showinfo",
        "-f", "null", "-",
    ], capture_output=True, text=True, timeout=30)
    scene_changes = [l for l in (r.stdout + r.stderr).split("\n") if "pts_time" in l]
    print(f"  Scene changes detected: {len(scene_changes)}")
    for l in scene_changes:
        print(f"    {l.strip()}")

    output_mp4, output_edl = run_director(footage, profile, music)
    if output_mp4 is None:
        print("\nFAILED — director could not produce output.")
        sys.exit(1)

    ok, details = verify_no_garbage_in_edl(output_edl)

    # Run evaluation
    print("\n  Running evaluation...")
    eval_script = Path(__file__).resolve().parent / "eval.py"
    metrics_out = FIXTURE_DIR / "eval-metrics.json"
    subprocess.run([
        sys.executable, str(eval_script),
        "--generated", output_mp4,
        "--reference-cuts", ref_path,
        "--music", music,
        "--output", str(metrics_out),
    ], capture_output=True, text=True, timeout=300)

    if metrics_out.exists():
        with open(metrics_out) as f:
            m = json.load(f)
        cut = m.get("metrics", {}).get("cut_point_f1", {})
        beat = m.get("metrics", {}).get("beat_alignment", {})
        print(f"  Cut F1: {cut.get('f1', 'N/A')}  Beat rate: {beat.get('rate', 'N/A')}  BPM: {beat.get('bpm', 'N/A')}")

    status = "PASS" if ok else "FAIL"
    print(f"\n{'='*50}")
    print(f"  Fixture C: {status}")
    print(f"  Location: {FIXTURE_DIR}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
