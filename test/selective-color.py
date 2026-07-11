"""
Selective Color — Real Subject Isolation
OpenCV background subtraction for subject detection.
Background → B&W, subject → color.

Usage: python3 test/selective-color.py
"""

import cv2
import numpy as np
import os

INPUT = os.path.join(os.path.dirname(__file__), "High Quality Steph Curry Clips for Edits! (2024-25).mp4")
OUTPUT = os.path.join(os.path.dirname(__file__), "steph-curry-selective-color.mp4")
TEMP = os.path.join(os.path.dirname(__file__), "sc-frames", "temp.mp4")

# Shots: (start_sec, end_sec, name, speed, desaturation)
# desaturation: 1.0 = full color, 0.0 = full B&W for background
SHOTS = [
    (0.0, 2.5, "buildup", 1.0, 0.9),
    (2.5, 3.5, "tension", 0.6, 0.85),
    (9.5, 11.5, "hero-smile", 0.4, 0.3),
    (17.5, 19.5, "hero-emotion", 0.35, 0.25),
    (19.5, 21.5, "hero-scream", 0.4, 0.3),
    (11.5, 13.5, "hero-make", 0.35, 0.35),
    (13.5, 16.0, "hero-celebrate", 0.45, 0.4),
    (16.0, 17.0, "outro", 1.0, 0.9),
]


def get_subject_mask(frame, bg_subtractor, kernel):
    """Get foreground mask using background subtraction."""
    fg = bg_subtractor.apply(frame)

    # Clean up
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel, iterations=3)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, kernel, iterations=1)

    # Remove shadows
    _, fg = cv2.threshold(fg, 200, 255, cv2.THRESH_BINARY)

    # If mask is too small, use center-weighted fallback
    if cv2.countNonZero(fg) < frame.shape[0] * frame.shape[1] * 0.02:
        h, w = frame.shape[:2]
        Y, X = np.ogrid[:h, :w]
        cx, cy = w // 2, h // 2
        r = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        fg = ((r < w * 0.35) * 255).astype(np.uint8)

    # Smooth edges
    fg = cv2.GaussianBlur(fg, (15, 15), 0)
    return fg


def selective_color(frame, mask, bg_desat=0.3, subject_boost=1.1):
    """Subject in color, background desaturated."""
    # Create B&W version
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    # Boost subject saturation slightly
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * subject_boost, 0, 255)
    color_boosted = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # Blend using mask
    mask_f = mask.astype(np.float32) / 255.0
    mask_f = cv2.GaussianBlur(mask_f, (7, 7), 0)
    mask_3ch = np.stack([mask_f] * 3, axis=-1)

    # Where mask=1 → color, where mask=0 → B&W (desaturated)
    result = color_boosted.astype(np.float32) * mask_3ch + gray_bgr.astype(np.float32) * (1 - mask_3ch)

    # Additional desaturation on background
    if bg_desat < 1.0:
        # Make the B&W part even more desaturated
        bg_weight = 1.0 - bg_desat
        result = result * (1 - bg_weight * (1 - mask_3ch)) + gray_bgr.astype(np.float32) * bg_weight * (1 - mask_3ch)

    return np.clip(result, 0, 255).astype(np.uint8)


def apply_grade(frame, saturation=1.0, contrast=1.1, brightness=-0.02):
    """Apply color grading."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * saturation, 0, 255)
    frame = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    frame = cv2.convertScaleAbs(frame, alpha=contrast, beta=brightness * 255)
    return frame


def apply_vignette(frame, strength=0.3):
    """Apply vignette."""
    h, w = frame.shape[:2]
    Y, X = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    r = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    max_r = np.sqrt(cx ** 2 + cy ** 2)
    v = 1 - (r / max_r) * strength
    v = np.clip(v, 0, 1)
    v = cv2.GaussianBlur(v, (51, 51), 0)
    return (frame.astype(np.float32) * v[:, :, np.newaxis]).astype(np.uint8)


def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Selective Color — Real Subject Isolation           ║")
    print("║  Background B&W, Curry in color                    ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    if not os.path.exists(INPUT):
        print(f"❌ Source not found")
        return

    os.makedirs(os.path.dirname(TEMP), exist_ok=True)

    cap = cv2.VideoCapture(INPUT)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Source: {fps:.0f}fps, {total} frames, {total/fps:.1f}s")

    # Background subtractor
    bg_sub = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=40, detectShadows=True)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    # Read all frames
    print("Reading frames...")
    all_frames = {}
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        t = idx / fps
        for start, end, name, _, _ in SHOTS:
            if start <= t < end:
                if name not in all_frames:
                    all_frames[name] = []
                all_frames[name].append(frame)
                break
        idx += 1
    cap.release()
    print(f"  Read {idx} frames, extracted {sum(len(v) for v in all_frames.values())} across {len(all_frames)} shots")

    # Process and write
    print("Processing with subject isolation...")
    out = cv2.VideoWriter(TEMP, cv2.VideoWriter_fourcc(*"mp4v"), 30, (576, 576))

    total_written = 0
    for start, end, name, speed, desat in SHOTS:
        frames = all_frames.get(name, [])
        if not frames:
            print(f"  ⚠️ No frames for {name}")
            continue

        # Speed logic
        if speed >= 1.0:
            step = int(speed)
            dup = 1
        else:
            step = 1
            dup = int(1 / speed)

        written = 0
        for i in range(0, len(frames), step):
            frame = frames[i]
            resized = cv2.resize(frame, (576, 576))

            # Get subject mask
            mask = get_subject_mask(resized, bg_sub, kernel)

            # Apply selective color
            result = selective_color(resized, mask, bg_desat=desat)

            # Apply grade
            sat = 1.2 if desat < 0.5 else 0.9
            contrast = 1.25 if desat < 0.5 else 1.05
            result = apply_grade(result, saturation=sat, contrast=contrast, brightness=-0.03)

            # Vignette on hero shots
            if name.startswith("hero"):
                result = apply_vignette(result, strength=0.35)

            # Write frame (with duplication for slow-mo)
            for _ in range(dup):
                out.write(result)
                written += 1
                total_written += 1

        print(f"  {name}: {len(frames)} src → {written} out (speed={speed}x, bg_desat={desat})")

    out.release()
    print(f"  Total: {total_written} frames = {total_written/30:.1f}s")
    print()

    # Convert with FFmpeg
    print("Converting to H.264...")
    os.system(f'ffmpeg -y -i "{TEMP}" -c:v libx264 -preset fast -pix_fmt yuv420p -b:v 5M -movflags +faststart "{OUTPUT}" 2>/dev/null')

    if os.path.exists(OUTPUT):
        size = os.path.getsize(OUTPUT) / (1024 * 1024)
        # Get duration
        probe = os.popen(f'ffprobe -v quiet -show_entries format=duration -of csv=p=0 "{OUTPUT}"').read().strip()
        print(f"✅ Done!")
        print(f"   Output: {OUTPUT}")
        print(f"   Size: {size:.1f}MB")
        print(f"   Duration: {probe}s")
        os.system(f'open "{OUTPUT}"')
    else:
        print("❌ Conversion failed")


if __name__ == "__main__":
    main()
