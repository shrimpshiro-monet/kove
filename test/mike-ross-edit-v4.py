"""
Mike Ross Noir v4 — 20 seconds, tight cuts
"""

import subprocess
import os

INPUT = "test/MikeRoss.mp4"
MUSIC = "test/Outfit (with 21 Savage).mp3"
OUTPUT = "test/mike-ross-noir-v4.mp4"
MUSIC_OFFSET = 30

# Clips: (start, end, speed) — tighter, less slow-mo
# Total target: ~20s
CLIPS = [
    (0.0, 1.5, 1.0),       # Underdog (1.5s)
    (12.0, 13.5, 0.7),      # Walk in (1.5s * 1/0.7 = 2.1s)
    (14.5, 16.5, 0.5),      # Hallway walk (2s * 2 = 4s) — peak aura
    (21.5, 23.0, 0.6),      # Smirk (1.5s * 1.67 = 2.5s)
    (41.0, 42.5, 0.5),      # Power entrance (1.5s * 2 = 3s)
    (69.0, 70.5, 0.7),      # Jessica (1.5s * 1.43 = 2.1s)
    (81.0, 82.5, 0.6),      # Harvey + Mike (1.5s * 1.67 = 2.5s)
    (89.0, 90.5, 0.5),      # Harvey smile (1.5s * 2 = 3s)
]
# Total: ~21s


def build_filter():
    parts = []
    for i, (start, end, speed) in enumerate(CLIPS):
        dur = end - start
        pts = 1.0 / speed
        filters = [
            f"trim=start={start}:duration={dur}",
            "setpts=PTS-STARTPTS",
            f"setpts={pts:.4f}*PTS",
            "scale=1280:720:force_original_aspect_ratio=decrease",
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black",
            "setsar=1", "fps=30",
            "eq=contrast=1.3:brightness=-0.04:saturation=0.25",
            "vignette=PI/3",
            "format=yuv420p",
        ]
        parts.append(f"[0:v]{','.join(filters)}[v{i}]")

    concat_in = "".join(f"[v{i}]" for i in range(len(CLIPS)))
    parts.append(f"{concat_in}concat=n={len(CLIPS)}:v=1:a=0[outv]")
    return ";\n".join(parts)


def main():
    print("Mike Ross Noir v4 — 20s tight")
    with open("test/mike-noir-v4-filter.txt", "w") as f:
        f.write(build_filter())

    subprocess.run([
        'ffmpeg', '-y', '-i', INPUT,
        '-filter_complex_script', 'test/mike-noir-v4-filter.txt',
        '-map', '[outv]',
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-b:v', '5M',
        '-r', '30', 'test/mike-noir-v4-video.mp4'
    ], capture_output=True, timeout=300)

    subprocess.run([
        'ffmpeg', '-y', '-i', 'test/mike-noir-v4-video.mp4',
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
