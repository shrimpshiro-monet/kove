# Every Pipeline Ever Built — Full Code + Reactions

A complete archive of every pipeline implementation, organized chronologically. Each section includes the full source code, what it did, and how it actually performed.

---

# Table of Contents

1. [Pipeline 1: `reference-dna.py`](#pipeline-1-reference-dnapy) — DNA extraction from reference
2. [Pipeline 2: `universal-vibe-editor.py`](#pipeline-2-universal-vibe-editorpy) — First attempt at mapping reference to footage
3. [Pipeline 3: `replicate-steph-exact.py`](#pipeline-3-replicate-steph-exactpy) — 1:1 shot-for-shot replication
4. [Pipeline 4: `steph-curry-monet-render.py`](#pipeline-4-steph-curry-monet-renderpy) — MonetEDL with Editly
5. [Pipeline 5: `steph-xfade-render.py`](#pipeline-5-steph-xfade-renderpy) — FFmpeg xfade transitions
6. [Pipeline 6: `grammar_extractor.py`](#pipeline-6-grammar-extractordpy) — Full 9-stage analyzer
7. [Pipeline 7: `monet_pipeline.py`](#pipeline-7-monet_pipelinepy) — The real pipeline (35 analyzers)
8. [Pipeline 8: `e2e-pipeline.py`](#pipeline-8-e2e-pipelinepy) — Vision-first lightweight pipeline
9. [Pipeline 9: `run_fresh_e2e.py`](#pipeline-9-run_fresh_e2epy) — Clean test runner
10. [Pipeline 10: `apply_style.py`](#pipeline-10-apply_stylepy) — ReferenceStyleProfile bridge
11. [Pipeline 11: `monet_refine.py`](#pipeline-11-monet_refinepy) — Iterative refinement
12. [Analyzers](#analyzers) — The 35 analysis modules
13. [Reactions Timeline](#reactions-timeline) — Every reaction, chronologically

---

# Pipeline 1: `reference-dna.py`
**What it did:** Extracted editing DNA from a reference video — cut detection, motion, beats, color, shot types, effects, text, speed ramps, semantic analysis.

**What happened:** First time seeing a reference analyzed properly. The DNA structure worked. But extracting grammar is useless without a way to APPLY it.

**Reaction:** *"Analysis intelligence is real. The creative intelligence (what to DO with that understanding) is missing entirely."*

```python
#!/usr/bin/env python3
"""
Reference DNA Extractor
Analyzes a reference video and extracts its complete editing grammar (DNA).
"""

import json
import subprocess
import sys
import os
import tempfile
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
sys.path.insert(0, str(WORKSPACE / "scripts"))
sys.path.insert(0, str(WORKSPACE / "scripts" / "analyzers"))

from motion_analyzer import analyze_motion, compute_motion_stats
from beat_detector import detect_beats
from color_analyzer import analyze_color
from shot_type_classifier import classify_shot_type, aggregate_shot_types
from effect_detector import detect_effects, aggregate_effects
from text_detector import detect_text, aggregate_text_results
from speed_ramp_detector import detect_speed_ramps, aggregate_speed_results
from semantic_analyzer import analyze_semantic_events, aggregate_semantic_results


def get_video_info(path):
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    fmt = data.get("format", {})
    video = next((s for s in data.get("streams", []) if s["codec_type"] == "video"), None)
    audio = next((s for s in data.get("streams", []) if s["codec_type"] == "audio"), None)
    return {
        "duration": float(fmt.get("duration", 0)),
        "width": video.get("width", 0) if video else 0,
        "height": video.get("height", 0) if video else 0,
        "fps": eval(video.get("r_frame_rate", "30/1")) if video else 30,
        "has_audio": audio is not None,
    }


def detect_cuts(video_path, threshold=0.15):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-y", "-i", video_path,
         "-vf", f"select='gt(scene,{threshold})',showinfo",
         "-vsync", "vfr", "-f", "null", "-"],
        capture_output=True, text=True, timeout=120
    )
    import re
    cuts = []
    for line in result.stderr.split("\n"):
        if "showinfo" in line and "pts_time" in line:
            pts = re.search(r'pts_time:(\S+)', line)
            score = re.search(r'lavfi\.scene_score=(\S+)', line)
            if pts:
                cuts.append({"time": float(pts.group(1)), "score": float(score.group(1)) if score else 0})
    return cuts


def extract_dna(video_path, name):
    info = get_video_info(video_path)
    print(f"Video: {info['width']}x{info['height']}, {info['duration']:.2f}s")

    # Cuts
    cuts = detect_cuts(video_path)
    cut_times = [0] + [c["time"] for c in cuts] + [info["duration"]]
    shots = []
    for i in range(len(cut_times) - 1):
        s, e = cut_times[i], cut_times[i+1]
        if e - s >= 0.034:
            shots.append({"index": len(shots), "start": s, "end": e, "duration": e - s})

    # Motion
    motion = analyze_motion(video_path, fps=10.0)
    motion_stats = compute_motion_stats(motion)

    # Beats
    beat_result = None
    if info["has_audio"]:
        audio_tmp = tempfile.mktemp(suffix=".wav")
        subprocess.run(["ffmpeg", "-y", "-i", video_path, "-vn",
                       "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1", audio_tmp],
                      capture_output=True, timeout=60)
        if os.path.exists(audio_tmp):
            beat_result = detect_beats(audio_tmp)
            os.remove(audio_tmp)

    # Color
    color = analyze_color(video_path, sample_rate=2.0)

    # Shot types
    shot_types = classify_shot_type(video_path, shots)
    st_summary = aggregate_shot_types(shot_types)

    # Effects
    effects = detect_effects(video_path, shots)
    fx_summary = aggregate_effects(effects)

    # Text
    text_results = detect_text(video_path, shots)
    text_summary = aggregate_text_results(text_results)

    # Speed
    speed_results = detect_speed_ramps(video_path, shots)
    speed_summary = aggregate_speed_results(speed_results)

    # Semantic
    semantic_results = analyze_semantic_events(video_path, shots, name)
    semantic_summary = aggregate_semantic_results(semantic_results)

    # Build DNA
    dna = {
        "name": name,
        "source": video_path,
        "duration": info["duration"],
        "resolution": {"width": info["width"], "height": info["height"]},
        "fps": info["fps"],
        "totalShots": len(shots),
        "avgShotDuration": sum(s["duration"] for s in shots) / max(len(shots), 1),
        "cutRate": len(shots) / max(info["duration"], 1),
        "shots": [],
        "motionStats": motion_stats,
        "colorProfile": color,
        "shotTypes": st_summary,
        "effects": fx_summary,
        "text": text_summary,
        "speed": speed_summary,
        "semanticEvents": semantic_summary,
        "audioAnalysis": beat_result or {},
    }

    # Enrich shots
    for i, shot in enumerate(shots):
        shot_motion = [m for m in motion if shot["start"] <= m["time"] <= shot["end"]]
        if shot_motion:
            shot_stats = compute_motion_stats(shot_motion)
            shot["motion_magnitude"] = shot_stats["avg_magnitude"]
        else:
            shot["motion_magnitude"] = 0
        shot["energy"] = shot["motion_magnitude"]
        shot["shotType"] = shot_types[i]["shotType"] if i < len(shot_types) else "medium"
        shot["effects"] = effects[i].get("effects", []) if i < len(effects) else []
        shot["hasText"] = text_results[i].get("hasText", False) if i < len(text_results) else False
        shot["avgSpeed"] = speed_results[i].get("avgSpeed", 1.0) if i < len(speed_results) else 1.0
        shot["semanticEvent"] = semantic_results[i] if i < len(semantic_results) else {}
        dna["shots"].append(shot)

    return dna


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python reference-dna.py <video_path> <name>")
        sys.exit(1)

    dna = extract_dna(sys.argv[1], sys.argv[2])

    out_dir = WORKSPACE / "src" / "server" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"ref-dna-{sys.argv[2]}.json"

    with open(out_path, "w") as f:
        json.dump(dna, f, indent=2)

    print(f"\nDNA saved: {out_path}")
    print(f"  Shots: {dna['totalShots']}")
    print(f"  Avg duration: {dna['avgShotDuration']:.3f}s")
    print(f"  Cut rate: {dna['cutRate']:.2f}/s")
```

---

# Pipeline 2: `universal-vibe-editor.py`
**What it did:** Mapped reference DNA timing to new footage. Each reference shot's timing was scaled proportionally to the footage duration, then extracted with FFmpeg + color grading.

**What happened:** It just sliced the footage evenly according to reference timing. No content awareness. The "color grading" was a keyword match from the DNA. Output was choppy and generic.

**Reaction:** *"It just chops the video. It doesn't EDIT. A real editor picks 3-5 key moments, builds tension, times cuts to music."*

```python
#!/usr/bin/env python3
"""
Universal Vibe Editor — Complete Pipeline
1. Extract reference DNA (precise cuts, colors, effects)
2. Map DNA to new footage
3. Render with FFmpeg (xfade transitions, per-shot effects, color grading)
"""

import json
import subprocess
import os
import sys
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
OUTPUT_DIR = WORKSPACE / "output"

def run_cmd(cmd, timeout=60):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return result.returncode == 0
    except:
        return False

def get_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def extract_segment(src, start, dur, output, grade="normal", effects=None):
    vf = ["scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2"]

    if grade == "bw":
        vf.append("hue=s=0")
        vf.append("eq=contrast=1.2:brightness=-0.05")
    elif grade == "desaturated":
        vf.append("eq=saturation=0.3:contrast=1.1:brightness=-0.1")
    elif grade == "dark":
        vf.append("eq=brightness=-0.2:contrast=1.15:saturation=0.6")
    elif grade == "bright":
        vf.append("eq=brightness=0.05:contrast=1.05")
    elif grade == "vibrant":
        vf.append("eq=saturation=1.5:contrast=1.2:brightness=0.03")
    else:
        vf.append("eq=saturation=0.7:contrast=1.05:brightness=-0.05")

    if effects:
        for effect in effects:
            if effect == "vignette":
                vf.append("vignette=PI/4")
            elif effect == "blur":
                vf.append("boxblur=8:8")
            elif effect == "flash":
                vf.append("eq=brightness=0.4")
            elif effect == "motionBlur":
                vf.append("tblend=all_mode=average")
            elif effect == "shake":
                vf.append("crop=w=in_w-10:h=in_h-10:x=5:y=5")

    filter_str = ",".join(vf)
    cmd = [
        "ffmpeg", "-y", "-ss", str(start), "-i", src, "-t", str(dur),
        "-vf", filter_str, "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-r", "30", "-an", output
    ]
    return run_cmd(cmd, timeout=30)

def build_universal_shots(reference_dna, footage_path, footage_duration):
    ref_shots = reference_dna["shots"]
    ref_duration = reference_dna["duration"]
    scale = footage_duration / ref_duration

    avg_sat = reference_dna.get("colorProfile", {}).get("avgSaturation", 50)
    if avg_sat < 20:
        base_grade = "bw"
    elif avg_sat < 40:
        base_grade = "desaturated"
    elif avg_sat < 60:
        base_grade = "dark"
    else:
        base_grade = "normal"

    shots = []
    for ref_shot in ref_shots:
        src_start = ref_shot["start"] * scale
        src_start = min(src_start, footage_duration - ref_shot["duration"])
        src_start = max(0, src_start)

        grade = ref_shot.get("grade", base_grade)
        if grade == "normal":
            grade = base_grade

        effects = []
        if ref_shot.get("transition_in") == "fadeBlack":
            effects.append("flash")

        shots.append({
            "srcStart": src_start,
            "duration": ref_shot["duration"],
            "grade": grade,
            "effects": effects,
            "transition": ref_shot.get("transition_in", "cut"),
        })

    return shots

def render_with_effects(shots, footage_path, music_path=None, output_path=None):
    tmpdir = tempfile.mkdtemp(prefix="vibe-render-")
    try:
        segment_files = []
        for i, shot in enumerate(shots):
            seg_file = os.path.join(tmpdir, f"seg_{i:03d}.mp4")
            success = extract_segment(footage_path, shot["srcStart"], shot["duration"],
                                     seg_file, shot["grade"], shot["effects"])
            if success:
                segment_files.append(seg_file)

        if not segment_files:
            return False

        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for seg in segment_files:
                f.write(f"file '{seg}'\n")

        concat_output = os.path.join(tmpdir, "concat.mp4")
        cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file,
               "-c", "copy", concat_output]
        if not run_cmd(cmd, timeout=60):
            return False

        if music_path and os.path.exists(music_path):
            music_output = os.path.join(tmpdir, "with_music.mp4")
            cmd = ["ffmpeg", "-y", "-i", concat_output, "-i", music_path,
                   "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                   "-shortest", "-map", "0:v:0", "-map", "1:a:0", music_output]
            if run_cmd(cmd, timeout=60):
                concat_output = music_output

        if output_path:
            shutil.copy2(concat_output, output_path)
        return True
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

def main():
    dna_path = WORKSPACE / "src" / "server" / "data" / "ref-dna-steph-curry.json"
    with open(dna_path) as f:
        ref_dna = json.load(f)

    footage_path = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
    music_path = WORKSPACE / "testfiles" / "Outfit (with 21 Savage).mp3"

    footage_duration = get_duration(str(footage_path))
    shots = build_universal_shots(ref_dna, str(footage_path), footage_duration)

    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / "steph-curry-universal.mp4"

    success = render_with_effects(shots, str(footage_path),
                                  str(music_path) if music_path.exists() else None,
                                  str(output_path))
    if success:
        duration = get_duration(str(output_path))
        size = output_path.stat().st_size / 1024 / 1024
        print(f"Output: {output_path} ({duration:.2f}s, {size:.1f}MB)")

if __name__ == "__main__":
    main()
```

---

# Pipeline 3: `replicate-steph-exact.py`
**What it did:** Hardcoded 27 shots from a frame-by-frame analysis of the Steph Curry reference. Each shot had: ref_start, ref_duration, shot_type, grade, notes. Mapped 1:1 to raw footage.

**What happened:** The timing was actually correct — the shots matched the reference structure. But "mapping" meant just taking the same time offsets from a different source video. No content awareness at all. Flash frames were 0.034s black boxes. Title cards were white rectangles (drawtext not available).

**Reaction:** First time seeing structure actually match. But the content was wrong — it was pulling random footage moments instead of the matching basketball moments.

```python
#!/usr/bin/env python3
"""
Steph Curry Reference Edit — 1:1 Replication
Maps the exact shot structure from the reference edit onto raw footage.
"""

import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
RAW_FOOTAGE = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
REFERENCE = WORKSPACE / "reference-edits-2" / "steph curry.MP4"
OUTPUT_DIR = WORKSPACE / "output"
TMPDIR = Path(tempfile.mkdtemp(prefix="steph-replicate-"))

REFERENCE_SHOTS = [
    (0.0,  4.8,  "broadcast",  "normal",    "Long continuous broadcast shot"),
    (4.8,  1.3,  "broadcast",  "normal",    "Different broadcast angle"),
    (6.1,  0.03, "flash",      "normal",    "Single-frame Curry screaming flash cut"),
    (6.13, 0.7,  "broadcast",  "normal",    "Wide broadcast action"),
    (6.83, 0.6,  "closeup",    "normal",    "Curry celebration close-up"),
    (7.43, 0.03, "flash",      "blur",      "Single-frame blur/flash transition"),
    (7.46, 0.03, "titlecard",  "bw",        "B&W title card"),
    (7.49, 0.9,  "portrait",   "bw",        "B&W portrait with bio text"),
    (8.39, 1.4,  "textcard",   "dark",      "IM NOT YOUR AVERAGE text card"),
    (9.79, 0.03, "flash",      "blur",      "Motion blur transition"),
    (9.82, 0.2,  "flash",      "bw",        "B&W flash callback"),
    (10.02, 0.6, "reaction",   "desaturated", "Disbelief reaction"),
    (10.62, 0.4, "action",     "dark",      "Bent over on court"),
    (11.02, 0.4, "celebration","dark",      "Night night celebration"),
    (11.42, 0.2, "transition", "wipe",      "Wipe transition"),
    (11.62, 0.5, "action",     "bw",        "Curry clapping B&W"),
    (12.12, 0.9, "stats",      "bw",        "Stats overlay"),
    (13.02, 0.8, "closeup",    "bw",        "Night night close-up"),
    (13.82, 0.03, "flash",     "normal",    "Flash callback"),
    (13.85, 0.6, "climax",     "color",     "COLOR screaming - emotional peak"),
    (14.45, 0.8, "closeup",    "bw",        "Night night close-up continued"),
    (15.25, 0.03, "textcard",  "desaturated", "Text card single frame"),
    (15.28, 0.4, "action",     "desaturated", "Dribbling action"),
    (15.68, 0.9, "celebration","desaturated", "Celebration climax"),
    (16.58, 0.5, "tag",        "black",     "AZRO tag first appearance"),
    (17.08, 0.5, "black",      "black",     "Black pause"),
    (17.58, 0.6, "tag",        "black",     "AZRO tag reappears"),
]

def get_video_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def extract_segment(src, start, duration, output, width=576, height=576, grade="normal"):
    if duration < 1/30:
        duration = 1/30

    vf_parts = [f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"]

    if grade == "bw":
        vf_parts.append("hue=s=0")
        vf_parts.append("eq=contrast=1.3:brightness=-0.05")
    elif grade == "dark":
        vf_parts.append("eq=brightness=-0.2:contrast=1.2:saturation=0.7")
    elif grade == "desaturated":
        vf_parts.append("eq=saturation=0.4:contrast=1.1")
    elif grade == "color":
        vf_parts.append("eq=saturation=1.5:contrast=1.3:brightness=0.05")
    elif grade == "blur":
        vf_parts.append("boxblur=10:10")
    elif grade == "wipe":
        vf_parts.append("eq=brightness=-0.1:saturation=0.3")

    vf = ",".join(vf_parts)
    cmd = ["ffmpeg", "-y", "-ss", str(start), "-i", src, "-t", str(duration),
           "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-an", output]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def create_black_frame(output, duration, width=576, height=576):
    dur = max(duration, 1/30)
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d={dur}",
           "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-t", str(duration), output]
    subprocess.run(cmd, capture_output=True, check=True)

def create_text_frame(output, text, duration, width=576, height=576, fontsize=48, color="white", bg="black"):
    dur = max(duration, 1/30)
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={bg}:s={width}x{height}:d={dur}",
           "-vf", f"drawbox=x={width//4}:y={height//2-20}:w={width//2}:h=40:color=white:t=fill",
           "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-t", str(duration), output]
    subprocess.run(cmd, capture_output=True, check=True)

def render_edit():
    raw_duration = get_video_duration(str(RAW_FOOTAGE))
    ref_duration = get_video_duration(str(REFERENCE))

    segment_files = []
    for i, (ref_start, ref_dur, shot_type, grade, notes) in enumerate(REFERENCE_SHOTS):
        raw_start = min(ref_start, raw_duration - ref_dur)
        raw_start = max(0, raw_start)
        segment_file = str(TMPDIR / f"shot_{i:03d}.mp4")

        if shot_type == "black":
            create_black_frame(segment_file, ref_dur)
        elif shot_type in ("titlecard", "textcard", "tag"):
            create_text_frame(segment_file, "TEXT", ref_dur)
        else:
            success = extract_segment(str(RAW_FOOTAGE), raw_start, ref_dur, segment_file, grade=grade)
            if not success:
                create_black_frame(segment_file, ref_dur)

        segment_files.append(segment_file)

    concat_file = str(TMPDIR / "concat.txt")
    with open(concat_file, "w") as f:
        for seg in segment_files:
            f.write(f"file '{seg}'\n")

    concat_output = str(TMPDIR / "concat.mp4")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file,
                    "-c", "copy", concat_output], capture_output=True, check=True)

    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / "steph-curry-replica.mp4"
    shutil.copy2(concat_output, str(output_path))
    print(f"Output: {output_path}")

if __name__ == "__main__":
    try:
        render_edit()
    finally:
        shutil.rmtree(TMPDIR, ignore_errors=True)
```

---

# Pipeline 4: `steph-curry-monet-render.py`
**What it did:** Built a proper MonetEDL JSON with 27 clips, each with effects (bw_toggle, desaturate, impact_flash, vignette_pro, color_grade, blur, motion_blur), transitions (flash, whip-pan), and tried to render via Editly.

**What happened:** Editly didn't work (local fork issues). Fell back to FFmpeg concat. The EDL structure was correct but the render was just basic FFmpeg segments concatenated. Effects were keyword-mapped to FFmpeg filters.

**Reaction:** *"The EDL is right but the render is wrong. We need actual effects, not FFmpeg filters pretending to be effects."*

```python
#!/usr/bin/env python3
"""
Steph Curry 1:1 Edit — Using Monet's Editly Pipeline
Generates a proper MonetEDL and renders via Editly with real effects.
"""

import json
import os
import subprocess
import sys
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
RAW_FOOTAGE = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
REFERENCE = WORKSPACE / "reference-edits-2" / "steph curry.MP4"
OUTPUT_DIR = WORKSPACE / "output"
EDITLY_DIR = WORKSPACE / "editly"

def get_video_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def build_monet_edl():
    footage_id = "steph-curry-raw"
    shots = [
        (0.0,   4.8,   0.0,   "normal",    [], "cut"),
        (4.8,   1.3,   4.8,   "normal",    [], "cut"),
        (6.1,   0.034, 6.1,   "normal",    ["impact_flash"], "cut"),
        (6.134, 0.7,   6.134, "normal",    [], "cut"),
        (6.834, 0.6,   6.834, "normal",    ["vignette_pro"], "cut"),
        (7.434, 0.034, 7.434, "normal",    ["blur"], "flash"),
        (7.468, 0.034, 7.468, "normal",    ["bw_toggle"], "cut"),
        (7.502, 0.9,   7.502, "normal",    ["bw_toggle", "vignette_pro"], "cut"),
        (8.402, 1.4,   8.402, "normal",    ["desaturate", "vignette_pro"], "cut"),
        (9.802, 0.034, 9.802, "normal",    ["blur"], "flash"),
        (9.836, 0.2,   9.836, "normal",    ["bw_toggle"], "cut"),
        (10.036, 0.6,  10.036, "normal",   ["desaturate"], "cut"),
        (10.636, 0.4,  10.636, "normal",   ["desaturate", "vignette_pro"], "cut"),
        (11.036, 0.4,  11.036, "normal",   ["desaturate", "vignette_pro"], "cut"),
        (11.436, 0.2,  11.436, "normal",   ["motion_blur"], "whip-pan"),
        (11.636, 0.5,  11.636, "normal",   ["bw_toggle"], "cut"),
        (12.136, 0.9,  12.136, "normal",   ["bw_toggle", "vignette_pro"], "cut"),
        (13.036, 0.8,  13.036, "normal",   ["bw_toggle", "vignette_pro"], "cut"),
        (13.836, 0.034, 13.836, "normal",  ["impact_flash"], "cut"),
        (13.87,  0.6,  13.87,  "normal",   ["color_grade"], "cut"),
        (14.47,  0.8,  14.47,  "normal",   ["bw_toggle", "vignette_pro"], "cut"),
        (15.27,  0.034, 15.27, "normal",   ["desaturate"], "cut"),
        (15.304, 0.4,  15.304, "normal",   ["desaturate"], "cut"),
        (15.704, 0.9,  15.704, "normal",   ["desaturate", "vignette_pro"], "cut"),
        (16.604, 0.5,  16.604, "normal",   [], "cut"),
        (17.104, 0.5,  17.104, "normal",   [], "cut"),
        (17.604, 0.6,  17.604, "normal",   [], "cut"),
    ]

    clips = []
    for i, (tl_start, dur, src_start, grade, effects, transition) in enumerate(shots):
        clip = {
            "id": f"clip-{i:03d}",
            "mediaId": footage_id,
            "startTime": tl_start,
            "duration": dur,
            "inPoint": src_start,
            "outPoint": src_start + dur,
            "speed": 1.0,
            "effects": [],
        }
        for effect_type in effects:
            effect = {"id": f"effect-{i:03d}-{effect_type}", "type": effect_type,
                      "start": 0, "duration": dur, "params": {}}
            if effect_type == "bw_toggle":
                effect["params"] = {"enabled": True}
            elif effect_type == "desaturate":
                effect["params"] = {"amount": 0.7}
            elif effect_type == "impact_flash":
                effect["params"] = {"intensity": 0.8, "duration": 0.1}
            elif effect_type == "vignette_pro":
                effect["params"] = {"intensity": 0.6}
            elif effect_type == "color_grade":
                effect["params"] = {"saturation": 1.5, "contrast": 1.3}
            elif effect_type == "blur":
                effect["params"] = {"intensity": 0.5}
            elif effect_type == "motion_blur":
                effect["params"] = {"intensity": 0.3}
            clip["effects"].append(effect)
        if i > 0 and transition != "cut":
            clip["transition"] = {"type": transition, "duration": 0.1}
        clips.append(clip)

    total_duration = max(c["startTime"] + c["duration"] for c in clips)
    return {
        "version": 1, "id": f"edl-steph-{int(__import__('time').time())}",
        "meta": {"aspectRatio": "1:1", "fps": 30, "sampleRate": 48000},
        "assets": {"media": {footage_id: {"id": footage_id, "path": str(RAW_FOOTAGE),
                   "duration": get_video_duration(str(RAW_FOOTAGE)), "width": 1280, "height": 720}}},
        "timeline": {"duration": total_duration, "tracks": [{"id": "video-main", "type": "video", "clips": clips}]},
    }

def render_with_editly(edl, output_path):
    tmpdir = tempfile.mkdtemp(prefix="editly-render-")
    edl_path = os.path.join(tmpdir, "edl.json")
    with open(edl_path, "w") as f:
        json.dump(edl, f, indent=2)

    editly_cli = EDITLY_DIR / "cli.js"
    if not editly_cli.exists():
        editly_cli = EDITLY_DIR / "index.js"

    if EDITLY_DIR.exists():
        cmd = ["node", str(editly_cli), "--edl", edl_path, "--output", output_path]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode == 0:
                return True
            print(f"Editly error: {result.stderr[:500]}")
        except Exception as e:
            print(f"Editly failed: {e}")

    return render_with_ffmpeg(edl, output_path, tmpdir)

def render_with_ffmpeg(edl, output_path, tmpdir):
    clips = edl["timeline"]["tracks"][0]["clips"]
    segment_files = []
    for i, clip in enumerate(clips):
        media_path = edl["assets"]["media"][clip["mediaId"]]["path"]
        segment_file = os.path.join(tmpdir, f"segment_{i:03d}.mp4")
        vf_parts = ["scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2"]
        for effect in clip.get("effects", []):
            t = effect["type"]
            p = effect.get("params", {})
            if t == "bw_toggle": vf_parts.append("hue=s=0"); vf_parts.append("eq=contrast=1.2")
            elif t == "desaturate": vf_parts.append(f"eq=saturation={1-p.get('amount',0.7)}")
            elif t == "impact_flash": vf_parts.append(f"eq=brightness={p.get('intensity',0.8)*0.3}")
            elif t == "vignette_pro": vf_parts.append(f"vignette=PI/{4-p.get('intensity',0.6)*2}")
            elif t == "color_grade": vf_parts.append(f"eq=saturation={p.get('saturation',1.5)}:contrast={p.get('contrast',1.3)}")
            elif t == "blur": vf_parts.append(f"boxblur={int(p.get('intensity',0.5)*20)}:{int(p.get('intensity',0.5)*20)}")
            elif t == "motion_blur": vf_parts.append("tblend=all_mode=average")
        vf = ",".join(vf_parts)
        cmd = ["ffmpeg", "-y", "-ss", str(clip["inPoint"]), "-i", media_path,
               "-t", str(clip["duration"]), "-vf", vf, "-c:v", "libx264",
               "-preset", "fast", "-crf", "18", "-an", segment_file]
        try:
            subprocess.run(cmd, capture_output=True, check=True)
            segment_files.append(segment_file)
        except: continue

    concat_file = os.path.join(tmpdir, "concat.txt")
    with open(concat_file, "w") as f:
        for seg in segment_files: f.write(f"file '{seg}'\n")
    concat_output = os.path.join(tmpdir, "concat.mp4")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file,
                    "-c", "copy", concat_output], capture_output=True, check=True)
    shutil.copy2(concat_output, output_path)
    return True

def main():
    edl = build_monet_edl()
    OUTPUT_DIR.mkdir(exist_ok=True)
    edl_path = OUTPUT_DIR / "steph-curry-edl.json"
    with open(edl_path, "w") as f: json.dump(edl, f, indent=2)
    output_path = OUTPUT_DIR / "steph-curry-monet-render.mp4"
    render_with_editly(edl, str(output_path))

if __name__ == "__main__":
    main()
```

---

# Pipeline 5: `steph-xfade-render.py`
**What it did:** Same shot list but tried FFmpeg's native xfade transitions (fade, fadeblack, wipeleft) instead of hard cuts. Added music overlay.

**What happened:** xfade with 27 segments was a nightmare. FFmpeg filter chains with 26 sequential xfade operations either timed out or produced garbage. Fell back to simple concat anyway. The transitions that did work were barely visible.

**Reaction:** *"The transitions dont work. FFmpeg xfade is not the answer for this kind of editing."*

```python
#!/usr/bin/env python3
"""
Steph Curry 1:1 Edit — FFmpeg xfade Renderer
Uses FFmpeg's native xfade transitions instead of gl-transitions.
"""

import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
RAW_FOOTAGE = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
MUSIC = WORKSPACE / "testfiles" / "Outfit (with 21 Savage).mp3"
OUTPUT_DIR = WORKSPACE / "output"

def get_video_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def extract_segment(src, start, duration, output, grade="normal"):
    vf_parts = ["scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2"]
    if grade == "bw": vf_parts.append("hue=s=0"); vf_parts.append("eq=contrast=1.3:brightness=-0.02")
    elif grade == "desaturated": vf_parts.append("eq=saturation=0.35:contrast=1.1")
    elif grade == "dark": vf_parts.append("eq=brightness=-0.15:contrast=1.2:saturation=0.7")
    elif grade == "vignette": vf_parts.append("vignette=PI/4")
    elif grade == "flash": vf_parts.append("eq=brightness=0.4")
    elif grade == "blur": vf_parts.append("boxblur=8:8")
    elif grade == "motionBlur": vf_parts.append("tblend=all_mode=average")
    elif grade == "vibrant": vf_parts.append("eq=saturation=1.8:contrast=1.3:brightness=0.05")
    vf = ",".join(vf_parts)
    cmd = ["ffmpeg", "-y", "-ss", str(start), "-i", src, "-t", str(duration),
           "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30", "-an", output]
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=60)
        return True
    except: return False

def build_shot_list():
    return [
        (0.0,   4.8,   0.0,   "normal",    "none", 0),
        (4.8,   1.3,   4.8,   "normal",    "fade", 0.05),
        (6.1,   0.034, 6.1,   "flash",     "none", 0),
        (6.134, 0.7,   6.134, "normal",    "fade", 0.03),
        (6.834, 0.6,   6.834, "vignette",  "fade", 0.03),
        (7.434, 0.034, 7.434, "blur",      "fadeBlack", 0.05),
        (7.468, 0.034, 7.468, "bw",        "none", 0),
        (7.502, 0.9,   7.502, "bw",        "fade", 0.05),
        (8.402, 1.4,   8.402, "desaturated","fade", 0.05),
        (9.802, 0.034, 9.802, "blur",      "fadeBlack", 0.05),
        (9.836, 0.2,   9.836, "bw",        "none", 0),
        (10.036, 0.6,  10.036, "desaturated","fade", 0.03),
        (10.636, 0.4,  10.636, "dark",      "fade", 0.03),
        (11.036, 0.4,  11.036, "dark",      "fade", 0.03),
        (11.436, 0.2,  11.436, "motionBlur", "wipeleft", 0.05),
        (11.636, 0.5,  11.636, "bw",        "fade", 0.03),
        (12.136, 0.9,  12.136, "bw",        "fade", 0.05),
        (13.036, 0.8,  13.036, "bw",        "fade", 0.05),
        (13.836, 0.034, 13.836, "flash",    "none", 0),
        (13.87,  0.6,  13.87,  "vibrant",   "fade", 0.03),
        (14.47,  0.8,  14.47,  "bw",        "fade", 0.05),
        (15.27,  0.034, 15.27, "desaturated","none", 0),
        (15.304, 0.4,  15.304, "desaturated","fade", 0.03),
        (15.704, 0.9,  15.704, "dark",      "fade", 0.05),
        (16.604, 0.5,  16.604, "normal",    "fade", 0.1),
        (17.104, 0.5,  17.104, "normal",    "none", 0),
        (17.604, 0.6,  17.604, "normal",    "fade", 0.1),
    ]

def render_with_xfade(shots, tmpdir):
    segment_files = []
    for i, (tl_start, dur, src_start, grade, trans_type, trans_dur) in enumerate(shots):
        seg_file = os.path.join(tmpdir, f"seg_{i:03d}.mp4")
        success = extract_segment(str(RAW_FOOTAGE), src_start, dur, seg_file, grade)
        if success:
            segment_files.append((seg_file, dur, trans_type, trans_dur))

    if not segment_files:
        return None

    # Build xfade filter chain
    inputs = []
    filter_parts = []
    for seg_file, _, _, _ in segment_files:
        inputs.extend(["-i", seg_file])

    prev_label = "[0:v]"
    cumulative_offset = 0
    n = len(segment_files)

    for i in range(1, n):
        seg_dur = segment_files[i-1][1]
        trans_type = segment_files[i][2]
        trans_dur = segment_files[i][3]

        if trans_dur <= 0 or trans_type == "none":
            cumulative_offset += seg_dur
            prev_label = f"[{i}:v]"
            continue

        xfade_transition = "fade"
        if trans_type == "fadeBlack": xfade_transition = "fadeblack"
        elif trans_type == "wipeleft": xfade_transition = "wipeleft"

        offset = cumulative_offset + seg_dur - trans_dur
        out_label = f"[xf{i}]"
        filter_parts.append(
            f"{prev_label}[{i}:v]xfade=transition={xfade_transition}:duration={trans_dur}:offset={offset:.3f}{out_label}"
        )
        prev_label = out_label
        cumulative_offset += seg_dur - trans_dur

    output_file = os.path.join(tmpdir, "output.mp4")
    cmd = ["ffmpeg", "-y"] + inputs

    if filter_parts:
        filter_complex = ";".join(filter_parts)
        cmd.extend(["-filter_complex", filter_complex, "-map", prev_label])
    else:
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for seg_file, _, _, _ in segment_files: f.write(f"file '{seg_file}'\n")
        cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", output_file]

    cmd.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-r", "30", output_file])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    if result.returncode != 0:
        # Fallback to simple concat
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for seg_file, _, _, _ in segment_files: f.write(f"file '{seg_file}'\n")
        cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", output_file]
        subprocess.run(cmd, capture_output=True, check=True, timeout=120)

    return output_file

def add_music(video_path, output_path):
    cmd = ["ffmpeg", "-y", "-i", video_path, "-i", str(MUSIC),
           "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
           "-shortest", "-map", "0:v:0", "-map", "1:a:0", output_path]
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=120)
        return True
    except: return False

def main():
    shots = build_shot_list()
    tmpdir = tempfile.mkdtemp(prefix="steph-xfade-")
    try:
        video_only = render_with_xfade(shots, tmpdir)
        if not video_only: return
        OUTPUT_DIR.mkdir(exist_ok=True)
        output_path = OUTPUT_DIR / "steph-curry-xfade.mp4"
        add_music(video_only, str(output_path))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

if __name__ == "__main__":
    main()
```

---

# Pipeline 6: `grammar_extractor.py`
**What it did:** Full 9-stage analyzer orchestrator. Ran ALL specialized analyzers (motion, beats, color, shot types, effects, text, speed ramps, semantic) and combined results into a single DNA JSON.

**What happened:** The analysis was genuinely good. Motion detection, beat tracking, color grading classification, shot type detection — all worked. But it was READ-ONLY. It could describe a video perfectly but couldn't do anything with that knowledge.

**Reaction:** *"The analysis layer is solid. Creative intelligence layer doesn't exist."*

(Full code in `scripts/grammar_extractor.py` — 400+ lines, see file)

---

# Pipeline 7: `monet_pipeline.py`
**What it did:** THE REAL PIPELINE. 35 analyzers, DNA/grammar system, EDL generation with narrative arc, beat snapping, 3-layer CRT protection, OpenReel export, Docker + FFmpeg rendering with per-clip effects, color grading (LUT + curves + wheels).

**What happened:** This is the one that actually works. The analysis is comprehensive. The EDL generation picks content-aware moments. The render applies per-clip effects. But it's complex and sometimes the LLM semantic analysis hallucinates.

**Reaction:** First successful render that actually looked like editing. Not perfect, but STRUCTURALLY correct.

(Full code in `scripts/monet_pipeline.py` — 1434 lines, see file)

---

# Pipeline 8: `e2e-pipeline.py`
**What it did:** Lightweight vision-first pipeline. Sent reference + footage mosaics to Cloudflare Workers AI in ONE call. AI analyzed both and returned an edit plan.

**What happened:** The AI hallucinated the content (described "hiking, biking, kayaking" for a basketball video). JSON parsing failed because the response was wrapped in markdown fences. Even if it worked, segment selection was time-based, not content-aware.

**Reaction:** *"it is heavily, heavily underedited -- almost as if IT DONT GIVE A FUCK"*

```python
#!/usr/bin/env python3
"""
COMPLETE E2E PIPELINE — Vision-Aware Video Editor
Uses Cloudflare Workers AI (@cf/meta/llama-3.2-11b-vision-instruct) for vision.
"""

import base64
import json
import os
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

PYTHON_AI = "http://localhost:8102"
CLOUDFLARE_AI_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct"

DEV_VARS = {}
dev_vars_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".dev.vars")
if os.path.exists(dev_vars_path):
    with open(dev_vars_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                DEV_VARS[k.strip()] = v.strip().strip('"').strip("'")

CLOUDFLARE_API_TOKEN = DEV_VARS.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = DEV_VARS.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_AI_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{CLOUDFLARE_AI_MODEL}"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "validation-output", "e2e-pipeline")
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

def post_python_ai(endpoint, data):
    req = urllib.request.Request(f"{PYTHON_AI}{endpoint}", data=json.dumps(data).encode(),
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())

def call_cloudflare_vision(images_b64, prompt):
    payload = json.dumps({
        "prompt": prompt,
        "image": images_b64[0] if len(images_b64) == 1 else images_b64,
        "max_tokens": 2000,
    }).encode()
    req = urllib.request.Request(CLOUDFLARE_AI_URL, data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"})
    with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
        result = json.loads(resp.read())
    if not result.get("success"):
        raise Exception(f"Cloudflare AI error: {result}")
    return result["result"]["response"]

def load_image_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def extract_video_frames(video_path, fps, output_dir, max_frames=None):
    os.makedirs(output_dir, exist_ok=True)
    cmd = ["ffmpeg", "-i", video_path, "-vf", f"fps={fps}", "-q:v", "2", "-y"]
    if max_frames: cmd.extend(["-frames:v", str(max_frames)])
    cmd.append(os.path.join(output_dir, "frame_%04d.jpg"))
    subprocess.run(cmd, capture_output=True, check=True)
    return sorted(Path(output_dir).glob("frame_*.jpg"))

def detect_cuts(frame_dir, fps):
    return post_python_ai("/detect-cuts", {"frameDir": frame_dir, "fps": fps})

def create_mosaic(frame_dir, fps, cols=6):
    return post_python_ai("/create-mosaic", {"frameDir": frame_dir, "fps": fps, "cols": cols})

def resize_image(path, max_size_kb=600):
    from PIL import Image
    img = Image.open(path)
    while os.path.getsize(path) > max_size_kb * 1024:
        img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
        img.save(path, quality=70)
    return path

def run_pipeline(reference_path, footage_path, output_name="edit"):
    run_dir = os.path.join(OUTPUT_DIR, output_name)
    os.makedirs(run_dir, exist_ok=True)

    # Step 1: Extract frames
    ref_frames_dir = os.path.join(run_dir, "ref-frames")
    foot_frames_dir = os.path.join(run_dir, "foot-frames")
    ref_frames = extract_video_frames(reference_path, 3, ref_frames_dir)
    foot_frames = extract_video_frames(footage_path, 3, foot_frames_dir)

    # Get durations
    probe_ref = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", reference_path],
                               capture_output=True, text=True, check=True)
    probe_foot = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", footage_path],
                                capture_output=True, text=True, check=True)
    ref_dur = float(json.loads(probe_ref.stdout)["format"]["duration"])
    foot_dur = float(json.loads(probe_foot.stdout)["format"]["duration"])

    # Step 2: Detect cuts
    ref_cuts = detect_cuts(ref_frames_dir, 3)
    foot_cuts = detect_cuts(foot_frames_dir, 3)
    ref_shots = ref_cuts["data"]["shots"]
    foot_shots = foot_cuts["data"]["shots"]

    # Step 3: Create mosaics
    ref_mosaic = create_mosaic(ref_frames_dir, 3, cols=6)
    foot_mosaic = create_mosaic(foot_frames_dir, 3, cols=8)
    resize_image(ref_mosaic["data"]["path"], 500)
    resize_image(foot_mosaic["data"]["path"], 500)

    # Step 4: Vision AI
    ref_b64 = load_image_b64(ref_mosaic["data"]["path"])
    foot_b64 = load_image_b64(foot_mosaic["data"]["path"])

    vision_prompt = f"""You are an expert video editor. You are given two contact sheets:

IMAGE 1 (REFERENCE): A reference video the user wants to match the editing style of.
- Duration: {ref_dur:.1f}s
- {len(ref_shots)} cuts detected

IMAGE 2 (FOOTAGE): The user's raw footage they want edited.
- Duration: {foot_dur:.1f}s
- {len(foot_shots)} shots detected

Analyze both images and return a JSON object with this exact structure:
{{
  "reference_analysis": {{
    "editing_style": "one-line description",
    "pacing": "fast/medium/slow with details",
    "cuts_per_minute": {len(ref_shots) / (ref_dur / 60):.0f},
    "color_mood": "warm/cool/desaturated/high-contrast/etc",
    "transitions": "what transitions are used",
    "text_overlays": "any text visible on screen",
    "camera_work": "camera movement patterns",
    "energy_curve": "how energy changes through the video"
  }},
  "footage_analysis": {{
    "content": "what is in the video",
    "best_moments": ["list 5-8 best moments"],
    "color_profile": "current color look",
    "camera_work": "camera movement patterns",
    "suitable_for": "what kind of edit this footage works for"
  }},
  "edit_plan": {{
    "shot_selection": "which moments to use and in what order",
    "cut_timing": "how to time the cuts",
    "speed_adjustments": "where to speed up or slow down",
    "color_grade": "what color changes to match reference",
    "transitions_to_use": "what transitions between shots",
    "text_to_add": "any text overlays"
  }}
}}

Return ONLY valid JSON. No markdown, no explanation."""

    vision_response = call_cloudflare_vision([ref_b64, foot_b64], vision_prompt)

    # Parse
    import re
    json_match = re.search(r'\{[\s\S]*\}', vision_response)
    if json_match:
        analysis = json.loads(json_match.group())
    else:
        analysis = {"raw_response": vision_response}

    with open(os.path.join(run_dir, "vision-analysis.json"), "w") as f:
        json.dump(analysis, f, indent=2)

    # Step 5: Compile edit plan
    target_cuts_per_min = len(ref_shots) / (ref_dur / 60)
    target_total_cuts = min(int(target_cuts_per_min * min(ref_dur, 30) / 60), 50)
    segments = []
    foot_step = foot_dur / max(target_total_cuts, 1)
    for i in range(target_total_cuts):
        start = i * foot_step
        dur = min(foot_step, foot_dur - start)
        if dur <= 0: break
        segments.append({"start": start, "duration": dur})

    # Step 6: Render
    temp_dir = os.path.join(run_dir, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    seg_files = []
    for i, seg in enumerate(segments):
        seg_file = os.path.join(temp_dir, f"seg_{i:03d}.mp4")
        cmd = ["ffmpeg", "-y", "-ss", str(seg["start"]), "-i", footage_path,
               "-t", str(seg["duration"]), "-c:v", "libx264", "-preset", "fast", "-an", seg_file]
        if subprocess.run(cmd, capture_output=True).returncode == 0:
            seg_files.append(seg_file)

    concat_list = os.path.join(temp_dir, "concat.txt")
    with open(concat_list, "w") as f:
        for sf in seg_files: f.write(f"file '{sf}'\n")
    concat_file = os.path.join(temp_dir, "concat.mp4")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", concat_file],
                   capture_output=True)

    # Step 7: Color grade
    color_filter = "eq=contrast=1.15:saturation=0.7"
    if "edit_plan" in analysis and "color_grade" in analysis["edit_plan"]:
        color_text = analysis["edit_plan"]["color_grade"].lower()
        if "desaturated" in color_text: color_filter = "eq=contrast=1.2:saturation=0.3"
        elif "vibrant" in color_text: color_filter = "eq=contrast=1.1:saturation=1.3"
        elif "warm" in color_text: color_filter = "eq=contrast=1.1:saturation=0.9,curves=r='0/0 0.5/0.55 1/1'"
        elif "cool" in color_text: color_filter = "eq=contrast=1.1:saturation=0.9,curves=b='0/0 0.5/0.55 1/1'"

    output_path = os.path.join(run_dir, f"{output_name}.mp4")
    subprocess.run(["ffmpeg", "-y", "-i", concat_file, "-vf", color_filter,
                    "-c:v", "libx264", "-preset", "fast", "-t", str(min(ref_dur, foot_dur, 30)), output_path],
                   capture_output=True)

    # Cleanup
    for sf in seg_files:
        try: os.remove(sf)
        except: pass
    try: os.remove(concat_list)
    except: pass
    try: os.remove(concat_file)
    except: pass

    if os.path.exists(output_path):
        size = os.path.getsize(output_path) / (1024 * 1024)
        print(f"Output: {output_path} ({size:.1f}MB)")
        subprocess.run(["open", output_path])
        return output_path
    return None

if __name__ == "__main__":
    REFERENCE = "/Users/hamza/Desktop/reserves/monet-ai-story/monet-reference-edits/2nd imporatnt.MP4"
    FOOTAGE = "/Users/hamza/Desktop/reserves/monet-ai-story/test-videos/Steph Curry IGNITES For 56 PTS In Orlando | February 27, 2025.mp4"
    if len(sys.argv) >= 3:
        REFERENCE = sys.argv[1]
        FOOTAGE = sys.argv[2]
    run_pipeline(REFERENCE, FOOTAGE, "steph-curry-e2e")
```

---

# Pipeline 9: `run_fresh_e2e.py`
**What it did:** Clean test runner that used monet_pipeline's extract_grammar + generate_edl_from_dna + render_native. Also created an analysis visualization video with drawtext overlays.

**What happened:** This was the integration test — it proved the full monet pipeline could run end-to-end. The analysis viz was useful for debugging. The render quality depended on the DNA quality.

(Full code in `scripts/run_fresh_e2e.py` — 233 lines, see file)

---

# Pipeline 10: `apply_style.py`
**What it did:** Bridge between ReferenceStyleProfile JSON (from the web UI) and the DNA format expected by monet_pipeline. Converted profile fields to DNA structure, then called generate_edl_from_dna.

**What happened:** Worked as a glue layer. The conversion was lossy — ReferenceStyleProfile has different fields than DNA. Some information was dropped.

(Full code in `scripts/apply_style.py` — 250+ lines, see file)

---

# Pipeline 11: `monet_refine.py`
**What it did:** Iterative refinement — took an existing EDL and applied user feedback (pacing, effects, color) via prompt parsing.

**What happened:** The prompt parser was keyword-based. "slower" → increase shot durations. "more effects" → add effects to random clips. "warmer" → apply warm color preset. It worked but was crude.

(Full code in `scripts/monet_refine.py` — 300+ lines, see file)

---

# Analyzers

The 35 analysis modules in `scripts/analyzers/`:

| File | Lines | What It Does |
|------|-------|-------------|
| `motion_analyzer.py` | ~200 | Optical flow (cv2 Farneback), per-frame magnitude 0-1 |
| `beat_detector.py` | ~150 | Librosa beat tracking, tempo BPM, beat strength |
| `color_analyzer.py` | ~180 | K-means dominant palette, grade classification |
| `shot_type_classifier.py` | ~200 | Wide/medium/close/extreme_close via face detection |
| `effect_detector.py` | ~250 | Blur, flash, vignette, shake, glow, desaturation |
| `text_detector.py` | ~200 | OCR text overlays (pytesseract + EasyOCR) |
| `speed_ramp_detector.py` | ~150 | Slow-mo, fast motion, ramp points |
| `semantic_analyzer.py` | ~300 | LLM-based action/emotion/subject understanding |
| `reference_type_classifier.py` | ~100 | LLM classifies video type (8 categories) |
| `type_profiles.py` | ~80 | Per-type threshold overrides |
| `dna_blender.py` | ~100 | Multi-reference DNA blending |
| `footage_analyzer.py` | ~200 | User footage analysis |
| `composite_detector.py` | ~150 | Split-screen, PiP, grid detection |
| `composition_analyzer.py` | ~120 | Rule-of-thirds, headroom, leading lines |
| `color_grade_tracker.py` | ~100 | Per-shot color grade changes |
| `transition_classifier.py` | ~120 | Cut, fade, dissolve, wipe classification |
| `speed_direction_analyzer.py` | ~100 | Forward/reverse playback detection |
| `edit_events_analyzer.py` | ~150 | Transitions + speed ramps + keyframes |
| `pipeline_context.py` | ~200 | Pre-processing orchestration |
| `dialogue_grammar.py` | ~250 | Speech-led cutting grammar |
| `edit_director.py` | ~300 | CV + LLM edit decision making |
| `edit_grammar.py` | ~200 | Structured shot/video/profile decomposition |
| `speech_pipeline.py` | ~200 | Word-level transcription + VAD + emphasis |
| `director_router.py` | ~100 | Dialogue vs montage routing |
| `llm_provider.py` | ~150 | Multi-vendor LLM with fallback |
| `llm_analyzer.py` | ~200 | Moment-by-moment timeline analysis |
| `editorial_style_export.py` | ~100 | Full style breakdown export |
| `dna_schema.py` | ~80 | Shared data structures |

---

# Reactions Timeline

### 2026-07-14 — First DNA extraction
> "Analysis intelligence is real. The creative intelligence (what to DO with that understanding) is missing entirely."

### 2026-07-14 — BeatSync E2E verified
> Beat sync full E2E standalone output verified. Complete pipeline ran on Steph Curry: audio analysis (99.4 BPM, 33 beats, 3 sections) → video analysis (34 candidates) → cut timing → render.

### 2026-07-21 — All three pipelines rejected
> "really horrendous, it cant even do proper editing-- and its like ass"
>
> Legacy (Gemini→EDL→Editly), Kove v2 (Python), V3 (engine-contracts + edl-v3) all fail to produce human-quality output. Root cause: no actual sensory input — pipeline only extracts metadata, never "sees" the video frames.

### 2026-07-21 — Frame-level analysis identified as fix
> "YALL CANT SENSE SHIT" — user's diagnosis of the fundamental failure. Prior pipelines extracted metadata (probe stats, segment labels) but never gave vision models actual frame content.

### 2026-07-21 — Replicate edit was "not bad for a beta"
> The replicate edit (steph-curry-replicate.mp4) was praised as "not bad for a beta" — validates the edit structure. Flash cuts and color grade worked. But each subsequent attempt got worse because the agent kept trying to force FFmpeg to do things it can't (drawtext, proper effects).

### 2026-07-21 — Curry-final rejected
> User rejected curry-final.mp4 — "nothing that i told u happened" — effects must actually appear in output.

### 2026-07-21 — v1 rejected (45s)
> `scripts/output/mikeross-x-21savage.mp4` — v1, 45s, rejected.

### 2026-07-21 — v2 partial success
> `scripts/output/mikeross-x-21savage-v2.mp4` — v2, 23.5s, song audio.

### 2026-07-21 — Fix everything immediately
> User's directive "fix everything bru i got excited and rn im upset" — when something fails, fix it immediately without lengthy explanations.

### 2026-07-21 — Stop over-engineering
> "why dont u just reverse engineer what openreel uses (kove-advanced) instead of making contracts, use the actual fucking engines, copy paste"

### 2026-07-21 — E2E pipeline output rejected
> User rejected all 5 rendered outputs as "really horrendous". The system chops source footage sequentially and slaps text on — doesn't edit. Missing: moment selection, narrative arc, rhythm, meaningful effect layering.

### 2026-07-21 — Vision understanding works, editing doesn't
> GPT-4o-mini vision correctly identifies subjects, moods, camera angles from video frames. Analysis intelligence is real. The creative intelligence (what to DO with that understanding) is missing entirely.

### 2026-07-21 — Gemini quality ratings unreliable
> Gemini rated raw FFmpeg output 8.5/10 when user judged it subpar 5/10.

### 2026-07-21 — Analyze priority, replicate secondary
> "analyze priority, replicate secondary. but analysis is ass so replicate primary." Focus on matching reference style output, not deep analysis quality.

### 2026-07-21 — Replicate rejected multiple times
> - v1 (too long, wrong pacing) → rejected
> - v2 (16s, no velocity, no flicker, wrong grade) → rejected
> - v3 (62s, too long from slow-mo) → rejected
> - v4 (20.8s, "everything needs fixing") → rejected

### 2026-07-22 — Color grading verified
> Simplified E2E verification confirms color grading actually reaches render output. File size difference (2494KB vs 2043KB) proves color grading works end-to-end. First time color has been verified.

### 2026-07-22 — Text overlay blocked
> Homebrew FFmpeg lacks `drawtext` filter (libfreetype not compiled in). Text overlay test produces 0KB output. Need PIL frame-by-frame approach.

### 2026-07-22 — Operation-executor silent no-ops
> `applyColor()` returns immediately on `target === "global"` — every LLM color decision discarded. `executePlan()` ignores `plan.text_overlays` entirely — subtitles hardcoded to `[]`.

### 2026-07-22 — Clip manifest fabrication
> `pipeline.ts` fabricates clip metadata: `{duration_s: 10, resolution: 1920x1080, content_tags: []}` for every clip regardless of actual content. LLM can't make real clip selection decisions when all clips look identical.

### 2026-07-23 — Vision model hallucinated
> Cloudflare vision model described "hiking, biking, kayaking" for a Steph Curry basketball video. JSON wrapped in markdown fences, parsing failed entirely.

### 2026-07-23 — "heavily, heavily underedited"
> "it is heavily, heavily underedited -- almost as if IT DONT GIVE A FUCK"

---

# Summary: What Actually Worked vs What Didn't

| Pipeline | Analysis | Edit Decisions | Rendering | Overall |
|----------|----------|---------------|-----------|---------|
| reference-dna.py | ✅ Solid | ❌ None | ❌ None | 3/10 |
| universal-vibe-editor.py | ✅ Solid | ⚠️ Time-based | ⚠️ Basic FFmpeg | 4/10 |
| replicate-steph-exact.py | ✅ Manual | ✅ Hardcoded | ⚠️ Basic FFmpeg | 5/10 |
| steph-curry-monet-render.py | ✅ Solid | ✅ EDL correct | ❌ Editly broken | 5/10 |
| steph-xfade-render.py | ✅ Solid | ✅ EDL correct | ❌ xfade broken | 4/10 |
| grammar_extractor.py | ✅ Excellent | ❌ None | ❌ None | 4/10 |
| **monet_pipeline.py** | ✅ Excellent | ✅ Content-aware | ✅ Per-clip effects | **7/10** |
| e2e-pipeline.py | ❌ Hallucinated | ❌ Time-based | ⚠️ Basic FFmpeg | 2/10 |
| run_fresh_e2e.py | ✅ Uses monet | ✅ Uses monet | ✅ Uses monet | 7/10 |
| apply_style.py | ⚠️ Lossy bridge | ✅ Uses monet | ✅ Uses monet | 6/10 |
| monet_refine.py | ⚠️ Keyword match | ⚠️ Crude | ✅ Uses monet | 5/10 |

**The winner:** `monet_pipeline.py` — the only one that combines real analysis with content-aware editing and proper rendering. Everything else is either analysis-only, or a simplified version that loses the important parts.
