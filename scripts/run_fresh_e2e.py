#!/usr/bin/env python3
"""Fresh E2E test — pick one ref+footage, run clean, show results."""

import json, os, subprocess, sys, tempfile, time, traceback
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "4"
os.environ["GLOG_minloglevel"] = "3"
os.environ["ABSL_MIN_LOG_LEVEL"] = "4"

WORKSPACE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE / "scripts"))
sys.path.insert(0, str(WORKSPACE / "scripts" / "analyzers"))

from monet_pipeline import get_video_info, detect_cuts, OUTPUT_DIR, NumpyEncoder

EXPORTS = WORKSPACE / "exports-fresh"
AUDIO_DIR = WORKSPACE / "test-videos" / "audio"
AUDIO_FILES = sorted(AUDIO_DIR.glob("*.mp3"))

def info(v):
    dur = v.get("duration", 0)
    w, h = v.get("width", 0), v.get("height", 0)
    fps = v.get("fps", 0)
    return f"{dur:.1f}s {w}x{h} @ {fps:.2f}fps"

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", required=True, help="Path to reference video")
    parser.add_argument("--footage", required=True, help="Path to footage video")
    parser.add_argument("--output", default="fresh-test", help="Output name")
    parser.add_argument("--music", help="Path to music file (optional)")
    args = parser.parse_args()

    ref_path = Path(args.ref)
    footage_path = Path(args.footage)
    name = args.output
    out_dir = EXPORTS / name
    out_dir.mkdir(parents=True, exist_ok=True)

    music_path = Path(args.music) if args.music and Path(args.music).exists() else None
    if not music_path and AUDIO_FILES:
        music_path = AUDIO_FILES[0]
        print(f"  Music: {music_path.name} (auto-selected)")

    print(f"\n{'='*70}")
    print(f"  FRESH E2E TEST: {name}")
    print(f"{'='*70}")
    print(f"  Reference: {ref_path.name}")
    print(f"  Footage:   {footage_path.name}")
    if music_path: print(f"  Music:     {music_path.name}")
    print(f"  Output:    {out_dir}\n")

    # 1. Analyze reference
    print("  --- REFERENCE ANALYSIS ---")
    t0 = time.time()
    ref_info = get_video_info(str(ref_path))
    print(f"  Info: {info(ref_info)}")

    cuts = detect_cuts(str(ref_path), threshold=0.15)
    cut_times = [0] + [c["time"] for c in cuts] + [ref_info["duration"]]
    shots = []
    for i in range(len(cut_times) - 1):
        s, e = cut_times[i], cut_times[i+1]
        d = e - s
        if d >= 0.034:
            shots.append({"index": len(shots), "start": s, "end": e, "duration": d})

    from analyzers.motion_analyzer import analyze_motion, compute_motion_stats
    motion = analyze_motion(str(ref_path), fps=10.0)
    motion_stats = compute_motion_stats(motion)

    beat_result = None
    if ref_info.get("has_audio"):
        audio_tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run(["ffmpeg", "-y", "-i", str(ref_path), "-vn",
                       "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", audio_tmp],
                      capture_output=True, timeout=60)
        if os.path.exists(audio_tmp) and os.path.getsize(audio_tmp) > 1000:
            from analyzers.beat_detector import detect_beats, analyze_rhythm
            beat_result = detect_beats(audio_tmp)
        try: os.remove(audio_tmp)
        except: pass

    from analyzers.color_analyzer import analyze_color
    color = analyze_color(str(ref_path), sample_rate=2.0)

    from analyzers.shot_type_classifier import classify_shot_type, aggregate_shot_types
    shot_types = classify_shot_type(str(ref_path), shots)
    st_summary = aggregate_shot_types(shot_types)

    from analyzers.effect_detector import detect_effects, aggregate_effects
    effects = detect_effects(str(ref_path), shots)
    fx_summary = aggregate_effects(effects)

    # Classify reference type (heuristic only, no LLM vision)
    from analyzers.reference_type_classifier import classify_heuristic
    ref_type = classify_heuristic(str(ref_path), ref_path.stem)

    elapsed = time.time() - t0
    print(f"  Analysis complete in {elapsed:.0f}s")

    # 2. Print clean summary
    print(f"\n  --- ANALYSIS RESULTS ---")
    print(f"  Type:         {ref_type['type']} (conf={ref_type['confidence']:.2f})")
    print(f"  Duration:     {ref_info['duration']:.1f}s")
    print(f"  Resolution:   {ref_info['width']}x{ref_info['height']}")
    print(f"  FPS:          {ref_info.get('fps', 0):.2f}")
    print(f"  Cuts:         {len(cuts)}")
    print(f"  Shots:        {len(shots)}")
    print(f"  Avg shot:     {sum(s['duration'] for s in shots)/max(len(shots),1):.2f}s")
    if beat_result:
        print(f"  BPM:          {beat_result.get('tempo_bpm', '?'):.0f}")
        print(f"  Beats:        {beat_result.get('beat_count', 0)}")
    print(f"  Color grade:  {color.get('grade', '?')}")
    print(f"  Motion avg:   {motion_stats['avg_magnitude']:.3f}")
    dist = st_summary.get('distribution', {})
    print(f"  Shots:        {', '.join(f'{k}={v}' for k,v in sorted(dist.items()) if v > 0)}")
    print(f"  Effects:      {fx_summary.get('totalEffects', 0)} total")
    print(f"  Motion peak:  {motion_stats.get('max_magnitude', 0):.3f}")

    # 3. Generate EDL from footage using reference DNA
    print(f"\n  --- EDL GENERATION ---")
    from monet_pipeline import extract_grammar, generate_edl_from_dna
    dna = extract_grammar(str(ref_path), name, verbose=False)
    dna_file = out_dir / f"{name}-dna.json"
    with open(dna_file, "w") as f:
        json.dump(dna, f, indent=2, cls=NumpyEncoder)
    print(f"  DNA: {dna.get('totalShots',0)} shots, {dna.get('avgShotDuration',0):.2f}s avg")

    t0 = time.time()
    edl = generate_edl_from_dna(dna, str(footage_path), str(music_path) if music_path else None,
                                style_intensity=0.5)
    edl["_dna"] = dna
    edl["_grammarRules"] = dna.get("grammarRules", {})
    edl_elapsed = time.time() - t0
    clip_count = len(edl.get("timeline", {}).get("tracks", [[]])[0].get("clips", []))
    print(f"  EDL: {clip_count} clips generated in {edl_elapsed:.0f}s")

    edl_file = out_dir / f"{name}-edl.json"
    with open(edl_file, "w") as f:
        json.dump(edl, f, indent=2, cls=NumpyEncoder)

    # 4. Render
    print(f"\n  --- RENDER ---")
    t0 = time.time()
    render_file = out_dir / f"{name}-render.mp4"
    from monet_pipeline import render_native
    old_output = OUTPUT_DIR
    import monet_pipeline as mp
    mp.OUTPUT_DIR = out_dir
    try:
        success = render_native(edl, str(render_file), str(music_path) if music_path else None)
    finally:
        mp.OUTPUT_DIR = old_output

    for f in Path(out_dir).iterdir():
        try: f.unlink()
        except: pass

    render_elapsed = time.time() - t0
    render_size = render_file.stat().st_size if render_file.exists() else 0
    render_dur = 0.0
    if render_file.exists():
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                             "format=duration", "-of", "csv=p=0", str(render_file)],
                            capture_output=True, text=True, timeout=10)
        try: render_dur = float(out.stdout.strip())
        except: pass

    print(f"\n  --- RESULT ---")
    status = "✓" if success else "✗"
    print(f"  {status} {name}")
    print(f"  Render: {render_dur:.1f}s, {render_size//1024} KB")
    print(f"  Output: {render_file}")
    print(f"  DNA:    {dna_file}")
    print(f"  EDL:    {edl_file}")
    print()

    # 5. Create analysis visualization
    print(f"  --- ANALYSIS VIDEO ---")
    viz_file = out_dir / f"{name}-analysis-viz.mp4"
    _make_analysis_viz(shots, cuts, beat_result, color, ref_info, motion_stats, str(ref_path), str(viz_file))

    print(f"\n  Done. Files in: {out_dir}")
    print(f"  Render:       file://{render_file}")
    print(f"  Analysis viz: file://{viz_file}")
    print()

def _make_analysis_viz(shots, cuts, beats, color, info, motion_stats, src, out):
    """Overlay analysis stats on reference video with drawtext."""
    filters = []
    y = 30
    lines = [
        f"SHOTS: {len(shots)} | CUTS: {len(cuts)}",
        f"COLOR: {color.get('grade', '?')}",
        f"MOTION: {motion_stats['avg_magnitude']:.2f}",
        f"DUR: {info['duration']:.1f}s | {info['width']}x{info['height']}",
    ]
    if beats:
        lines.insert(2, f"BPM: {beats.get('tempo_bpm', 0):.0f} | BEATS: {beats.get('beat_count', 0)}")

    for line in lines:
        filters.append(
            f"drawtext=text='{line}':fontcolor=white:fontsize=24:"
            f"box=1:boxcolor=black@0.5:boxborderw=4:x=20:y={y}"
        )
        y += 36

    # Show cuts as vertical lines
    for i, c in enumerate(cuts[:20]):
        t = c["time"]
        if t <= 0: continue
        frac = t / info["duration"]
        x = f"iw*{frac:.3f}"
        filters.append(
            f"drawtext=text='|':fontcolor=red@0.7:fontsize=28:"
            f"x={x}:y=0"
        )

    filter_str = ",".join(filters) if filters else "null"
    cmd = [
        "ffmpeg", "-y", "-i", src,
        "-vf", filter_str,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-an", out,
    ]
    subprocess.run(cmd, capture_output=True, timeout=120)
    print(f"  Analysis viz: {Path(out).stat().st_size // 1024} KB")

if __name__ == "__main__":
    main()
