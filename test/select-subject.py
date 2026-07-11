"""
Interactive Subject Selector
Click on the subject (Steph Curry) to mark the center.
Then it auto-generates a mask using GrabCut and applies selective color.

Usage: python3 test/select-subject.py
"""

import cv2
import numpy as np
import os
import sys

INPUT = os.path.join(os.path.dirname(__file__), "High Quality Steph Curry Clips for Edits! (2024-25).mp4")
OUTPUT = os.path.join(os.path.dirname(__file__), "steph-curry-subject-isolated.mp4")
TEMP = os.path.join(os.path.dirname(__file__), "sc-frames", "temp_subject.mp4")
MASK_DIR = os.path.join(os.path.dirname(__file__), "sc-frames", "masks")

# Shot definitions
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


class SubjectMarker:
    """Interactive subject marking tool."""

    def __init__(self, frame):
        self.frame = frame.copy()
        self.display = frame.copy()
        self.points = []
        self.done = False
        self.window = "Click on subject (Curry) — Press ENTER when done, ESC to cancel"

    def mouse_callback(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.points.append((x, y))
            # Draw marker
            cv2.circle(self.display, (x, y), 8, (0, 255, 0), -1)
            cv2.circle(self.display, (x, y), 12, (0, 200, 0), 2)
            # Draw lines between points
            if len(self.points) > 1:
                cv2.line(self.display, self.points[-2], self.points[-1], (0, 255, 0), 2)
            cv2.imshow(self.window, self.display)

        elif event == EVENT_MOUSEWHEEL:
            # Scroll to undo last point
            if self.points:
                self.points.pop()
                self.display = self.frame.copy()
                for i, p in enumerate(self.points):
                    cv2.circle(self.display, p, 8, (0, 255, 0), -1)
                    cv2.circle(self.display, p, 12, (0, 200, 0), 2)
                    if i > 0:
                        cv2.line(self.display, self.points[i-1], self.points[i], (0, 255, 0), 2)
                cv2.imshow(self.window, self.display)

    def mark(self):
        """Open window for user to mark subject. Returns list of points."""
        cv2.namedWindow(self.window, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(self.window, 800, 600)
        cv2.setMouseCallback(self.window, self.mouse_callback)
        cv2.imshow(self.window, self.display)

        print("  Click on the subject to mark center points")
        print("  Press ENTER when done, ESC to cancel, scroll to undo")

        while True:
            key = cv2.waitKey(0) & 0xFF
            if key == 13:  # ENTER
                break
            elif key == 27:  # ESC
                self.points = []
                break

        cv2.destroyAllWindows()
        return self.points


def generate_mask_from_points(frame, points, padding=80):
    """Generate a mask from marked points using GrabCut."""
    h, w = frame.shape[:2]

    if not points:
        # Fallback: center mask
        mask = np.zeros((h, w), np.uint8)
        cx, cy = w // 2, h // 2
        cv2.circle(mask, (cx, cy), min(w, h) // 3, 255, -1)
        return mask

    # Create initial mask from points
    init_mask = np.zeros((h, w), np.uint8)

    # Draw circles at each point
    for px, py in points:
        cv2.circle(init_mask, (px, py), padding, 255, -1)

    # Dilate to connect points
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))
    init_mask = cv2.dilate(init_mask, kernel, iterations=2)

    # Get bounding box of all points
    all_x = [p[0] for p in points]
    all_y = [p[1] for p in points]
    x1 = max(0, min(all_x) - padding)
    y1 = max(0, min(all_y) - padding)
    x2 = min(w, max(all_x) + padding)
    y2 = min(h, max(all_y) + padding)

    # GrabCut with the initial mask
    gc_mask = np.zeros((h, w), np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    # Set the initial mask
    gc_mask[init_mask > 0] = cv2.GC_PR_FGD  # Probable foreground
    gc_mask[init_mask == 0] = cv2.GC_BGD     # Background

    # Run GrabCut
    rect = (x1, y1, x2 - x1, y2 - y1)
    try:
        cv2.grabCut(frame, gc_mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
    except:
        # Fallback if GrabCut fails
        pass

    # Extract final mask
    final_mask = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # Clean up mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    final_mask = cv2.morphologyEx(final_mask, cv2.MORPH_CLOSE, kernel, iterations=3)
    final_mask = cv2.morphologyEx(final_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    final_mask = cv2.GaussianBlur(final_mask, (11, 11), 0)

    return final_mask


def apply_selective_color(frame, mask, bg_desat=0.3):
    """Subject in color, background desaturated."""
    # Boost subject saturation
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.15, 0, 255)
    color_boosted = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # B&W version
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    # Blend
    mask_f = mask.astype(np.float32) / 255.0
    mask_f = cv2.GaussianBlur(mask_f, (7, 7), 0)
    mask_3ch = np.stack([mask_f] * 3, axis=-1)

    result = color_boosted.astype(np.float32) * mask_3ch + gray_bgr.astype(np.float32) * (1 - mask_3ch)

    # Extra desaturation on background
    bg_weight = 1.0 - bg_desat
    result = result * (1 - bg_weight * (1 - mask_3ch)) + gray_bgr.astype(np.float32) * bg_weight * (1 - mask_3ch)

    return np.clip(result, 0, 255).astype(np.uint8)


def apply_grade(frame, saturation=1.0, contrast=1.1, brightness=-0.02):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * saturation, 0, 255)
    frame = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    frame = cv2.convertScaleAbs(frame, alpha=contrast, beta=brightness * 255)
    return frame


def apply_vignette(frame, strength=0.3):
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
    print("║  Interactive Subject Selector                      ║")
    print("║  Click on Curry → Perfect mask → Selective color   ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    if not os.path.exists(INPUT):
        print(f"❌ Source not found")
        return

    os.makedirs(MASK_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(TEMP), exist_ok=True)

    # Step 1: Show a frame for marking
    print("Step 1: Select subject")
    print("  A window will open — click on Steph Curry to mark him")
    print("  Press ENTER when done, ESC to cancel")
    print()

    cap = cv2.VideoCapture(INPUT)
    fps = cap.get(cv2.CAP_PROP_FPS)

    # Show frame from the hero section for marking
    mark_frame_idx = int(10.0 * fps)  # 10 seconds in
    cap.set(cv2.CAP_PROP_POS_FRAMES, mark_frame_idx)
    ret, mark_frame = cap.read()
    if not ret:
        print("❌ Could not read frame")
        return

    # Resize for display
    display_frame = cv2.resize(mark_frame, (800, 600))

    # Run marker
    marker = SubjectMarker(display_frame)
    points = marker.mark()

    if not points:
        print("  No points marked — using auto-detection fallback")
        # Fallback: detect largest moving object
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        bg_sub = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=40)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

        # Read a few frames to build background model
        for _ in range(30):
            ret, f = cap.read()
            if not ret:
                break
            f_small = cv2.resize(f, (576, 576))
            bg_sub.apply(f_small)

        # Now get mask from a hero frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(10.0 * fps))
        ret, hero_frame = cap.read()
        if ret:
            hero_small = cv2.resize(hero_frame, (576, 576))
            fg = bg_sub.apply(hero_small)
            _, fg = cv2.threshold(fg, 200, 255, cv2.THRESH_BINARY)
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
            fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k, iterations=3)
            fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, k, iterations=1)
            fg = cv2.GaussianBlur(fg, (15, 15), 0)

            # Save mask
            mask_path = os.path.join(MASK_DIR, "auto_mask.npy")
            np.save(mask_path, fg)
            print(f"  Auto-mask saved: {mask_path}")
    else:
        # Generate mask from points
        print(f"\n  Marked {len(points)} points — generating mask...")

        # Generate mask on the marking frame
        scale_x = 576 / 800
        scale_y = 576 / 600
        scaled_points = [(int(x * scale_x), int(y * scale_y)) for x, y in points]

        small_frame = cv2.resize(mark_frame, (576, 576))
        mask = generate_mask_from_points(small_frame, scaled_points, padding=60)

        # Save mask
        mask_path = os.path.join(MASK_DIR, "subject_mask.npy")
        np.save(mask_path, mask)
        print(f"  Mask saved: {mask_path}")

        # Show preview
        preview = small_frame.copy()
        mask_overlay = np.zeros_like(preview)
        mask_overlay[:, :, 1] = mask  # Green channel
        preview = cv2.addWeighted(preview, 0.7, mask_overlay, 0.3, 0)
        cv2.putText(preview, "MASK PREVIEW — press any key", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.imshow("Mask Preview", preview)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

    # Step 2: Process video with the mask
    print("\nStep 2: Processing video with subject isolation...")

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    # Load mask
    mask_path = os.path.join(MASK_DIR, "subject_mask.npy")
    if not os.path.exists(mask_path):
        mask_path = os.path.join(MASK_DIR, "auto_mask.npy")
    if not os.path.exists(mask_path):
        print("❌ No mask available")
        return

    saved_mask = np.load(mask_path)

    # Process video
    bg_sub = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=40, detectShadows=True)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    # Build background model
    print("  Building background model...")
    for _ in range(30):
        ret, f = cap.read()
        if not ret:
            break
        f_small = cv2.resize(f, (576, 576))
        bg_sub.apply(f_small)

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    # Read all frames
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
    print(f"  Read {idx} frames")

    # Process and write
    print("  Rendering with selective color...")
    out = cv2.VideoWriter(TEMP, cv2.VideoWriter_fourcc(*"mp4v"), 30, (576, 576))

    total_written = 0
    for start, end, name, speed, desat in SHOTS:
        frames = all_frames.get(name, [])
        if not frames:
            continue

        step = max(1, int(speed)) if speed >= 1 else 1
        dup = max(1, int(1 / speed)) if speed < 1 else 1

        written = 0
        for i in range(0, len(frames), step):
            frame = frames[i]
            resized = cv2.resize(frame, (576, 576))

            # Get dynamic mask from background subtraction
            fg = bg_sub.apply(resized)
            _, fg = cv2.threshold(fg, 200, 255, cv2.THRESH_BINARY)
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
            fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k, iterations=2)
            fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, k, iterations=1)

            # Combine with user-drawn mask
            # The user mask provides the general area, dynamic mask refines it
            combined = cv2.bitwise_or(fg, saved_mask)
            combined = cv2.GaussianBlur(combined, (11, 11), 0)

            # Apply selective color
            result = apply_selective_color(resized, combined, bg_desat=desat)

            # Grade
            sat = 1.2 if desat < 0.5 else 0.9
            contrast = 1.25 if desat < 0.5 else 1.05
            result = apply_grade(result, saturation=sat, contrast=contrast, brightness=-0.03)

            # Vignette
            if name.startswith("hero"):
                result = apply_vignette(result, strength=0.35)

            for _ in range(dup):
                out.write(result)
                written += 1
                total_written += 1

        print(f"    {name}: {len(frames)} → {written}")

    out.release()
    print(f"  Total: {total_written} frames = {total_written/30:.1f}s")

    # Convert
    print("\nConverting to H.264...")
    os.system(f'ffmpeg -y -i "{TEMP}" -c:v libx264 -preset fast -pix_fmt yuv420p -b:v 5M -movflags +faststart "{OUTPUT}" 2>/dev/null')

    if os.path.exists(OUTPUT):
        size = os.path.getsize(OUTPUT) / (1024 * 1024)
        probe = os.popen(f'ffprobe -v quiet -show_entries format=duration -of csv=p=0 "{OUTPUT}"').read().strip()
        print(f"\n✅ Done!")
        print(f"   Output: {OUTPUT}")
        print(f"   Size: {size:.1f}MB")
        print(f"   Duration: {probe}s")
        os.system(f'open "{OUTPUT}"')
    else:
        print("❌ Conversion failed")


if __name__ == "__main__":
    main()
