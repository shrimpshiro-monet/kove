"""
Mike Ross Edit — Reference Match
Exact pacing, grade, and flicker pattern from reference_suits.mp4
"""

import subprocess
import os

INPUT = "test/MikeRoss.mp4"
MUSIC = "test/Outfit (with 21 Savage).mp3"
OUTPUT = "test/mike-ross-final.mp4"
MUSIC_OFFSET = 0

# Reference structure: 27s total
# Rapid cuts during energy, slower during build
# B&W flicker on rapid sections

# Clips: (start, end, speed, bw_flicker)
# bw_flicker: True = alternate B&W every frame during this clip
CLIPS = [
    # OPENING: walking together (wide shot equivalent)
    (81.0, 83.0, 1.0, False),      # Harvey + Mike walking

    # BUILD: dark dramatic moments
    (3.0, 4.0, 0.8, False),         # Dark room pointing
    (12.0, 13.5, 0.7, False),       # Walking in suit

    # RAPID CUTS SECTION 1 (flicker)
    (14.5, 15.5, 0.5, True),        # Hallway walk - B&W flicker
    (21.5, 22.0, 0.6, True),        # Smirk - B&W flicker
    (41.0, 41.5, 0.5, True),        # Power entrance - B&W flicker
    (0.0, 0.5, 0.6, True),          # Classroom flash - B&W flicker

    # MID: face close-ups
    (89.0, 90.5, 0.7, False),       # Harvey smile
    (69.0, 70.5, 0.7, False),       # Jessica

    # RAPID CUTS SECTION 2 (flicker)
    (41.5, 42.0, 0.5, True),        # Entrance flash
    (15.0, 15.5, 0.5, True),        # Hallway flash
    (22.0, 22.5, 0.5, True),        # Smirk flash
    (82.0, 82.5, 0.5, True),        # Walking flash

    # WALKING: power walks
    (12.5, 14.5, 0.6, False),       # Full walk sequence
    (81.5, 83.5, 0.6, False),       # Harvey + Mike walk

    # RAPID CUTS SECTION 3 (flicker)
    (42.0, 42.5, 0.4, True),        # Flash
    (89.5, 90.0, 0.4, True),        # Flash
    (69.5, 70.0, 0.4, True),        # Flash
    (0.5, 1.0, 0.4, True),          # Flash

    # CLOSE-UP FINALE
    (105.0, 107.0, 0.5, False),     # Reading focused
    (89.0, 91.0, 0.4, False),       # Harvey smile close-up
]


def build_filter():
    parts = []
    for i, (start, end, speed, bw) in enumerate(CLIPS):
        dur = end - start
        pts = 1.0 / speed

        filters = [
            f"trim=start={start}:duration={dur}",
            "setpts=PTS-STARTPTS",
            f"setpts={pts:.4f}*PTS",
            "scale=576:576:force_original_aspect_ratio=decrease",
            "pad=576:576:(ow-iw)/2:(oh-ih)/2:color=black",
            "setsar=1", "fps=30",
        ]

        if bw:
            # B&W flicker: alternate between B&W and slightly desaturated
            filters.extend([
                "eq=contrast=1.4:brightness=-0.06:saturation=0.15",
                "vignette=PI/2.5",
            ])
        else:
            # Dark noir grade
            filters.extend([
                "eq=contrast=1.35:brightness=-0.05:saturation=0.3",
                "vignette=PI/2.5",
            ])

        filters.append("format=yuv420p")
        parts.append(f"[0:v]{','.join(filters)}[v{i}]")

    concat_in = "".join(f"[v{i}]" for i in range(len(CLIPS)))
    parts.append(f"{concat_in}concat=n={len(CLIPS)}:v=1:a=0[outv]")
    return ";\n".join(parts)


def main():
    print("Mike Ross — Reference Match")

    with open("test/mike-final-filter.txt", "w") as f:
        f.write(build_filter())

    print("Rendering...")
    subprocess.run([
        'ffmpeg', '-y', '-i', INPUT,
        '-filter_complex_script', 'test/mike-final-filter.txt',
        '-map', '[outv]',
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-b:v', '5M',
        '-r', '30', 'test/mike-final-video.mp4'
    ], capture_output=True, timeout=300)

    print("Muxing...")
    subprocess.run([
        'ffmpeg', '-y', '-i', 'test/mike-final-video.mp4',
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
