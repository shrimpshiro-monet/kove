"""
Mike Ross Gritty Noir Edit v2 — Tighter, harder, beat-synced
20 seconds, aggressive cuts, real noir grade.

Usage: python3 test/mike-ross-edit-v2.py
"""

import cv2
import numpy as np
import os
import subprocess
import json

INPUT = "test/MikeRoss.mp4"
MUSIC = "test/Outfit (with 21 Savage).mp3"
OUTPUT = "test/mike-ross-noir-v2.mp4"
TEMP = "test/mike-noir-v2-temp.mp4"

BPM = 130
BEAT = 60 / BPM  # 0.462s per beat
OUT_FPS = 30
OUT_W, OUT_H = 1280, 720

# 20 seconds = ~43 beats at 130 BPM
# Structure: intro(4) → build(4) → DROP(4) → kove(4) → second(8) → outro(4)

# Shots: (start, end, beats, label, noir)
# Each shot is exactly N beats long
SHOTS = [
    # INTRO — underdog, tension building
    (0.0, 0.0 + 4*BEAT, 4, "intro-classroom", 0.0),

    # BUILD — transformation starts
    (12.0, 12.0 + 4*BEAT, 4, "build-walk", 0.3),

    # DROP — peak aura moments (fast cuts)
    (14.5, 14.5 + 2*BEAT, 2, "drop-hallway", 0.7),
    (21.5, 21.5 + 2*BEAT, 2, "drop-smirk", 0.5),
    (41.0, 41.0 + 2*BEAT, 2, "drop-entrance", 0.8),

    # KOVE INTERSTITIAL

    # SECOND HALF — more power moments
    (61.0, 61.0 + 3*BEAT, 3, "sec-chemistry", 0.5),
    (69.0, 69.0 + 3*BEAT, 3, "sec-jessica", 0.4),
    (81.0, 81.0 + 3*BEAT, 3, "sec-harvey-mike", 0.6),
    (89.0, 89.0 + 3*BEAT, 3, "sec-finale", 0.7),
]


def noir(frame, strength=0.6):
    """Aggressive noir grade."""
    # Desaturate heavily
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    # Blend original with B&W based on strength
    result = frame.astype(np.float32) * (1 - strength) + gray_bgr.astype(np.float32) * strength

    # High contrast
    result = cv2.convertScaleAbs(result, alpha=1.0 + strength * 0.4, beta=-strength * 15)

    # Warm shadows (film noir feel)
    shadow_mask = (result.mean(axis=2) < 60).astype(np.float32)
    shadow_mask = cv2.GaussianBlur(shadow_mask, (31, 31), 0)
    result[:, :, 2] = np.clip(result[:, :, 2] + shadow_mask * 20, 0, 255)  # Red
    result[:, :, 0] = np.clip(result[:, :, 0] - shadow_mask * 15, 0, 255)  # Blue

    return np.clip(result, 0, 255).astype(np.uint8)


def vignette(frame, s=0.45):
    h, w = frame.shape[:2]
    Y, X = np.ogrid[:h, :w]
    r = np.sqrt((X - w/2)**2 + (Y - h/2)**2) / np.sqrt((w/2)**2 + (h/2)**2)
    v = np.clip(1 - r * s, 0, 1)
    v = cv2.GaussianBlur(v, (51, 51), 0)
    return (frame.astype(np.float32) * v[:,:,np.newaxis]).astype(np.uint8)


def film_grain(frame, intensity=20):
    noise = np.random.normal(0, intensity, frame.shape).astype(np.int16)
    return np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def make_title_card(text, subtext, w, h, frames_count, fps):
    """Gritty spray-painted title card."""
    frames = []
    font = cv2.FONT_HERSHEY_SIMPLEX

    for i in range(frames_count):
        t = i / fps
        progress = i / max(1, frames_count - 1)

        # Black with heavy grain
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        frame = film_grain(frame, 25)

        # Subtext: "edited by" — appears first
        if t > 0.05:
            alpha_sub = min(1, (t - 0.05) / 0.15)
            sub_scale = 0.45
            (tw, th), _ = cv2.getTextSize(subtext, font, sub_scale, 1)
            sx = (w - tw) // 2
            sy = h // 2 - 25

            # Slight jitter
            jx = int(np.sin(t * 25) * 1.5)
            jy = int(np.cos(t * 20) * 1)

            cv2.putText(frame, subtext, (sx + jx, sy + jy), font, sub_scale,
                       (int(160*alpha_sub), int(160*alpha_sub), int(160*alpha_sub)), 1, cv2.LINE_AA)

        # Main text: "KOVE" — appears with impact
        if t > 0.2:
            appear = min(1, (t - 0.2) / 0.1)
            main_scale = 2.0 * appear
            (tw, th), _ = cv2.getTextSize(text, font, main_scale, 4)
            mx = (w - tw) // 2
            my = h // 2 + 35

            # Impact shake
            if t < 0.4:
                shake = int((0.4 - t) * 30)
                mx += int(np.sin(t * 80) * shake)
                my += int(np.cos(t * 60) * shake)

            # Spray paint: multiple layers with slight offsets
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    if abs(dx) + abs(dy) <= 3:
                        cv2.putText(frame, text, (mx + dx, my + dy), font, main_scale,
                                   (int(200*appear), int(200*appear), int(200*appear)), 3, cv2.LINE_AA)

            # Red accent line under text
            line_progress = min(1, (t - 0.25) / 0.3)
            line_y = my + 12
            line_len = int(tw * line_progress)
            cv2.line(frame, (mx, line_y), (mx + line_len, line_y), (0, 0, 220), 3)

        # Fade out at end
        if progress > 0.75:
            fade = 1 - (progress - 0.75) / 0.25
            frame = (frame * fade).astype(np.uint8)

        frames.append(frame)

    return frames


def make_melt_transition(w, h, frames_count, fps):
    """B&W melted transition with shake."""
    frames = []
    for i in range(frames_count):
        t = i / fps
        progress = i / max(1, frames_count - 1)

        frame = np.zeros((h, w, 3), dtype=np.uint8)

        # Melting drip effect
        for col in range(0, w, 8):
            drip_h = int(h * progress * (0.4 + 0.6 * abs(np.sin(col * 0.02 + t * 3))))
            brightness = int(60 + 30 * np.sin(col * 0.05 + t * 4))
            cv2.rectangle(frame, (col, 0), (col + 8, drip_h), (brightness, brightness, brightness), -1)

        # Shake
        sx = int(np.sin(t * 35) * 12 * progress)
        sy = int(np.cos(t * 28) * 8 * progress)
        M = np.float32([[1, 0, sx], [0, 1, sy]])
        frame = cv2.warpAffine(frame, M, (w, h))

        frame = vignette(frame, 0.6)
        frames.append(frame)

    return frames


def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Mike Ross — Gritty Noir v2                        ║")
    print("║  20s | Beat-synced | Kove brand | Aura farming     ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    cap = cv2.VideoCapture(INPUT)
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"Source: {src_fps:.1f}fps")

    # Read all frames
    print("Reading frames...")
    all_frames = {}
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        t = idx / src_fps
        for start, end, beats, label, noir_s in SHOTS:
            if start <= t < end:
                if label not in all_frames:
                    all_frames[label] = []
                all_frames[label].append((frame, noir_s))
                break
        idx += 1
    cap.release()
    print(f"  Read {idx} frames, extracted {sum(len(v) for v in all_frames.values())}")

    # Process
    print("Processing...")
    out = cv2.VideoWriter(TEMP, cv2.VideoWriter_fourcc(*"mp4v"), OUT_FPS, (OUT_W, OUT_H))
    total = 0

    for start, end, beats, label, noir_s in SHOTS:
        frames = all_frames.get(label, [])
        if not frames:
            continue

        # Each shot is exactly `beats` beats long
        target_frames = int(beats * BEAT * OUT_FPS)
        step = max(1, len(frames) // target_frames)

        written = 0
        for i in range(0, len(frames), step):
            if written >= target_frames:
                break
            frame, ns = frames[i]
            resized = cv2.resize(frame, (OUT_W, OUT_H))
            result = noir(resized, ns)
            result = vignette(result, 0.4 + ns * 0.15)
            result = film_grain(result, 12 + ns * 8)
            out.write(result)
            written += 1
            total += 1

        print(f"  {label}: {written} frames ({beats} beats)")

    # KOVE INTERSTITIAL
    print("  Kove interstitial...")
    melt = make_melt_transition(OUT_W, OUT_H, int(1.5 * OUT_FPS), OUT_FPS)
    for f in melt:
        out.write(f)
        total += 1

    title = make_title_card("KOVE", "edited by", OUT_W, OUT_H, int(2.5 * OUT_FPS), OUT_FPS)
    for f in title:
        out.write(f)
        total += 1

    # Fade back
    for i in range(int(1.0 * OUT_FPS)):
        alpha = i / (1.0 * OUT_FPS)
        frame = np.zeros((OUT_H, OUT_W, 3), dtype=np.uint8)
        out.write(frame)
        total += 1

    # OUTRO: black
    for i in range(int(1.5 * OUT_FPS)):
        out.write(np.zeros((OUT_H, OUT_W, 3), dtype=np.uint8))
        total += 1

    out.release()
    duration = total / OUT_FPS
    print(f"  Total: {duration:.1f}s")

    # Mux with music
    print("\nMuxing with music...")
    subprocess.run([
        'ffmpeg', '-y', '-i', TEMP, '-i', MUSIC,
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-b:v', '6M',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest', '-movflags', '+faststart', OUTPUT
    ], capture_output=True, timeout=120)

    if os.path.exists(OUTPUT):
        sz = os.path.getsize(OUTPUT) / (1024*1024)
        dur = subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUTPUT],
                           capture_output=True, text=True).stdout.strip()
        print(f"\n✅ {OUTPUT} — {sz:.1f}MB, {dur}s")
        os.system(f'open "{OUTPUT}"')
    else:
        print("❌ Failed")


if __name__ == "__main__":
    main()
