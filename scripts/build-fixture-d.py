"""Build the YouTube talking-head eval fixture (Fixture D).

Generates synthetic talking-head footage with a known transcript
and reference cut points, then produces the truth-set triple:
  - transcript.json (ground-truth word timings)
  - reference_cuts.json (sentence-boundary cut times from a human-style edit)
  - footage.mp4 (the assembled talking-head clip)

Usage:
    python scripts/build-fixture-d.py
    # Produces tests/fixtures/youtube_talking_head/
"""

import json
import math
import os
import shutil
import subprocess
from pathlib import Path

FIXTURE_DIR = Path("tests/fixtures/youtube_talking_head")
TARGET_DURATION = 45.0
TARGET_WIDTH = 1280
TARGET_HEIGHT = 720
TARGET_FPS = 30

# The monologue text — 4 sentences with natural pauses.
SENTENCES = [
    "Today I want to talk about how artificial intelligence is transforming video editing.",
    "The key insight is that good editing follows patterns we can measure and replicate.",
    "By analyzing reference edits we extract a style profile that captures pacing color and motion.",
    "Then we apply that profile to new footage automatically producing consistent results every time.",
]

EMPHASIS_WORDS = ["artificial intelligence", "key insight", "patterns", "automatically"]
PAUSE_AFTER_SENTENCE = 0.6


def _get_audio_duration(path: str) -> float:
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", path,
    ], capture_output=True, text=True, timeout=10)
    return float(json.loads(probe.stdout)["format"]["duration"])


def _gen_speech_audio(sentences: list[str]) -> list[dict]:
    """Generate TTS audio per sentence and measure exact durations.

    Returns per-sentence metadata with word timings estimated from
    measured sentence duration.
    """
    sentence_meta = []
    current_start = 0.0

    for i, text in enumerate(sentences):
        tmp = f"/tmp/dialogue_sentence_{i}.aiff"
        subprocess.run(["say", "-o", tmp, "-v", "Samantha", f"[[rate 85]] {text}"],
                       capture_output=True, timeout=60)
        dur = _get_audio_duration(tmp)

        end = current_start + dur

        # Estimate word timings: distribute each word proportionally
        # within the sentence duration based on character count
        words = text.split()
        total_chars = sum(len(w) for w in words)
        word_timings = []
        word_start = 0.0
        for w in words:
            word_dur = (len(w) / total_chars) * dur if total_chars > 0 else dur / len(words)
            word_timings.append({
                "word": w,
                "start": round(word_start + current_start, 3),
                "end": round(word_start + word_dur + current_start, 3),
                "confidence": 1.0,
            })
            word_start += word_dur

        sentence_meta.append({
            "index": i,
            "text": text,
            "start": round(current_start, 3),
            "end": round(end, 3),
            "duration": round(dur, 3),
            "words": word_timings,
        })

        current_start = end + PAUSE_AFTER_SENTENCE

    return sentence_meta


def _build_video(footage_source: str, sentence_meta: list[dict], output_path: str):
    """Combine source footage with TTS speech audio."""
    # Generate silence for pauses between sentences
    silence_parts = []
    for i, s in enumerate(sentence_meta):
        silence_parts.append(("speech", s["index"]))
        if i < len(sentence_meta) - 1 and PAUSE_AFTER_SENTENCE > 0:
            silence_parts.append(("silence", PAUSE_AFTER_SENTENCE))

    # Build concat list for all audio segments
    concat_file = "/tmp/dialogue_concat.txt"
    with open(concat_file, "w") as f:
        for part_type, part_data in silence_parts:
            if part_type == "speech":
                f.write(f"file '/tmp/dialogue_sentence_{part_data}.aiff'\n")
            elif part_type == "silence":
                sil_file = f"/tmp/dialogue_silence_{len(silence_parts)}.wav"
                subprocess.run([
                    "ffmpeg", "-y", "-f", "lavfi",
                    "-i", f"anullsrc=r=44100:cl=mono",
                    "-t", str(part_data), sil_file,
                ], capture_output=True, timeout=10)
                f.write(f"file '{sil_file}'\n")

    speech_audio = "/tmp/dialogue_speech.wav"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-c:a", "pcm_s16le", speech_audio,
    ], capture_output=True, timeout=30)

    speech_dur = _get_audio_duration(speech_audio)

    # Pick footage segment covering speech duration — LOOP source if needed
    tmp_video = "/tmp/dialogue_video.mp4"
    video_dur = min(speech_dur + 2.0, TARGET_DURATION)
    subprocess.run([
        "ffmpeg", "-y",
        "-stream_loop", "-1",
        "-i", footage_source,
        "-t", str(video_dur),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-vf", (
            f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease,"
            f"pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={TARGET_FPS}"
        ),
        "-an", tmp_video,
    ], capture_output=True, timeout=60)

    # Mix speech audio with video
    final_video_dur = min(speech_dur, TARGET_DURATION)
    subprocess.run([
        "ffmpeg", "-y",
        "-i", tmp_video,
        "-i", speech_audio,
        "-t", str(final_video_dur),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest", output_path,
    ], capture_output=True, timeout=60)

    # Cleanup
    for p in [tmp_video, speech_audio, concat_file]:
        if os.path.exists(p):
            os.remove(p)


def _build_transcript(sentence_meta: list[dict]) -> dict:
    all_words = []
    all_sentences = []
    for s in sentence_meta:
        all_sentences.append({
            "text": s["text"],
            "start": s["start"],
            "end": s["end"],
        })
        for w in s["words"]:
            all_words.append(w)

    total_dur = sentence_meta[-1]["end"] + PAUSE_AFTER_SENTENCE if sentence_meta else 0
    total_speech = sum(s["duration"] for s in sentence_meta)

    return {
        "words": all_words,
        "sentences": all_sentences,
        "language": "en",
        "duration": round(total_dur, 3),
        "speech_regions": [
            {"start": s["start"], "end": s["end"], "duration": s["duration"]}
            for s in sentence_meta
        ],
        "speech_coverage": round(total_speech / max(total_dur, 1), 3) if total_dur > 0 else 0,
        "dead_air": [
            {"start": round(s["end"], 3), "end": round(s["end"] + PAUSE_AFTER_SENTENCE, 3),
             "duration": round(PAUSE_AFTER_SENTENCE, 3)}
            for s in sentence_meta[:-1]
        ],
        "emphasis": [
            {"word": ew, "start": 0, "end": 0, "score": 2.0}
            for ew in EMPHASIS_WORDS
        ],
    }


def _build_reference_cuts(sentence_meta: list[dict]) -> list[float]:
    """Reference cuts in output timebase (dead air compressed).

    In output timebase, each pause between sentences is removed from the
    cumulative duration. The offset accumulates:
      Cut N = S[N]_end - N * PAUSE_AFTER_SENTENCE

    So the reference cut times match what the dialogue director should
    produce after dead-air compression.
    """
    cuts = []
    for i, s in enumerate(sentence_meta):
        compressed_end = s["end"] - i * PAUSE_AFTER_SENTENCE
        if compressed_end < TARGET_DURATION:
            cuts.append(round(compressed_end, 2))
    return cuts


def main():
    os.makedirs(FIXTURE_DIR, exist_ok=True)

    fixture_c = Path("tests/fixtures/fixture-c/footage.mp4")
    if not fixture_c.exists():
        print("ERROR: tests/fixtures/fixture-c/footage.mp4 not found")
        return 1

    print("Generating TTS speech audio (4 sentences)...")
    sentence_meta = _gen_speech_audio(SENTENCES)

    print("Building talking-head video...")
    footage_path = FIXTURE_DIR / "footage.mp4"
    _build_video(str(fixture_c), sentence_meta, str(footage_path))

    print("Writing transcript.json...")
    transcript = _build_transcript(sentence_meta)
    with open(FIXTURE_DIR / "transcript.json", "w") as f:
        json.dump(transcript, f, indent=2)

    print("Writing reference_cuts.json...")
    ref_cuts = _build_reference_cuts(sentence_meta)
    with open(FIXTURE_DIR / "reference_cuts.json", "w") as f:
        json.dump({"cuts": ref_cuts, "source": "sentence_boundary"}, f, indent=2)

    # Use dialogue profile instead of fixture-c's montage profile
    dialogue_profile = {
        "profile_id": "youtube_dialogue",
        "pacing": {
            "avg_shot_duration": 5.0,
            "cut_to_beat_alignment_rate": 0.0,
            "energy_curve_shape": "flat",
        },
        "text_overlay": {
            "frequency_per_minute": 0.0,
            "typical_duration": 0.0,
            "typical_role": "none",
        },
        "transition_preferences": {
            "hard_cut": 1.0,
            "crossfade": 0.0,
            "whip_pan": 0.0,
            "zoom_transition": 0.0,
            "fade_to_black": 0.0,
        },
    }
    with open(FIXTURE_DIR / "profile.json", "w") as f:
        json.dump(dialogue_profile, f, indent=2)

    print(f"\n=== Fixture D built ===")
    print(f"Footage: {footage_path} ({os.path.getsize(footage_path)/1024:.0f}KB)")
    print(f"Words: {len(transcript['words'])} in {len(sentence_meta)} sentences")
    print(f"Duration: {transcript['duration']}s")
    print(f"Reference cuts: {len(ref_cuts)} → {ref_cuts}")

    return 0


if __name__ == "__main__":
    exit(main())
