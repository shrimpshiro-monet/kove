#!/usr/bin/env python3
"""
E2E batch v2 — clean exports with per-analysis engine results.
Usage: python3 scripts/run_e2e_batch_v2.py [--test N]
"""

import sys, os, json, shutil, time, tempfile, subprocess, importlib
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE / "scripts"))
sys.path.insert(0, str(WORKSPACE / "scripts" / "analyzers"))

from monet_pipeline import (
    get_video_info, extract_grammar, generate_edl_from_dna,
    render_native, OUTPUT_DIR, NumpyEncoder
)

EXPORTS = WORKSPACE / "exports"
REF_DIR = WORKSPACE / "reference-edits-2"
REF2_DIR = WORKSPACE / "monet-reference-edits"
TEST_VIDEOS = WORKSPACE / "test-videos"
AUDIO_DIR = TEST_VIDEOS / "audio"

AUDIO_FILES = sorted(AUDIO_DIR.glob("*.mp3"))
FOOTAGE_FILES = [f for f in sorted(TEST_VIDEOS.glob("*.mp4")) if f.name != ".DS_Store"]

TESTS = [
    { "name": "01-creed-drag", "ref": REF_DIR / "creed.MP4", "footage": "dragrace.mp4" },
    { "name": "02-got-miles", "ref": REF_DIR / "GameOfThrones.MP4", "footage": "milesmorales.mp4.mp4" },
    { "name": "03-harvey-mike", "ref": REF_DIR / "harvey.MP4", "footage": "MikeRoss.mp4" },
    { "name": "04-lewis-gp", "ref": REF_DIR / "lewis hamilton.MP4", "footage": "2025 Italian Grand Prix Highlights.mp4" },
    { "name": "05-steph-ignite", "ref": REF_DIR / "steph curry.MP4", "footage": "Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4" },
    { "name": "06-tyler-steph", "ref": REF_DIR / "tyler_the_creator.MP4", "footage": "High Quality Steph Curry Clips for Edits! (2024-25).mp4" },
    { "name": "07-rossi-miles", "ref": REF_DIR / "valentino rossi.MP4", "footage": "milesmorales.mp4.mp4" },
    { "name": "08-nyc-curry", "ref": REF_DIR / "new york living the moment.MP4", "footage": "High Quality Steph Curry Clips for Edits! (2024-25).mp4" },
    { "name": "09-spidey-mike", "ref": REF2_DIR / "SPIDERMAN (IMPORTANT).MP4", "footage": "MikeRoss.mp4" },
    { "name": "10-2ndimp-drag", "ref": REF2_DIR / "2nd imporatnt.MP4", "footage": "dragrace.mp4" },
]


def run_analysis_engines(video_path, verbose=True):
    """Run each analysis engine individually and return a dict of results."""
    from analyzers.motion_analyzer import analyze_motion, compute_motion_stats
    from analyzers.beat_detector import detect_beats, analyze_rhythm
    from analyzers.color_analyzer import analyze_color
    from analyzers.shot_type_classifier import classify_shot_type, aggregate_shot_types
    from analyzers.effect_detector import detect_effects, aggregate_effects
    from analyzers.text_detector import detect_text, aggregate_text_results
    from analyzers.speed_ramp_detector import detect_speed_ramps, aggregate_speed_results
    from analyzers.semantic_analyzer import analyze_semantic_events, aggregate_semantic_results
    from analyzers.reference_type_classifier import classify_reference_type
    from monet_pipeline import detect_cuts

    results = {}
    info = get_video_info(video_path)
    results["video_info"] = info

    # 1. Reference type classification
    if verbose: print("  [1/10] Classifying reference type...")
    results["reference_type"] = classify_reference_type(video_path, Path(video_path).stem)

    # 2. Cut detection
    if verbose: print("  [2/10] Detecting cuts...")
    cuts = detect_cuts(video_path, threshold=0.15)
    cut_times = [0] + [c["time"] for c in cuts] + [info["duration"]]
    shots = []
    for i in range(len(cut_times) - 1):
        start = cut_times[i]; end = cut_times[i+1]; dur = end - start
        if dur >= 0.034:
            shots.append({"index": len(shots), "start": start, "end": end, "duration": dur})
    results["cuts"] = cuts
    results["shots"] = shots
    if verbose: print(f"    {len(shots)} shots from {len(cuts)} cuts")

    # 3. Motion analysis
    if verbose: print("  [3/10] Analyzing motion...")
    motion_data = analyze_motion(video_path, fps=10.0)
    motion_stats = compute_motion_stats(motion_data)
    results["motion"] = {"data": motion_data, "stats": motion_stats}
    if verbose: print(f"    avg_magnitude={motion_stats['avg_magnitude']:.3f}")

    # 4. Beat detection
    if verbose: print("  [4/10] Detecting beats...")
    beat_result = None
    if info.get("has_audio"):
        audio_tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run(["ffmpeg", "-y", "-i", video_path, "-vn",
                       "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", audio_tmp],
                      capture_output=True, timeout=60)
        if os.path.exists(audio_tmp) and os.path.getsize(audio_tmp) > 1000:
            beat_result = detect_beats(audio_tmp)
        try: os.remove(audio_tmp)
        except: pass
    else:
        if verbose: print("    no audio track, skipping beat detection")
    results["beats"] = beat_result
    if beat_result and verbose:
        print(f"    tempo={beat_result.get('tempo_bpm', '?')} BPM, {beat_result.get('beat_count', 0)} beats")

    # 5. Color analysis
    if verbose: print("  [5/10] Analyzing color...")
    color_data = analyze_color(video_path, sample_rate=2.0)
    results["color"] = color_data
    if verbose: print(f"    grade={color_data['grade']}")

    # 6. Shot type classification
    if verbose: print("  [6/10] Classifying shot types...")
    shot_type_results = classify_shot_type(video_path, shots)
    shot_type_summary = aggregate_shot_types(shot_type_results)
    for i, shot in enumerate(shots):
        if i < len(shot_type_results):
            shot["shotType"] = shot_type_results[i]["shotType"]
        else:
            shot["shotType"] = "medium"
    results["shot_types"] = {"per_shot": shot_type_results, "summary": shot_type_summary}
    if verbose: print(f"    distribution={shot_type_summary['distribution']}")

    # 7. Effect detection
    if verbose: print("  [7/10] Detecting effects...")
    effects_results = detect_effects(video_path, shots)
    effects_summary = aggregate_effects(effects_results)
    for i, shot in enumerate(shots):
        if i < len(effects_results):
            raw_fx = effects_results[i].get("effects", [])
            shot["effects"] = list(dict.fromkeys([e for e in raw_fx if e != "cut"]))[:1]
            shot["transitions"] = effects_results[i].get("transitions", [])
            shot["visualEffects"] = list(dict.fromkeys([e for e in effects_results[i].get("visualEffects", []) if e != "cut"]))[:1]
        else:
            shot["effects"] = []; shot["transitions"] = []; shot["visualEffects"] = []
    results["effects"] = {"per_shot": effects_results, "summary": effects_summary}
    if verbose: print(f"    total_effects={effects_summary['totalEffects']}")

    # 8. Text detection
    if verbose: print("  [8/10] Detecting text...")
    try:
        text_results = detect_text(video_path, shots)
        text_summary = aggregate_text_results(text_results)
        results["text"] = {"per_shot": text_results, "summary": text_summary}
        if verbose: print(f"    shots_with_text={text_summary.get('shots_with_text', 0)}/{len(shots)}")
    except Exception as e:
        results["text"] = {"error": str(e)}
        if verbose: print(f"    failed: {e}")

    # 9. Speed ramp detection
    if verbose: print("  [9/10] Detecting speed ramps...")
    try:
        speed_results = detect_speed_ramps(video_path)
        speed_summary = aggregate_speed_results(speed_results)
        results["speed"] = {"per_shot": speed_results, "summary": speed_summary}
        if verbose: print(f"    avg_speed={speed_summary.get('avgSpeed', 1.0):.2f}x")
    except Exception as e:
        results["speed"] = {"error": str(e)}
        if verbose: print(f"    failed: {e}")

    # 10. Semantic event analysis
    if verbose: print("  [10/10] Analyzing semantic events...")
    try:
        semantic_results = analyze_semantic_events(video_path, shots)
        semantic_summary = aggregate_semantic_results(semantic_results)
        results["semantic"] = {"per_shot": semantic_results, "summary": semantic_summary}
        if verbose: print(f"    events={semantic_summary.get('event_counts', {})}")
    except Exception as e:
        results["semantic"] = {"error": str(e)}
        if verbose: print(f"    failed: {e}")

    results["shots_final"] = shots
    return results


def setup_test(test_conf, index, total):
    """Create self-contained folder with symlinked/copied assets."""
    name = test_conf["name"]
    ref_src = test_conf["ref"]
    footage_name = test_conf["footage"]
    footage_src = TEST_VIDEOS / footage_name
    audio_idx = (index - 1) % len(AUDIO_FILES)
    music_src = AUDIO_FILES[audio_idx]

    test_dir = EXPORTS / name
    assets_dir = test_dir / "assets"
    analysis_dir = test_dir / "analysis"
    assets_dir.mkdir(parents=True, exist_ok=True)
    analysis_dir.mkdir(parents=True, exist_ok=True)

    # Symlink reference
    ref_ext = ref_src.suffix
    ref_dst = assets_dir / f"reference{ref_ext}"
    if not ref_dst.exists(): ref_dst.symlink_to(ref_src.resolve())

    # Symlink footage
    footage_ext = footage_src.suffix if footage_src else ".mp4"
    footage_dst = assets_dir / f"footage{footage_ext}"
    if not footage_dst.exists(): footage_dst.symlink_to(footage_src.resolve())

    # Copy music
    music_dst = assets_dir / f"music{music_src.suffix}"
    if not music_dst.exists(): shutil.copy2(str(music_src), str(music_dst))

    print(f"\n{'='*70}")
    print(f"  E2E TEST {index}/{total}: {name}")
    print(f"{'='*70}")
    print(f"  Reference: {ref_src.name}")
    print(f"  Footage:   {footage_src.name}")
    print(f"  Music:     {music_src.name}")
    print(f"  Output:    {test_dir}")

    return {
        "test_dir": test_dir,
        "ref_path": str(ref_dst),
        "footage_path": str(footage_dst),
        "music_path": str(music_dst),
        "analysis_dir": analysis_dir,
        "name": name,
    }


def run_test(test_conf, index, total):
    """Full pipeline for one test."""
    test_dir = EXPORTS / test_conf["name"]
    analysis_dir = test_dir / "analysis"
    output_name = test_conf["name"]

    # Step 1: Run all analysis engines on reference video
    print("\n  --- REFERENCE ANALYSIS ---")
    t0 = time.time()
    analysis = run_analysis_engines(test_conf["ref_path"], verbose=True)
    analysis_elapsed = time.time() - t0

    # Save each engine's output separately
    for engine_name, engine_data in analysis.items():
        safe_name = engine_name.replace(" ", "_")
        out_file = analysis_dir / f"ref-{safe_name}.json"
        with open(out_file, "w") as f:
            # Convert numpy types for JSON
            json.dump(engine_data, f, indent=1, cls=NumpyEncoder)
    print(f"  Analysis saved: {len(analysis)} engine outputs in {analysis_elapsed:.0f}s")

    # Step 2: Build DNA from the combined analysis (reuse extract_grammar)
    print("\n  --- DNA GENERATION ---")
    dna = extract_grammar(test_conf["ref_path"], output_name, verbose=False)
    dna_file = test_dir / f"{output_name}-dna.json"
    with open(dna_file, "w") as f:
        json.dump(dna, f, indent=2, cls=NumpyEncoder)
    print(f"  DNA saved: {dna_file} ({dna.get('totalShots',0)} shots, {dna.get('avgShotDuration',0):.2f}s avg)")

    # Step 3: Generate EDL from footage
    print("\n  --- EDL GENERATION ---")
    t0 = time.time()
    edl = generate_edl_from_dna(dna, test_conf["footage_path"], test_conf["music_path"],
                                style_intensity=0.5)
    edl["_dna"] = dna
    edl["_grammarRules"] = dna.get("grammarRules", {})
    edl_elapsed = time.time() - t0

    edl_file = test_dir / f"{output_name}-edl.json"
    with open(edl_file, "w") as f:
        json.dump(edl, f, indent=2, cls=NumpyEncoder)
    print(f"  EDL saved: {edl_file} ({len(edl.get('timeline',{}).get('tracks',[[]])[0].get('clips',[]))} clips) in {edl_elapsed:.0f}s")

    # Step 4: Export to OpenReel
    print("\n  --- OPENREEL EXPORT ---")
    from monet_pipeline import export_to_openreel
    openreel_file = test_dir / f"{output_name}-openreel.json"
    export_to_openreel(edl, str(openreel_file))
    print(f"  OpenReel saved: {openreel_file}")

    # Step 5: Render (effects stripped above)
    print("\n  --- RENDER ---")
    t0 = time.time()
    render_file = test_dir / f"{output_name}-render.mp4"
    # Temporarily redirect OUTPUT_DIR to test dir
    old_output = OUTPUT_DIR
    import monet_pipeline
    monet_pipeline.OUTPUT_DIR = test_dir
    try:
        success = render_native(edl, str(render_file), test_conf["music_path"])
    finally:
        monet_pipeline.OUTPUT_DIR = old_output
    render_elapsed = time.time() - t0

    # Clean output/ if created there too
    for f in OUTPUT_DIR.glob(f"{output_name}*"):
        try: f.unlink()
        except: pass

    render_size = render_file.stat().st_size if render_file.exists() else 0
    render_dur = 0.0
    if render_file.exists():
        try:
            out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                 "format=duration", "-of", "csv=p=0", str(render_file)],
                                capture_output=True, text=True, timeout=10)
            render_dur = float(out.stdout.strip())
        except: pass

    print(f"  Rendered: {render_file} ({render_size//1024} KB, {render_dur:.1f}s) in {render_elapsed:.0f}s")

    result = {
        "name": output_name,
        "status": "complete" if success else "failed",
        "reference": test_conf["ref_path"],
        "footage": test_conf["footage_path"],
        "music": test_conf["music_path"],
        "analysis_elapsed_s": round(analysis_elapsed, 1),
        "render_elapsed_s": round(render_elapsed, 1),
        "render_duration_s": round(render_dur, 1),
        "render_size_kb": render_size // 1024,
        "shots": len(analysis.get("shots", [])),
        "files": {
            "dna": str(dna_file),
            "edl": str(edl_file),
            "openreel": str(openreel_file),
            "render": str(render_file),
        }
    }
    return result


def main():
    EXPORTS.mkdir(parents=True, exist_ok=True)

    # Filter by test number if --test N given
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", type=int, help="Run only test N (1-10)")
    args = parser.parse_args()

    test_list = TESTS
    if args.test:
        test_list = [TESTS[args.test - 1]]

    results = []
    total = len(test_list)

    for i, test_conf in enumerate(test_list, 1):
        try:
            setup = setup_test(test_conf, i, total)
            result = run_test(setup, i, total)
            results.append(result)

            succ = result.get("status") == "complete"
            icon = "✓" if succ else "✗"
            dur = result.get("render_duration_s", 0)
            sz = result.get("render_size_kb", 0)
            al = result.get("analysis_elapsed_s", 0)
            re = result.get("render_elapsed_s", 0)
            print(f"\n  {icon} {result['name']}: {dur}s, {sz}KB  (analysis={al}s, render={re}s)\n")

        except Exception as e:
            import traceback
            traceback.print_exc()
            results.append({"name": test_conf["name"], "status": "failed", "error": str(e)})

    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total_tests": len(results),
        "passed": sum(1 for r in results if r.get("status") == "complete"),
        "failed": sum(1 for r in results if r.get("status") == "failed"),
        "results": results,
    }
    manifest_path = EXPORTS / "MANIFEST.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, cls=NumpyEncoder)

    print(f"\n{'='*70}")
    print(f"  BATCH SUMMARY")
    print(f"{'='*70}")
    print(f"  Total:  {manifest['total_tests']}  Passed: {manifest['passed']}  Failed: {manifest['failed']}")
    print(f"\n  Exports: file://{EXPORTS}")
    print(f"  Manifest: {manifest_path}")
    print()

    for r in results:
        icon = {"complete": "✓", "skipped": "→", "failed": "✗"}.get(r.get("status", ""), "?")
        extra = f" [{r.get('render_duration_s',0):.1f}s, {r.get('render_size_kb',0)}KB]" if r.get("status") == "complete" else f" — {r.get('error','?')}"
        print(f"  {icon} {r['name']}{extra}")

    print()


if __name__ == "__main__":
    main()
