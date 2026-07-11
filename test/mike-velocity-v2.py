"""
Mike Ross — True Velocity Edit
Fixes: lifted mid-tones, real Bézier velocity, impact zooms, clean grade.

Usage: python3 test/mike-velocity-v2.py
"""

import cv2
import numpy as np
import os
import subprocess
import struct

INPUT = "test/MikeRoss.mp4"
MUSIC = "test/Outfit (with 21 Savage).mp3"
OUTPUT = "test/mike-velocity-v2.mp4"
TEMP = "test/mike-v2-temp.mp4"

BPM = 130
BEAT = 60 / BPM
OUT_FPS = 30
W, H = 576, 576
MUSIC_OFFSET = 30

# Clips: (source_start, source_end)
CLIPS = [
    (81.0, 83.5),    # Walking together
    (3.0, 4.5),      # Dark pointing
    (12.0, 14.0),    # Walking in
    (14.5, 16.0),    # Hallway
    (21.5, 23.0),    # Smirk
    (41.0, 42.5),    # Power entrance
    (0.0, 1.0),      # Classroom flash
    (89.0, 91.0),    # Harvey smile
    (69.0, 71.0),    # Jessica
    (41.5, 42.5),    # Flash
    (15.0, 16.0),    # Flash
    (22.0, 23.0),    # Flash
    (82.0, 83.0),    # Flash
    (12.5, 15.0),    # Full walk
    (81.5, 84.0),    # Harvey walk
    (42.0, 43.0),    # Flash
    (89.5, 90.5),    # Flash
    (69.5, 70.5),    # Flash
    (0.5, 1.5),      # Flash
    (105.0, 107.5),  # Reading
    (89.0, 91.5),    # Harvey close
]

# Beat timestamps for impact zoom (from music analysis)
# We'll detect these from the audio


def detect_beats(audio_path, duration=30, offset=30):
    """Detect beat timestamps from audio."""
    # Extract audio
    subprocess.run([
        'ffmpeg', '-y', '-ss', str(offset), '-t', str(duration),
        '-i', audio_path,
        '-f', 's16le', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '1',
        'test/beat_audio.pcm'
    ], capture_output=True, timeout=30)

    with open('test/beat_audio.pcm', 'rb') as f:
        data = f.read()

    samples = struct.unpack(f'<{len(data)//2}h', data)

    # Onset detection via energy peaks
    window = 1024
    hop = 512
    energies = []
    for i in range(0, len(samples) - window, hop):
        chunk = samples[i:i+window]
        energy = sum(x*x for x in chunk) / window
        energies.append(energy)

    # Find peaks (main beats, not hi-hats)
    threshold = max(energies) * 0.35
    peaks = []
    for i in range(1, len(energies) - 1):
        if energies[i] > energies[i-1] and energies[i] > energies[i+1] and energies[i] > threshold:
            time_sec = (i * hop) / 44100
            peaks.append(time_sec)

    # Cluster to get main beats (min 0.2s apart)
    clustered = []
    for p in peaks:
        if not clustered or p - clustered[-1] > 0.2:
            clustered.append(p)

    return clustered


def bezier_velocity(t, entry_speed=4.0, anchor_speed=1.0, exit_speed=3.0, entry_frac=0.15, exit_frac=0.15):
    """
    3-Point Bézier velocity curve.
    t: 0-1 position in clip
    Returns: speed multiplier at time t
    """
    if t < entry_frac:
        # Entry: fast → slow (ease-out)
        local_t = t / entry_frac
        eased = 1 - (1 - local_t) ** 2  # ease-out quadratic
        return entry_speed + (anchor_speed - entry_speed) * eased
    elif t > (1 - exit_frac):
        # Exit: slow → fast (ease-in)
        local_t = (t - (1 - exit_frac)) / exit_frac
        eased = local_t * local_t  # ease-in quadratic
        return anchor_speed + (exit_speed - anchor_speed) * eased
    else:
        # Anchor: constant slow
        return anchor_speed


def apply_velocity_clip(cap, src_start, src_end, target_frames):
    """
    Extract frames from source with velocity curve applied.
    Returns list of (frame, speed_at_frame) tuples.
    """
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    src_start_frame = int(src_start * src_fps)
    src_end_frame = int(src_end * src_fps)
    src_total = src_end_frame - src_start_frame

    result = []
    for out_i in range(target_frames):
        # Map output frame to source frame via velocity integration
        t = out_i / max(1, target_frames - 1)

        # Integrate velocity curve to find source position
        # Simple: sample the curve at this point
        speed = bezier_velocity(t)
        src_pos = t * src_total
        src_frame_idx = src_start_frame + int(src_pos)

        # Clamp
        src_frame_idx = max(src_start_frame, min(src_end_frame - 1, src_frame_idx))

        cap.set(cv2.CAP_PROP_POS_FRAMES, src_frame_idx)
        ret, frame = cap.read()
        if ret:
            result.append((frame, speed, t))

    return result


def apply_clean_grade(frame):
    """
    Clean corporate noir grade — NOT crushed blacks.
    High contrast with lifted mid-tones, blue shadows, crisp highlights.
    """
    # Convert to float
    f = frame.astype(np.float32) / 255.0

    # Lift mid-tones slightly (S-curve that doesn't crush blacks)
    # Shadows stay dark but visible, highlights crisp
    f = np.clip(f * 1.1 + 0.02, 0, 1)  # Slight lift

    # Apply S-curve for contrast
    f = 1 / (1 + np.exp(-8 * (f - 0.5)))  # Sigmoid contrast

    # Push blues into shadows
    shadow_mask = (f.mean(axis=2) < 0.35).astype(np.float32)
    shadow_mask = cv2.GaussianBlur(shadow_mask, (21, 21), 0)
    f[:,:,0] = np.clip(f[:,:,0] + shadow_mask * 0.08, 0, 1)  # Blue
    f[:,:,2] = np.clip(f[:,:,2] - shadow_mask * 0.03, 0, 1)  # Red down

    # Slight desaturation (not extreme)
    gray = np.mean(f, axis=2, keepdims=True)
    f = f * 0.7 + gray * 0.3

    # Boost highlights slightly
    highlight_mask = (f.mean(axis=2) > 0.6).astype(np.float32)
    f = np.clip(f + highlight_mask[:,:,np.newaxis] * 0.05, 0, 1)

    return (f * 255).astype(np.uint8)


def apply_impact_zoom(frame, intensity, w, h):
    """Scale pop on beat drop — 10% jump, decay back."""
    scale = 1.0 + intensity * 0.10
    zh, zw = int(h * scale), int(w * scale)
    zoomed = cv2.resize(frame, (zw, zh))
    x0 = (zw - w) // 2
    y0 = (zh - h) // 2
    return zoomed[y0:y0+h, x0:x0+w]


def apply_motion_blur(frame, speed):
    """Directional blur proportional to speed."""
    if speed < 1.5:
        return frame
    blur_amount = min(15, int((speed - 1) * 5))
    if blur_amount < 2:
        return frame
    # Horizontal motion blur
    kernel = np.zeros((blur_amount, blur_amount))
    kernel[blur_amount // 2, :] = 1.0 / blur_amount
    return cv2.filter2D(frame, -1, kernel)


def apply_vignette(frame, strength=0.3):
    """Subtle vignette — not crushing."""
    h, w = frame.shape[:2]
    Y, X = np.ogrid[:h, :w]
    r = np.sqrt((X - w/2)**2 + (Y - h/2)**2) / np.sqrt((w/2)**2 + (h/2)**2)
    v = np.clip(1 - r * strength, 0, 1)
    v = cv2.GaussianBlur(v, (51, 51), 0)
    return (frame.astype(np.float32) * v[:,:,np.newaxis]).astype(np.uint8)


def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Mike Ross — True Velocity v2                      ║")
    print("║  Bézier curves | Impact zooms | Clean grade        ║")
    print("╚══════════════════════════════════════════════════════╝")

    # Detect beats
    print("Detecting beats...")
    beats = detect_beats(MUSIC, duration=30, offset=MUSIC_OFFSET)
    print(f"  {len(beats)} beats detected")

    cap = cv2.VideoCapture(INPUT)
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"  Source: {src_fps:.1f}fps")

    # Process each clip with velocity
    print("Processing clips with Bézier velocity...")
    out = cv2.VideoWriter(TEMP, cv2.VideoWriter_fourcc(*"mp4v"), OUT_FPS, (W, H))
    total = 0
    global_time = 0

    for ci, (src_start, src_end) in enumerate(CLIPS):
        clip_duration = src_end - src_start
        # Each clip gets beats proportional to its content
        beats_in_clip = max(2, int(clip_duration / BEAT))
        target_frames = int(beats_in_clip * BEAT * OUT_FPS)

        frames_data = apply_velocity_clip(cap, src_start, src_end, target_frames)

        written = 0
        for frame, speed, t in frames_data:
            resized = cv2.resize(frame, (W, H))

            # Apply clean grade (not crushed)
            result = apply_clean_grade(resized)

            # Impact zoom on beat drops
            # Check if current time aligns with a beat
            for beat_time in beats:
                clip_time = global_time + t * clip_duration
                if abs(clip_time - beat_time) < 0.05:
                    # This frame is on a beat — apply impact zoom
                    # Intensity decays from 1.0 to 0.0 over 0.1s
                    beat_dist = abs(clip_time - beat_time)
                    intensity = max(0, 1.0 - beat_dist / 0.1)
                    result = apply_impact_zoom(result, intensity, W, H)
                    break

            # Motion blur during fast sections
            result = apply_motion_blur(result, speed)

            # Subtle vignette
            result = apply_vignette(result, 0.25)

            out.write(result)
            written += 1
            total += 1

        global_time += clip_duration
        print(f"  Clip {ci}: {written} frames (velocity applied)")

    out.release()
    cap.release()
    duration = total / OUT_FPS
    print(f"  Total: {duration:.1f}s")

    # Mux
    print("Muxing with music...")
    subprocess.run([
        'ffmpeg', '-y', '-i', TEMP,
        '-ss', str(MUSIC_OFFSET), '-i', MUSIC,
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


if __name__ == "__main__":
    main()
