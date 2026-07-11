"""
Mike Ross Noir v3 — FFmpeg-based
Flicker B&W, speed ramps, chorus start.
"""

import subprocess
import os

INPUT = "test/MikeRoss.mp4"
MUSIC = "test/Outfit (with 21 Savage).mp3"
OUTPUT = "test/mike-ross-noir-v3.mp4"
MUSIC_OFFSET = 30

# Clips: (start, end, speed)
CLIPS = [
    (0.0, 2.0, 1.0),
    (12.0, 14.5, 0.5),
    (14.5, 17.5, 0.3),
    (21.5, 24.0, 0.4),
    (41.0, 44.0, 0.35),
    (61.0, 63.5, 0.45),
    (69.0, 71.5, 0.4),
    (81.0, 84.0, 0.35),
    (89.0, 92.0, 0.3),
]


def build_filter():
    parts = []

    for i, (start, end, speed) in enumerate(CLIPS):
        dur = end - start
        pts_factor = 1.0 / speed

        filters = [
            f"trim=start={start}:duration={dur}",
            "setpts=PTS-STARTPTS",
            f"setpts={pts_factor:.4f}*PTS",
            "scale=1280:720:force_original_aspect_ratio=decrease",
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black",
            "setsar=1",
            "fps=30",
            # Noir: high contrast, desaturation
            "eq=contrast=1.3:brightness=-0.04:saturation=0.25",
            # Vignette
            "vignette=PI/3",
            "format=yuv420p",
        ]

        parts.append(f"[0:v]{','.join(filters)}[v{i}]")

    concat_in = "".join(f"[v{i}]" for i in range(len(CLIPS)))
    parts.append(f"{concat_in}concat=n={len(CLIPS)}:v=1:a=0[outv]")

    return ";\n".join(parts)


def main():
    print("Mike Ross Noir v3")

    filter_graph = build_filter()
    filter_path = "test/mike-noir-v3-filter.txt"
    with open(filter_path, "w") as f:
        f.write(filter_graph)

    print("Rendering...")
    result = subprocess.run([
        'ffmpeg', '-y', '-i', INPUT,
        '-filter_complex_script', filter_path,
        '-map', '[outv]',
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-b:v', '5M',
        '-r', '30',
        'test/mike-noir-v3-video.mp4'
    ], capture_output=True, text=True, timeout=300)

    if result.returncode != 0:
        print("Failed:", result.stderr[-500:])
        return

    print("Muxing...")
    subprocess.run([
        'ffmpeg', '-y',
        '-i', 'test/mike-noir-v3-video.mp4',
        '-ss', str(MUSIC_OFFSET), '-i', MUSIC,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', '-movflags', '+faststart', OUTPUT
    ], capture_output=True, timeout=60)

    if os.path.exists(OUTPUT):
        sz = os.path.getsize(OUTPUT) / (1024*1024)
        dur = subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUTPUT],
                           capture_output=True, text=True).stdout.strip()
        print(f"✅ {OUTPUT} — {sz:.1f}MB, {dur}s")
        os.system(f'open "{OUTPUT}"')


if __name__ == "__main__":
    main()
