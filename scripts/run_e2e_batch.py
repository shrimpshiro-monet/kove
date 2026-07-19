#!/usr/bin/env python3
"""
Run 10 E2E export tests, each self-contained in exports/test-NN-name/.
Usage: python3 scripts/run_e2e_batch.py
"""

import sys, os, json, shutil, subprocess, tempfile, time
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE / "scripts"))

from monet_pipeline import run_pipeline

EXPORTS_DIR = WORKSPACE / "exports"
REF_DIR = WORKSPACE / "reference-edits-2"
REF2_DIR = WORKSPACE / "monet-reference-edits"
FIXTURES_DIR = WORKSPACE / "tests" / "fixtures"
WORKER_FIXTURES = WORKSPACE / "workers" / "render-worker" / "fixtures"

MUSIC_FILE = FIXTURES_DIR / "fixture-c" / "music.mp3"

TESTS = [
    {
        "name": "01-creed-action",
        "reference": str(REF_DIR / "creed.MP4"),
        "footage": str(FIXTURES_DIR / "fixture-c" / "footage.mp4"),
        "music": str(MUSIC_FILE),
    },
    {
        "name": "02-got-epic",
        "reference": str(REF_DIR / "GameOfThrones.MP4"),
        "footage": str(FIXTURES_DIR / "fixture-c" / "footage.mp4"),
        "music": str(MUSIC_FILE),
    },
    {
        "name": "03-harvey-drama",
        "reference": str(REF_DIR / "harvey.MP4"),
        "footage": str(FIXTURES_DIR / "youtube_talking_head" / "footage.mp4"),
        "music": None,  # generated
    },
    {
        "name": "04-lewis-sport",
        "reference": str(REF_DIR / "lewis hamilton.MP4"),
        "footage": str(FIXTURES_DIR / "fixture-c" / "footage.mp4"),
        "music": str(MUSIC_FILE),
    },
    {
        "name": "05-steph-sport",
        "reference": str(REF_DIR / "steph curry.MP4"),
        "footage": str(FIXTURES_DIR / "youtube_talking_head" / "footage.mp4"),
        "music": None,
    },
    {
        "name": "06-tyler-creative",
        "reference": str(REF_DIR / "tyler_the_creator.MP4"),
        "footage": str(FIXTURES_DIR / "fixture-c" / "footage.mp4"),
        "music": str(MUSIC_FILE),
    },
    {
        "name": "07-rossi-moto",
        "reference": str(REF_DIR / "valentino rossi.MP4"),
        "footage": str(FIXTURES_DIR / "youtube_talking_head" / "footage.mp4"),
        "music": None,
    },
    {
        "name": "08-nyc-living",
        "reference": str(REF_DIR / "new york living the moment.MP4"),
        "footage": str(FIXTURES_DIR / "fixture-c" / "footage.mp4"),
        "music": None,
    },
    {
        "name": "09-spiderman",
        "reference": str(REF2_DIR / "SPIDERMAN (IMPORTANT).MP4"),
        "footage": str(FIXTURES_DIR / "youtube_talking_head" / "footage.mp4"),
        "music": str(MUSIC_FILE),
    },
    {
        "name": "10-second-imp",
        "reference": str(REF2_DIR / "2nd imporatnt.MP4"),
        "footage": str(WORKER_FIXTURES / "test_clip.mp4"),
        "music": None,
    },
]

def generate_music(output_path: str, bpm: int = 120, duration: float = 15.0, style: str = "beat"):
    """Generate a simple synthetic music track with ffmpeg."""
    if style == "beat":
        # Simple synth bass drum on quarter notes
        beat_interval = 60.0 / bpm
        n_beats = int(duration / beat_interval)
        # Use sine wave tone bursts (simple kick pattern)
        filter_parts = []
        for i in range(min(n_beats, 32)):
            t = i * beat_interval
            filter_parts.append(
                f"aeval='sin(2*PI*60*t)*exp(-5*(t-{t}))|sin(2*PI*60*t)*exp(-5*(t-{t}))'"
                f"[k{i}]"
            )
        mix_inputs = "".join(f"[k{i}]" for i in range(min(n_beats, 32)))
        filter_complex = ";".join(filter_parts[:3])  # limit to 3 layers
        filter_complex += f";{mix_inputs}amix=inputs={min(3, min(n_beats, 32))}:duration=first[a]"

        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-t", str(duration),
            "-i", "anullsrc=r=44100:cl=mono",
            "-filter_complex",
            f"aeval='sin(2*PI*60*t)*gt(t,0)*lt(t,0.1) + sin(2*PI*120*t)*gt(t,{beat_interval})*lt(t,{beat_interval+0.1})|sin(2*PI*60*t)*gt(t,0)*lt(t,0.1) + sin(2*PI*120*t)*gt(t,{beat_interval})*lt(t,{beat_interval+0.1})'",
            "-ac", "2",
            "-b:a", "192k",
            str(output_path),
        ]
    else:
        # Simple pad tone
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-t", str(duration),
            "-i", "sine=frequency=220:duration={}:r=44100".format(duration),
            "-ac", "2",
            "-b:a", "192k",
            str(output_path),
        ]

    subprocess.run(cmd, capture_output=True, timeout=30)
    return os.path.exists(output_path) and os.path.getsize(output_path) > 100


def setup_test_folder(test: dict) -> dict:
    """Create a self-contained test folder with symlinks to assets."""
    name = test["name"]
    test_dir = EXPORTS_DIR / name
    assets_dir = test_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Symlink reference
    ref_src = Path(test["reference"])
    ref_dst = assets_dir / f"reference{ref_src.suffix}"
    if not ref_dst.exists():
        ref_dst.symlink_to(ref_src.resolve())

    # Symlink footage
    footage_src = Path(test["footage"])
    footage_dst = assets_dir / f"footage{footage_src.suffix}"
    if not footage_dst.exists():
        footage_dst.symlink_to(footage_src.resolve())

    # Copy or generate music
    music_path = None
    if test["music"]:
        music_src = Path(test["music"])
        music_dst = assets_dir / f"music{music_src.suffix}"
        if not music_dst.exists():
            shutil.copy2(str(music_src), str(music_dst))
        music_path = str(music_dst)
    else:
        # Generate a unique music track signature for this test
        hash_val = abs(hash(name)) % 1000
        bpm = 100 + (hash_val % 80)  # 100-180 BPM
        music_dst = assets_dir / "music.mp3"
        if not music_dst.exists() or music_dst.stat().st_size < 100:
            print(f"    Generating music: {bpm} BPM")
            generate_music(str(music_dst), bpm=bpm, duration=15.0)
        music_path = str(music_dst)

    return {
        "test_dir": str(test_dir),
        "ref_path": str(ref_dst),
        "footage_path": str(footage_dst),
        "music_path": music_path,
        "output_name": name,
    }


def run_test(test_config: dict, index: int, total: int):
    """Run pipeline for one test and save all outputs into test folder."""
    name = test_config["name"]
    print(f"\n{'='*70}")
    print(f"  E2E TEST {index}/{total}: {name}")
    print(f"{'='*70}")
    print(f"  Reference: {test_config['reference']}")
    print(f"  Footage:   {test_config['footage']}")
    print(f"  Music:     {test_config.get('music', '(generated)')}")

    setup = setup_test_folder(test_config)
    output_dir = Path(setup["test_dir"])

    # Run pipeline (skip render if output already exists)
    render_path = output_dir / f"{name}-render.mp4"
    dna_path = output_dir / f"{name}-dna.json"
    edl_path = output_dir / f"{name}-edl.json"

    if render_path.exists() and render_path.stat().st_size > 1000:
        print(f"  SKIP: {name} already rendered")
        return {
            "name": name,
            "status": "skipped",
            "render": str(render_path),
            "size": render_path.stat().st_size,
        }

    # Temporarily redirect output/ to our test dir by patching OUTPUT_DIR
    import monet_pipeline
    orig_output = monet_pipeline.OUTPUT_DIR

    # Instead of patching, tell run_pipeline the output_name and move files after
    start = time.time()
    try:
        result = run_pipeline(
            reference_path=setup["ref_path"],
            reference_name=name,
            footage_path=setup["footage_path"],
            music_path=setup["music_path"],
            output_name=name,
        )
        elapsed = time.time() - start
    except Exception as e:
        elapsed = time.time() - start
        print(f"  FAILED: {e}")
        return {
            "name": name,
            "status": "failed",
            "error": str(e),
            "elapsed": round(elapsed, 1),
        }

    # Move output/ files into test folder
    for ext in ["dna.json", "edl.json", "openreel.json", "render.mp4"]:
        src = WORKSPACE / "output" / f"{name}-{ext}"
        if src.exists():
            dst = output_dir / f"{name}-{ext}"
            shutil.move(str(src), str(dst))

    render_path = output_dir / f"{name}-render.mp4"
    render_size = render_path.stat().st_size if render_path.exists() else 0

    print(f"  COMPLETE in {elapsed:.0f}s: {render_path} ({render_size//1024} KB)")

    return {
        "name": name,
        "status": "complete",
        "elapsed": round(elapsed, 1),
        "render": str(render_path),
        "size": render_size,
        "dna": str(output_dir / f"{name}-dna.json"),
        "edl": str(output_dir / f"{name}-edl.json"),
    }


def main():
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (WORKSPACE / "output").mkdir(parents=True, exist_ok=True)

    results = []
    total = len(TESTS)

    for i, test in enumerate(TESTS, 1):
        try:
            result = run_test(test, i, total)
            results.append(result)
        except Exception as e:
            results.append({"name": test["name"], "status": "failed", "error": str(e)})

    # Write manifest
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total": len(results),
        "passed": sum(1 for r in results if r.get("status") == "complete"),
        "skipped": sum(1 for r in results if r.get("status") == "skipped"),
        "failed": sum(1 for r in results if r.get("status") == "failed"),
        "results": results,
    }
    manifest_path = EXPORTS_DIR / "MANIFEST.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n{'='*70}")
    print(f"  BATCH SUMMARY")
    print(f"{'='*70}")
    print(f"  Total:   {manifest['total']}")
    print(f"  Passed:  {manifest['passed']}")
    print(f"  Skipped: {manifest['skipped']}")
    print(f"  Failed:  {manifest['failed']}")
    print(f"\n  Exports:  file://{EXPORTS_DIR}")
    print(f"  Manifest: {manifest_path}")
    print()

    for r in results:
        status_icon = {"complete": "✓", "skipped": "→", "failed": "✗"}.get(r.get("status", ""), "?")
        size_info = f" ({r['size']//1024} KB)" if r.get("size") else ""
        elapsed_info = f" [{r['elapsed']}s]" if r.get("elapsed") else ""
        error_info = f" — {r['error']}" if r.get("error") else ""
        print(f"  {status_icon} {r['name']}{elapsed_info}{size_info}{error_info}")

    print()


if __name__ == "__main__":
    main()
