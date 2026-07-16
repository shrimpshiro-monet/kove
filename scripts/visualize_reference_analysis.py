#!/usr/bin/env python3
"""
Overlay Video Generator for Reference Analysis Visualizer

Takes a reference video + ReferenceStyleProfile JSON and produces an annotated
MP4 with cut markers, effect labels, text detection boxes, color swatches,
transition labels, info bar, and energy curve.

Uses only stdlib + subprocess FFmpeg calls. Since drawtext is not available
in this FFmpeg build, text rendering uses a bitmap font rendered to PPM
images, composited via colorkey + overlay.

NOTE: Semi-transparent text overlays require FFmpeg compiled with --enable-libfreetype
(drawtext filter). This build lacks it, so text is rendered via bitmap font + PPM +
colorkey overlay, which gives fully opaque text only.

Usage:
  python scripts/visualize_reference_analysis.py <reference.mp4> <analysis.json> [-o overlay.mp4]
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

# ── 5×7 bitmap font (subset: A–Z, 0–9, pipe, colon, period, space) ───────
# Each entry: 7 bytes, byte n = bits for row n. Bit 0 = leftmost column.
_FONT_5X7 = {
    'A': (0x7C, 0x12, 0x11, 0x7C, 0x10, 0x10, 0x10),
    'B': (0x7F, 0x49, 0x49, 0x49, 0x49, 0x49, 0x36),
    'C': (0x3E, 0x41, 0x40, 0x40, 0x40, 0x41, 0x22),
    'D': (0x7F, 0x41, 0x41, 0x41, 0x41, 0x41, 0x3E),
    'E': (0x7F, 0x49, 0x49, 0x49, 0x49, 0x49, 0x41),
    'F': (0x7F, 0x09, 0x09, 0x09, 0x09, 0x09, 0x01),
    'G': (0x3E, 0x41, 0x40, 0x40, 0x48, 0x49, 0x3A),
    'H': (0x7F, 0x08, 0x08, 0x08, 0x08, 0x08, 0x7F),
    'I': (0x00, 0x41, 0x41, 0x7F, 0x41, 0x41, 0x00),
    'J': (0x20, 0x40, 0x40, 0x40, 0x40, 0x41, 0x3F),
    'K': (0x7F, 0x08, 0x08, 0x14, 0x22, 0x41, 0x00),
    'L': (0x7F, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40),
    'M': (0x7F, 0x02, 0x0C, 0x02, 0x02, 0x0C, 0x7F),
    'N': (0x7F, 0x02, 0x04, 0x08, 0x10, 0x20, 0x7F),
    'O': (0x3E, 0x41, 0x41, 0x41, 0x41, 0x41, 0x3E),
    'P': (0x7F, 0x09, 0x09, 0x09, 0x09, 0x09, 0x06),
    'Q': (0x3E, 0x41, 0x41, 0x41, 0x51, 0x21, 0x5E),
    'R': (0x7F, 0x09, 0x09, 0x09, 0x19, 0x29, 0x46),
    'S': (0x26, 0x49, 0x49, 0x49, 0x49, 0x49, 0x32),
    'T': (0x01, 0x01, 0x01, 0x7F, 0x01, 0x01, 0x01),
    'U': (0x3F, 0x40, 0x40, 0x40, 0x40, 0x40, 0x3F),
    'V': (0x07, 0x08, 0x10, 0x20, 0x10, 0x08, 0x07),
    'W': (0x7F, 0x20, 0x10, 0x08, 0x10, 0x20, 0x7F),
    'X': (0x41, 0x22, 0x14, 0x08, 0x14, 0x22, 0x41),
    'Y': (0x01, 0x02, 0x04, 0x78, 0x04, 0x02, 0x01),
    'Z': (0x41, 0x61, 0x51, 0x49, 0x45, 0x43, 0x41),
    '0': (0x3E, 0x41, 0x41, 0x49, 0x41, 0x41, 0x3E),
    '1': (0x00, 0x00, 0x42, 0x7F, 0x40, 0x00, 0x00),
    '2': (0x42, 0x61, 0x51, 0x49, 0x45, 0x43, 0x42),
    '3': (0x22, 0x41, 0x49, 0x49, 0x49, 0x49, 0x36),
    '4': (0x08, 0x08, 0x7F, 0x48, 0x28, 0x18, 0x08),
    '5': (0x4F, 0x49, 0x49, 0x49, 0x49, 0x49, 0x31),
    '6': (0x3E, 0x41, 0x49, 0x49, 0x49, 0x49, 0x32),
    '7': (0x01, 0x01, 0x01, 0x79, 0x05, 0x03, 0x01),
    '8': (0x36, 0x49, 0x49, 0x49, 0x49, 0x49, 0x36),
    '9': (0x26, 0x49, 0x49, 0x49, 0x49, 0x49, 0x3E),
    ' ': (0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00),
    '|': (0x00, 0x00, 0x00, 0x7F, 0x00, 0x00, 0x00),
    ':': (0x00, 0x00, 0x24, 0x00, 0x24, 0x00, 0x00),
    '.': (0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00),
    ',': (0x00, 0x00, 0x00, 0x00, 0x20, 0x40, 0x00),
    '-': (0x00, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00),
    '\'': (0x00, 0x00, 0x02, 0x03, 0x00, 0x00, 0x00),
    '(': (0x00, 0x1C, 0x22, 0x41, 0x00, 0x00, 0x00),
    ')': (0x00, 0x00, 0x41, 0x22, 0x1C, 0x00, 0x00),
    '!': (0x00, 0x00, 0x4F, 0x00, 0x00, 0x00, 0x00),
    '/': (0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01),
    'S': (0x26, 0x49, 0x49, 0x49, 0x49, 0x49, 0x32),  # duplicate S for safety
}

# Pre-compute uppercase lookup from lowercase
for ch in 'abcdefghijklmnopqrstuvwxyz':
    _FONT_5X7[ch] = _FONT_5X7.get(ch.upper(), _FONT_5X7[' '])


def _render_text_to_ppm(text: str, out_path: str, canvas_w: int, canvas_h: int,
                        char_scale: int = 2, x: int = 0, y: int = 0,
                        fg: tuple = (255, 255, 255)) -> None:
    """Render text using the 5x7 bitmap font into a PPM image.

    The background is black (0,0,0) so it can be keyed out by colorkey.
    """
    CH_W = 5 * char_scale
    CH_H = 7 * char_scale
    pixel = bytearray(canvas_w * canvas_h * 3)

    def _set_px(px: int, py: int, r: int, g: int, b: int):
        if 0 <= px < canvas_w and 0 <= py < canvas_h:
            idx = (py * canvas_w + px) * 3
            pixel[idx] = r
            pixel[idx + 1] = g
            pixel[idx + 2] = b

    cursor_x = x
    cursor_y = y

    for ch in text:
        if ch == '\n':
            cursor_x = x
            cursor_y += CH_H + char_scale
            continue

        glyph = _FONT_5X7.get(ch)
        if glyph is None:
            cursor_x += CH_W + char_scale
            continue

        for row in range(7):
            bits = glyph[row]
            for col in range(5):
                if bits & (1 << (4 - col)):
                    sx = cursor_x + col * char_scale
                    sy = cursor_y + row * char_scale
                    for dx in range(char_scale):
                        for dy in range(char_scale):
                            _set_px(sx + dx, sy + dy, fg[0], fg[1], fg[2])

        cursor_x += CH_W + char_scale

    # PPM header: P6 <width> <height> 255
    header = f"P6\n{canvas_w} {canvas_h}\n255\n".encode()
    with open(out_path, "wb") as f:
        f.write(header)
        f.write(pixel)


def _effect_label(segment: dict) -> str:
    EFFECT_FIELDS = ["blur", "vignette", "grain", "glow", "shake", "rgb_split"]
    EFFECT_LABELS = {"rgb_split": "RGB SPLIT"}
    labels = []
    for field in EFFECT_FIELDS:
        if segment.get(field, 0.0) > 0.0:
            labels.append(EFFECT_LABELS.get(field, field.upper()))
    if segment.get("has_text", False):
        labels.append("TEXT")
    return " | ".join(labels)


def _style_to_hex(style: str) -> str:
    return {
        "neutral": "808080", "warm": "E8A040", "cool": "4080C0",
        "vintage": "C08050", "cinematic": "408080", "vibrant": "FF4080",
        "aggressive": "CC2020", "dramatic": "404080",
    }.get(style, "808080")


def _color_temp_to_hex(temp: float, tint: float) -> str:
    r, g, b = 128, 128, 128
    r = max(0, min(255, r + int(temp * 64)))
    b = max(0, min(255, b - int(temp * 64)))
    g = max(0, min(255, g + int(tint * 32)))
    b = max(0, min(255, b + int(tint * 16)))
    return f"{r:02X}{g:02X}{b:02X}"


def get_video_info(video_path: str) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True,
    )
    duration = float(r.stdout.strip()) if r.stdout.strip() else 0.0

    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries",
         "stream=width,height,r_frame_rate,codec_type",
         "-of", "json", video_path],
        capture_output=True, text=True,
    )
    meta = json.loads(r.stdout)
    vs = next((s for s in meta.get("streams", []) if s.get("codec_type") == "video"), {})
    fps_parts = vs.get("r_frame_rate", "30/1").split("/")
    fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else 30.0
    return {
        "duration": duration,
        "width": int(vs.get("width", 1920)),
        "height": int(vs.get("height", 1080)),
        "fps": fps,
    }


def extract_segment_with_overlays(video_path: str, seg: dict, idx: int,
                                  output_path: str, info: dict) -> bool:
    w = info["width"]
    h = info["height"]
    dur = seg.get("duration", seg.get("end", 0) - seg.get("start", 0))
    if dur < 0.1:
        return False

    fps_str = f"{info['fps']:.2f}".rstrip("0").rstrip(".")

    # ── build drawbox-only filters ────────────────────────────────
    db_parts = []

    # NOTE: Text box position is center-of-frame by default. The ReferenceStyleProfile
    # schema doesn't include per-shot text bounding boxes yet — when textPositions[]
    # is added to SegmentStyle, replace this hardcoded box with data-driven ones.

    # text detection bounding box
    if seg.get("has_text", False):
        bx = int(w * 0.12)
        by = int(h * 0.55)
        bw = int(w * 0.76)
        bh = int(h * 0.12)
        db_parts.append(f"drawbox=x={bx}:y={by}:w={bw}:h={bh}:color=yellow@0.15:t=2")

    # color swatch (top-right)
    swatch_size = 32
    swatch_x = w - swatch_size - 10
    swatch_y = 10
    ct = seg.get("color_temp", 0.0)
    tin = seg.get("color_tint", 0.0)
    hex_col = _color_temp_to_hex(ct, tin) if ct != 0.0 or tin != 0.0 else \
              _style_to_hex(seg.get("style", "neutral"))
    db_parts.append(
        f"drawbox=x={swatch_x}:y={swatch_y}:w={swatch_size}:h={swatch_size}:"
        f"color=0x{hex_col}@0.85:t=fill"
    )

    # ── render text overlay as PPM ────────────────────────────────
    text_lines = []
    label = _effect_label(seg)
    if label:
        text_lines.append(label)

    trans = seg.get("transition_type", "cut")
    if trans != "cut" and seg.get("start", 0) > 0:
        text_lines.append(trans.upper())

    ppm_path = output_path.replace(".mp4", "_text.ppm")
    if text_lines:
        full_text = " | ".join(text_lines)
        _render_text_to_ppm(full_text, ppm_path, w, h, char_scale=2,
                            x=14, y=14, fg=(255, 255, 255))

    # ── build ffmpeg command ─────────────────────────────────────
    if db_parts:
        base_filter = ",".join(db_parts)
    else:
        base_filter = "null"
    if text_lines and os.path.exists(ppm_path):
        filter_complex = (
            f"[1:v]colorkey=0x000000:0.1:0.0[text];"
            f"[0:v][text]overlay=0:0[base];"
            f"[base]{base_filter}[v]"
        )
        inputs = ["-ss", str(seg["start"]), "-i", video_path,
                  "-i", ppm_path]
    else:
        filter_complex = f"[0:v]{base_filter}[v]"
        inputs = ["-ss", str(seg["start"]), "-i", video_path]

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-t", str(dur),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-r", fps_str,
        "-an",
        output_path,
    ]

    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=180)
        return True
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if isinstance(e.stderr, bytes) else (e.stderr or "")
        print(f"  FFmpeg error (seg {idx}): {err[:300]}", file=sys.stderr)
        return False


def add_global_overlays(video_path: str, analysis: dict, output_path: str,
                        info: dict) -> bool:
    w = info["width"]
    h = info["height"]
    duration = analysis.get("duration", info["duration"])
    segments = analysis.get("segments", [])
    energy_curve = analysis.get("energy_curve", [])
    bpm = analysis.get("bpm", 0)
    pacing = analysis.get("pacing_type", "unknown")
    total_cuts = analysis.get("total_cuts", 0)

    bar_y = h - 60
    tl_y = bar_y + 5
    tl_h = 50
    tl_x = 220
    tl_w = w - 540

    # ── collect text renders (to do in one PPM pass) ──────────────
    text_ops = []

    # info text (bottom-right)
    info_text = f"BPM:{bpm:.0f} | {pacing.upper()} | {total_cuts}CUTS"
    text_ops.append((info_text, 2, w - 360, h - 44, (255, 255, 255)))

    # ENERGY label (bottom-left)
    text_ops.append(("ENERGY", 1, 14, h - 74, (200, 200, 200)))

    # GRADE label (top-right)
    text_ops.append(("GRADE", 1, w - 90, 18, (200, 200, 200)))

    # transition labels at cut points
    for seg in segments:
        ct = seg.get("start", 0)
        trans = seg.get("transition_type", "cut")
        if ct > 0 and trans != "cut":
            cx = int(tl_x + (ct / duration) * tl_w) if duration > 0 else tl_x
            cx = max(tl_x, min(tl_x + tl_w - 2, cx))
            text_ops.append((trans.upper(), 1, cx - 15, tl_y - 18, (255, 200, 200)))

    # ── render all text to single PPM ──────────────────────────────
    overlay_dir = os.path.dirname(output_path) or "."
    overlay_ppm = os.path.join(overlay_dir, "_info_overlay.ppm")
    pixel = bytearray(w * h * 3)

    def _sp(px, py, r, g, b):
        if 0 <= px < w and 0 <= py < h:
            idx = (py * w + px) * 3
            pixel[idx] = r
            pixel[idx + 1] = g
            pixel[idx + 2] = b

    CH_W = 5
    CH_H = 7
    for text, scale, ox, oy, fg in text_ops:
        cx, cy = ox, oy
        for ch in text:
            if ch == '\n':
                cx, cy = ox, cy + CH_H * scale + scale
                continue
            glyph = _FONT_5X7.get(ch)
            if glyph is None:
                cx += CH_W * scale + scale
                continue
            for row in range(CH_H):
                bits = glyph[row] if isinstance(glyph[row], int) else 0
                for col in range(5):
                    if bits & (1 << (4 - col)):
                        for dx in range(scale):
                            for dy in range(scale):
                                _sp(cx + col * scale + dx, cy + row * scale + dy,
                                    fg[0], fg[1], fg[2])
            cx += CH_W * scale + scale

    header = f"P6\n{w} {h}\n255\n".encode()
    with open(overlay_ppm, "wb") as f:
        f.write(header)
        f.write(pixel)

    # ── drawbox filters ───────────────────────────────────────────
    parts = [f"drawbox=x=0:y={bar_y}:w={w}:h=60:color=black@0.7:t=fill"]
    parts.append(f"drawbox=x={tl_x}:y={tl_y}:w={tl_w}:h={tl_h}:color=white@0.08:t=fill")

    for seg in segments:
        ct = seg.get("start", 0)
        if ct <= 0:
            continue
        cx = int(tl_x + (ct / duration) * tl_w) if duration > 0 else tl_x
        cx = max(tl_x, min(tl_x + tl_w - 2, cx))
        parts.append(f"drawbox=x={cx}:y={tl_y}:w=2:h={tl_h}:color=red@0.7:t=fill")

    if energy_curve:
        curve_x, curve_y = 12, bar_y + 22
        curve_w, curve_h = 190, 30
        num = len(energy_curve)
        bar_w = max(4, curve_w // num - 2)
        for i, ev in enumerate(energy_curve):
            bx = curve_x + i * (bar_w + 2)
            bh = max(2, int(ev * (curve_h - 2)))
            by = curve_y + curve_h - 2 - bh
            c = "44CC44" if ev < 0.3 else "CCCC00" if ev < 0.6 else "CC8800" if ev < 0.8 else "CC3333"
            parts.append(f"drawbox=x={bx}:y={by}:w={bar_w}:h={bh}:color=0x{c}@0.8:t=fill")

    filter_complex = (
        f"[1:v]colorkey=0x000000:0.1:0.0[text];"
        f"[0:v][text]overlay=0:0,{','.join(parts)}[v]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", overlay_ppm,
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        output_path,
    ]

    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=180)
        return True
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if isinstance(e.stderr, bytes) else (e.stderr or "")
        print(f"  Global overlay error: {err[:500]}", file=sys.stderr)
        return False
    finally:
        try:
            os.remove(overlay_ppm)
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser(
        description="Generate annotated overlay video from ReferenceStyleProfile JSON"
    )
    parser.add_argument("reference", help="Path to reference video (.mp4)")
    parser.add_argument("analysis", help="Path to ReferenceStyleProfile JSON")
    parser.add_argument("-o", "--output", default="overlay.mp4", help="Output path")
    args = parser.parse_args()

    if not os.path.exists(args.reference):
        print(f"Error: reference video not found: {args.reference}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(args.analysis):
        print(f"Error: analysis file not found: {args.analysis}", file=sys.stderr)
        sys.exit(1)

    try:
        subprocess.run(['ffprobe', '-version'], capture_output=True, check=True)
    except FileNotFoundError:
        print("Error: ffprobe not found on PATH. Install FFmpeg to use this tool.",
              file=sys.stderr)
        sys.exit(1)

    with open(args.analysis) as f:
        analysis = json.load(f)

    print("Reading video info...")
    info = get_video_info(args.reference)
    info["fps"] = analysis.get("fps", info["fps"])
    style = analysis.get("color_signature", {}).get("style", "neutral")

    segments = analysis.get("segments", [])
    if not segments:
        print("Error: analysis JSON contains no segments", file=sys.stderr)
        sys.exit(1)

    print(f"Processing {len(segments)} segment(s) on "
          f"{info['width']}x{info['height']} @{info['fps']:.1f}fps...")

    tmpdir = tempfile.mkdtemp(prefix="viz-")
    try:
        seg_files = []
        for i, seg in enumerate(segments):
            out_path = os.path.join(tmpdir, f"seg_{i:04d}.mp4")
            seg["style"] = style
            ok = extract_segment_with_overlays(
                args.reference, seg, i, out_path, info
            )
            if ok and os.path.getsize(out_path) > 1024:
                seg_files.append(out_path)
                label = _effect_label(seg) or "no effects"
                print(f"  [{i+1}/{len(segments)}] {seg['start']:.2f}s-{seg['end']:.2f}s "
                      f"({seg.get('duration', 0):.2f}s)  {label}")
            else:
                print(f"  [{i+1}/{len(segments)}] {seg['start']:.2f}s-{seg['end']:.2f}s  FAILED")

        if not seg_files:
            print("Error: no segments extracted", file=sys.stderr)
            sys.exit(1)

        # ── concat ─────────────────────────────────────────────────
        print(f"\nConcatenating {len(seg_files)} segment(s)...")
        concat_list = os.path.join(tmpdir, "concat.txt")
        with open(concat_list, "w") as f:
            for sf in seg_files:
                f.write(f"file '{sf}'\n")

        concat_out = os.path.join(tmpdir, "concat.mp4")
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_list,
            "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-an",
            concat_out,
        ], capture_output=True, check=True, timeout=120)

        # ── global overlays ────────────────────────────────────────
        print("Adding global overlays (info bar, cut markers, energy curve)...")
        ok = add_global_overlays(concat_out, analysis, args.output, info)
        if not ok:
            print("Warning: global overlay pass failed — using raw concat output",
                  file=sys.stderr)
            shutil.copy2(concat_out, args.output)

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    out_size = os.path.getsize(args.output) / 1024 / 1024
    dur_result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", args.output],
        capture_output=True, text=True,
    )
    out_dur = float(dur_result.stdout.strip()) if dur_result.stdout.strip() else 0
    print(f"\nDone: {args.output}")
    print(f"  Duration: {out_dur:.2f}s")
    print(f"  Size: {out_size:.1f} MB")


if __name__ == "__main__":
    main()
