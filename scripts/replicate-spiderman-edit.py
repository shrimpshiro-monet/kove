#!/usr/bin/env python3
"""
Standalone SPIDERMAN Edit Replicator
Uses reference analysis data to generate an EDL in the same editing style.
"""

import json
import os
import sys
import base64
import ssl
import urllib.request
import urllib.error
import subprocess
import tempfile
from pathlib import Path

# ── Config ───────────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip("<>")
MODEL = "google/gemini-3.1-flash-lite"
WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
FOOTAGE = WORKSPACE / "testfiles" / "High Quality Steph Curry Clips for Edits! (2024-25).mp4"
MUSIC = WORKSPACE / "testfiles" / "Outfit (with 21 Savage).mp3"
OUTPUT_DIR = WORKSPACE / "output"
REFERENCE_STYLE_FILE = WORKSPACE / "src" / "server" / "data" / "reference-catalog.json"

# ── Reference Style (from SPIDERMAN analysis) ────────────────────────
SPIDERMAN_STYLE = {
    "id": "spiderman-important",
    "name": "Spider-Man Edit",
    "duration": 46.6,
    "cuts": 34,
    "cutRate": 0.73,
    "avgShotDuration": 1.37,
    "colorProfile": {
        "avgRGB": [42, 49, 83],
        "brightness": 23,
        "saturation": 80,
        "hue": 190,
        "classification": "HYPER_SATURATED_NEON"
    },
    "editCharacteristics": {
        "pacing": "moderate",
        "effects": ["comic_halftone", "ink_edges", "frame_stutter", "chromatic_glitch", "impact_flash"],
        "transitions": ["cut", "whip_pan", "flash"],
        "colorGrade": "hyper_neon",
        "vfxIntensity": "high",
        "referenceStyle": "spiderverse_action"
    }
}

# ── Gemini API Client ────────────────────────────────────────────────
class GeminiClient:
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE
    
    def chat(self, messages: list, max_tokens: int = 4096) -> dict:
        """Send chat completion request via OpenRouter."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        
        body = json.dumps({
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens
        }).encode("utf-8")
        
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=body,
            headers=headers,
            method="POST"
        )
        
        with urllib.request.urlopen(req, timeout=120, context=self.ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    
    def analyze_footage(self, video_path: str) -> dict:
        """Analyze footage to extract segments for editing."""
        with open(video_path, "rb") as f:
            video_b64 = base64.b64encode(f.read()).decode("ascii")
        
        messages = [{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:video/mp4;base64,{video_b64}"}
                },
                {
                    "type": "text",
                    "text": """Analyze this footage for video editing. For each distinct segment/shot, provide:
1. Start time (seconds)
2. End time (seconds) 
3. Brief description of what's happening
4. Energy level (1-10)
5. Best moment timestamp (the peak action point)

Return ONLY valid JSON as an array of segments:
[{"start": 0.0, "end": 2.5, "description": "Player dribbling", "energy": 6, "peak": 1.2}, ...]

Be precise with timestamps. Include ALL usable segments."""
                }
            ]
        }]
        
        result = self.chat(messages)
        content = result["choices"][0]["message"]["content"]
        
        # Extract JSON from response
        import re
        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            return json.loads(json_match.group())
        return []


def generate_edl(segments: list, target_duration: float, style: dict) -> dict:
    """Generate an EDL based on footage segments and reference style."""
    
    # Calculate target shot count based on reference style
    target_shots = max(1, round(target_duration / style["avgShotDuration"]))
    
    # Sort segments by energy for selection
    segments_by_energy = sorted(segments, key=lambda s: s.get("energy", 5), reverse=True)
    
    # Select segments to use (prioritize high-energy for this style)
    selected_segments = []
    used_indices = set()
    
    # First pass: select peak moments
    for seg in segments_by_energy[:target_shots]:
        idx = segments.index(seg)
        if idx not in used_indices:
            selected_segments.append(seg)
            used_indices.add(idx)
    
    # Fill remaining slots if needed
    for seg in segments:
        if len(selected_segments) >= target_shots:
            break
        idx = segments.index(seg)
        if idx not in used_indices:
            selected_segments.append(seg)
            used_indices.add(idx)
    
    # Sort by original time order
    selected_segments.sort(key=lambda s: s.get("start", 0))
    
    # Generate EDL shots
    shots = []
    current_time = 0.0
    
    for i, seg in enumerate(selected_segments):
        # Calculate shot duration (vary around reference avg)
        import random
        base_duration = style["avgShotDuration"]
        variation = base_duration * 0.3
        duration = base_duration + random.uniform(-variation, variation)
        duration = max(0.3, min(3.0, duration))  # Clamp between 0.3s and 3s
        
        # Determine shot type based on energy
        energy = seg.get("energy", 5)
        if energy >= 8:
            shot_type = "climax"
            effects = ["impact_flash", "chromatic_glitch"]
        elif energy >= 6:
            shot_type = "action"
            effects = ["frame_stutter"]
        elif energy >= 4:
            shot_type = "build"
            effects = ["comic_halftone"]
        else:
            shot_type = "breathing"
            effects = []
        
        # Determine transition
        if i == 0:
            transition = "cut"
        elif shot_type == "climax":
            transition = "flash"
        elif energy > 6:
            transition = "whip_pan"
        else:
            transition = "cut"
        
        shot = {
            "id": f"shot_{i+1:03d}",
            "source": {
                "file": str(FOOTAGE),
                "start": seg.get("start", 0),
                "end": seg.get("end", seg.get("start", 0) + duration)
            },
            "timeline": {
                "start": current_time,
                "duration": duration
            },
            "type": shot_type,
            "effects": effects,
            "transition": transition,
            "description": seg.get("description", ""),
            "energy": energy
        }
        
        shots.append(shot)
        current_time += duration
    
    # Build EDL
    edl = {
        "version": "1.0",
        "referenceStyle": style["id"],
        "targetDuration": current_time,
        "totalShots": len(shots),
        "avgShotDuration": current_time / len(shots) if shots else 0,
        "colorGrade": style["colorProfile"]["classification"],
        "shots": shots
    }
    
    return edl


def render_with_ffmpeg(edl: dict, output_path: str):
    """Render EDL to video using FFmpeg."""
    print(f"\nRendering {edl['totalShots']} shots to {output_path}...")
    
    # Create temp directory for segments
    with tempfile.TemporaryDirectory() as tmpdir:
        segment_files = []
        
        # Extract each shot
        for i, shot in enumerate(edl["shots"]):
            src = shot["source"]
            timeline = shot["timeline"]
            segment_file = os.path.join(tmpdir, f"segment_{i:03d}.mp4")
            
            # Build FFmpeg command
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(src["start"]),
                "-i", str(src["file"]),
                "-t", str(timeline["duration"]),
                "-vf", f"scale=576:1104:force_original_aspect_ratio=decrease,pad=576:1104:(ow-iw)/2:(oh-ih)/2",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-an",  # Remove audio for now
                segment_file
            ]
            
            try:
                subprocess.run(cmd, capture_output=True, check=True)
                segment_files.append(segment_file)
                print(f"  Shot {i+1}/{edl['totalShots']}: {shot['timeline']['duration']:.2f}s - {shot['type']}")
            except subprocess.CalledProcessError as e:
                print(f"  Warning: Failed to extract shot {i+1}: {e}")
                continue
        
        if not segment_files:
            print("Error: No segments extracted")
            return
        
        # Create concat list
        concat_file = os.path.join(tmpdir, "concat.txt")
        with open(concat_file, "w") as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")
        
        # Concatenate segments
        concat_output = os.path.join(tmpdir, "concat.mp4")
        concat_cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            concat_output
        ]
        
        try:
            subprocess.run(concat_cmd, capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error concatenating segments: {e}")
            return
        
        # Apply color grading (neon/Spider-Verse style)
        graded_output = os.path.join(tmpdir, "graded.mp4")
        grade_cmd = [
            "ffmpeg", "-y",
            "-i", concat_output,
            "-vf", (
                "eq=brightness=-0.15:contrast=1.4:saturation=1.8,"
                "colorbalance=bs=0.2:bm=0.15:bh=0.1,"
                "unsharp=3:3:1.5"
            ),
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            graded_output
        ]
        
        try:
            subprocess.run(grade_cmd, capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Warning: Color grading failed, using ungraded: {e}")
            graded_output = concat_output
        
        # Add music if available
        if MUSIC.exists():
            final_output = os.path.join(tmpdir, "final.mp4")
            music_cmd = [
                "ffmpeg", "-y",
                "-i", graded_output,
                "-i", str(MUSIC),
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                final_output
            ]
            
            try:
                subprocess.run(music_cmd, capture_output=True, check=True)
                graded_output = final_output
            except subprocess.CalledProcessError as e:
                print(f"Warning: Music merge failed: {e}")
        
        # Copy to final output
        import shutil
        shutil.copy2(graded_output, output_path)
        print(f"\nRender complete: {output_path}")


def main():
    if not OPENROUTER_API_KEY:
        print("Error: OPENROUTER_API_KEY not set")
        sys.exit(1)
    
    if not FOOTAGE.exists():
        print(f"Error: Footage not found: {FOOTAGE}")
        sys.exit(1)
    
    print("=" * 60)
    print("SPIDERMAN Edit Replicator")
    print("=" * 60)
    print(f"Reference: {SPIDERMAN_STYLE['name']}")
    print(f"Footage: {FOOTAGE.name}")
    print(f"Target duration: {SPIDERMAN_STYLE['duration']:.1f}s")
    print(f"Target shots: ~{round(SPIDERMAN_STYLE['duration'] / SPIDERMAN_STYLE['avgShotDuration'])}")
    print()
    
    # Step 1: Analyze footage
    print("Step 1: Analyzing footage...")
    client = GeminiClient(OPENROUTER_API_KEY, MODEL)
    segments = client.analyze_footage(str(FOOTAGE))
    print(f"  Found {len(segments)} segments")
    
    if not segments:
        print("Error: No segments found in footage")
        sys.exit(1)
    
    # Step 2: Generate EDL
    print("\nStep 2: Generating EDL...")
    edl = generate_edl(segments, SPIDERMAN_STYLE["duration"], SPIDERMAN_STYLE)
    print(f"  Generated {edl['totalShots']} shots")
    print(f"  Total duration: {edl['targetDuration']:.2f}s")
    print(f"  Avg shot duration: {edl['avgShotDuration']:.2f}s")
    
    # Save EDL
    OUTPUT_DIR.mkdir(exist_ok=True)
    edl_path = OUTPUT_DIR / "spiderman-replica-edl.json"
    with open(edl_path, "w") as f:
        json.dump(edl, f, indent=2)
    print(f"  EDL saved: {edl_path}")
    
    # Step 3: Render
    print("\nStep 3: Rendering video...")
    output_path = OUTPUT_DIR / "spiderman-replica.mp4"
    render_with_ffmpeg(edl, str(output_path))
    
    print("\n" + "=" * 60)
    print("Complete!")
    print(f"Output: {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
