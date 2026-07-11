"""
Mike Ross Gritty Noir Edit — "Outfit" by 21 Savage
Beat-synced, velocity ramps, noir grade, "edited by kove" interstitial.

Usage: python3 test/mike-ross-edit.py
"""

import cv2
import numpy as np
import os
import subprocess
import math

INPUT = "test/MikeRoss.mp4"
MUSIC = "test/Outfit (with 21 Savage).mp3"
OUTPUT = "test/mike-ross-noir.mp4"
FRAMES_DIR = "test/mike-edit-frames"
TEMP = "test/mike-edit-temp.mp4"

BPM = 130
BEAT_INTERVAL = 60 / BPM  # 0.462s per beat

# Target: ~20 seconds edit
# Structure: intro (4 beats) → drop (8 beats) → kove interstitial (4 beats) → second half (16 beats) → outro (4 beats)

# Shot definitions: (source_start, source_end, speed, label, noir_strength)
# noir_strength: 1.0 = full noir (B&W), 0.0 = color
SHOTS = [
    # ACT 1: Build-up (underdog → transformation)
    (0.0, 2.3, 1.0, "underdog", 0.0),       # Classroom - underdog Mike
    (2.3, 3.5, 0.6, "pointing", 0.3),        # Dark room, pointing - intensity builds
    (12.0, 14.0, 0.5, "walk-in", 0.4),       # Walking into office - transformation

    # ACT 2: The aura (drop)
    (14.5, 17.0, 0.35, "hallway-walk", 0.6), # THE hallway walk - peak aura
    (21.5, 23.5, 0.5, "smirk", 0.5),         # Smirk at woman - confidence
    (41.0, 43.5, 0.4, "power-entrance", 0.7), # Walking through door - power

    # KOVE INTERSTITIAL (B&W melted transition)

    # ACT 3: Second half
    (49.0, 51.0, 0.5, "casual-drink", 0.3),  # Drinking - cool
    (61.0, 63.5, 0.4, "chemistry", 0.5),     # With woman - chemistry
    (69.0, 72.0, 0.6, "jessica", 0.4),       # Jessica Pearson - boss
    (81.0, 84.0, 0.5, "harvey-mike", 0.6),   # Walking with Harvey
    (104.0, 107.0, 0.4, "reading", 0.5),     # Reading paper - focus
    (89.0, 92.0, 0.35, "harvey-smile", 0.7), # Harvey smile - finale
]


def apply_noir_grade(frame, strength=0.6):
    """Gritty noir: desaturation, high contrast, slight sepia tint."""
    # Convert to HSV
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)

    # Desaturate based on strength
    hsv[:, :, 1] *= (1.0 - strength * 0.8)

    # Slight warm tint (sepia feel)
    frame = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # High contrast
    frame = cv2.convertScaleAbs(frame, alpha=1.0 + strength * 0.3, beta=-strength * 10)

    # Add slight warm tone to shadows
    if strength > 0.3:
        shadow_mask = (frame.mean(axis=2) < 80).astype(np.float32)
        shadow_mask = cv2.GaussianBlur(shadow_mask, (21, 21), 0)
        frame[:, :, 2] = np.clip(frame[:, :, 2].astype(np.float32) + shadow_mask * 15, 0, 255).astype(np.uint8)  # Red channel
        frame[:, :, 0] = np.clip(frame[:, :, 0].astype(np.float32) - shadow_mask * 10, 0, 255).astype(np.uint8)  # Blue channel

    return frame


def apply_vignette(frame, strength=0.4):
    h, w = frame.shape[:2]
    Y, X = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    r = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    max_r = np.sqrt(cx ** 2 + cy ** 2)
    v = 1 - (r / max_r) * strength
    v = np.clip(v, 0, 1)
    v = cv2.GaussianBlur(v, (51, 51), 0)
    return (frame.astype(np.float32) * v[:, :, np.newaxis]).astype(np.uint8)


def create_kove_title_card(w, h, duration_frames, fps):
    """Create the 'edited by kove' title card — gritty, spray painted look."""
    frames = []
    for i in range(duration_frames):
        t = i / fps
        progress = i / max(1, duration_frames - 1)

        # Black background
        frame = np.zeros((h, w, 3), dtype=np.uint8)

        # Add film grain
        noise = np.random.normal(0, 15, (h, w, 3)).astype(np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        # "edited by" text — small, top
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        text1 = "edited by"
        (tw1, th1), _ = cv2.getTextSize(text1, font, font_scale, 1)
        x1 = (w - tw1) // 2
        y1 = h // 2 - 30

        # Animate: text appears with slight shake
        if t > 0.1:
            shake_x = int(np.sin(t * 20) * 2 * (1 - progress))
            shake_y = int(np.cos(t * 15) * 1.5 * (1 - progress))
            # Spray paint effect — slightly rough edges
            cv2.putText(frame, text1, (x1 + shake_x, y1 + shake_y), font, font_scale,
                       (180, 180, 180), 1, cv2.LINE_AA)

        # "KOVE" text — large, center, bold
        font_scale2 = 1.8
        text2 = "KOVE"
        (tw2, th2), _ = cv2.getTextSize(text2, font, font_scale2, 3)
        x2 = (w - tw2) // 2
        y2 = h // 2 + 30

        if t > 0.3:
            # Appear with scale animation
            appear_progress = min(1, (t - 0.3) / 0.3)
            scale = 0.5 + appear_progress * 0.5
            actual_scale = font_scale2 * scale
            (tw2s, th2s), _ = cv2.getTextSize(text2, font, actual_scale, 3)
            x2s = (w - tw2s) // 2
            y2s = h // 2 + 30

            # Spray paint effect — thicker, with rough edges
            for offset in range(-1, 2):
                cv2.putText(frame, text2, (x2s + offset, y2s + offset), font, actual_scale,
                           (220, 220, 220), 3, cv2.LINE_AA)

            # Add red accent line
            line_y = y2s + 15
            line_progress = min(1, (t - 0.3) / 0.4)
            line_len = int(tw2s * line_progress)
            cv2.line(frame, (x2s, line_y), (x2s + line_len, line_y), (0, 0, 255), 2)

        # Fade out at end
        if progress > 0.7:
            fade = 1 - (progress - 0.7) / 0.3
            frame = (frame * fade).astype(np.uint8)

        frames.append(frame)

    return frames


def create_bw_melt_transition(w, h, duration_frames, fps):
    """Black and white melted transition with shake."""
    frames = []
    for i in range(duration_frames):
        t = i / fps
        progress = i / max(1, duration_frames - 1)

        frame = np.zeros((h, w, 3), dtype=np.uint8)

        # Melted/dripping effect — vertical streaks
        num_streaks = 30
        for s in range(num_streaks):
            x = int((s / num_streaks) * w)
            streak_width = w // num_streaks
            # Drip down from top
            drip_length = int(h * progress * (0.5 + 0.5 * np.sin(s * 0.7)))
            brightness = int(80 + 40 * np.sin(s * 1.3 + t * 5))
            cv2.rectangle(frame, (x, 0), (x + streak_width, drip_length), (brightness, brightness, brightness), -1)

        # Add shake
        shake_x = int(np.sin(t * 30) * 8 * progress)
        shake_y = int(np.cos(t * 25) * 5 * progress)
        M = np.float32([[1, 0, shake_x], [0, 1, shake_y]])
        frame = cv2.warpAffine(frame, M, (w, h))

        # Vignette
        frame = apply_vignette(frame, 0.5)

        frames.append(frame)

    return frames


def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Mike Ross — Gritty Noir Edit                      ║")
    print("║  'Outfit' by 21 Savage | Beat-synced | Kove brand  ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    if not os.path.exists(INPUT):
        print(f"❌ Source not found: {INPUT}")
        return

    os.makedirs(FRAMES_DIR, exist_ok=True)

    # Probe source
    probe = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', INPUT],
        capture_output=True, text=True
    )
    import json
    info = json.loads(probe.stdout)
    src_fps = 24000 / 1001  # ~23.976
    src_duration = float(info['format']['duration'])
    print(f"Source: {src_duration:.1f}s, ~{src_fps:.1f}fps")

    # Read all frames
    print("Reading video frames...")
    cap = cv2.VideoCapture(INPUT)
    all_frames = {}
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        t = idx / src_fps
        for start, end, speed, label, noir in SHOTS:
            if start <= t < end:
                if label not in all_frames:
                    all_frames[label] = []
                all_frames[label].append((frame, noir))
                break
        idx += 1
    cap.release()
    print(f"  Read {idx} frames")

    # Process and write
    print("Processing with noir grade...")
    out_fps = 30
    out_w, out_h = 1280, 720
    out = cv2.VideoWriter(TEMP, cv2.VideoWriter_fourcc(*"mp4v"), out_fps, (out_w, out_h))

    total_written = 0

    # ACT 1: Build-up
    print("  Act 1: Build-up...")
    for start, end, speed, label, noir in SHOTS[:3]:
        frames = all_frames.get(label, [])
        if not frames:
            continue
        step = max(1, int(speed)) if speed >= 1 else 1
        dup = max(1, int(1 / speed)) if speed < 1 else 1

        for i in range(0, len(frames), step):
            frame, noir_str = frames[i]
            resized = cv2.resize(frame, (out_w, out_h))
            result = apply_noir_grade(resized, noir_str)
            result = apply_vignette(result, 0.3 + noir_str * 0.2)

            for _ in range(dup):
                out.write(result)
                total_written += 1

    # ACT 2: The drop (more aggressive cuts)
    print("  Act 2: The aura drop...")
    for start, end, speed, label, noir in SHOTS[3:6]:
        frames = all_frames.get(label, [])
        if not frames:
            continue
        step = max(1, int(speed)) if speed >= 1 else 1
        dup = max(1, int(1 / speed)) if speed < 1 else 1

        for i in range(0, len(frames), step):
            frame, noir_str = frames[i]
            resized = cv2.resize(frame, (out_w, out_h))
            result = apply_noir_grade(resized, noir_str)
            result = apply_vignette(result, 0.4 + noir_str * 0.15)

            # Add motion blur on fast cuts
            if speed >= 1.5:
                result = cv2.GaussianBlur(result, (5, 5), 0)

            for _ in range(dup):
                out.write(result)
                total_written += 1

    # KOVE INTERSTITIAL
    print("  Kove interstitial...")
    # BW melted transition (2 seconds)
    melt_frames = create_bw_melt_transition(out_w, out_h, 2 * out_fps, out_fps)
    for f in melt_frames:
        out.write(f)
        total_written += 1

    # "edited by kove" title card (3 seconds)
    kove_frames = create_kove_title_card(out_w, out_h, 3 * out_fps, out_fps)
    for f in kove_frames:
        out.write(f)
        total_written += 1

    # Fade back from black (1 second)
    for i in range(out_fps):
        t = i / out_fps
        frame = np.zeros((out_h, out_w, 3), dtype=np.uint8)
        # Fade in
        alpha = t
        frame = (frame * (1 - alpha)).astype(np.uint8)
        out.write(frame)
        total_written += 1

    # ACT 3: Second half
    print("  Act 3: Second half...")
    for start, end, speed, label, noir in SHOTS[6:]:
        frames = all_frames.get(label, [])
        if not frames:
            continue
        step = max(1, int(speed)) if speed >= 1 else 1
        dup = max(1, int(1 / speed)) if speed < 1 else 1

        for i in range(0, len(frames), step):
            frame, noir_str = frames[i]
            resized = cv2.resize(frame, (out_w, out_h))
            result = apply_noir_grade(resized, noir_str)
            result = apply_vignette(result, 0.35 + noir_str * 0.2)

            for _ in range(dup):
                out.write(result)
                total_written += 1

    # OUTRO: Fade to black
    print("  Outro: fade to black...")
    last_frame = np.zeros((out_h, out_w, 3), dtype=np.uint8)
    for i in range(out_fps * 2):  # 2 seconds
        out.write(last_frame)
        total_written += 1

    out.release()
    duration = total_written / out_fps
    print(f"  Total: {total_written} frames = {duration:.1f}s")

    # Mux with music using FFmpeg
    print("\nMuxing with music...")
    final_cmd = [
        'ffmpeg', '-y',
        '-i', TEMP,
        '-i', MUSIC,
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-b:v', '5M',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        OUTPUT
    ]

    result = subprocess.run(final_cmd, capture_output=True, text=True, timeout=120)

    if os.path.exists(OUTPUT):
        size = os.path.getsize(OUTPUT) / (1024 * 1024)
        probe2 = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUTPUT],
            capture_output=True, text=True
        )
        dur = probe2.stdout.strip()
        print(f"\n✅ Done!")
        print(f"   Output: {OUTPUT}")
        print(f"   Size: {size:.1f}MB")
        print(f"   Duration: {dur}s")
        os.system(f'open "{OUTPUT}"')
    else:
        print("❌ Mux failed")
        print(result.stderr[-500:])


if __name__ == "__main__":
    main()
