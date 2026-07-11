"""
Reference Type Classifier
Classifies video type BEFORE analysis to enable per-type behavior.

Uses DigitalOcean Inference (nemotron-nano-12b-v2-vl) to classify into one of:
- sports_highlight
- vlog
- amv_anime
- dance_edit
- gaming_montage
- movie_trailer
- tiktok_general
- unknown

Requires DIGITALOCEAN_API_KEY env var.
"""

import json
import os
import re
import subprocess
import tempfile
import logging
from typing import Dict, List

from llm_provider import call_vision_llm

logger = logging.getLogger(__name__)

VIDEO_TYPES = [
    "sports_highlight",
    "vlog",
    "amv_anime",
    "dance_edit",
    "gaming_montage",
    "movie_trailer",
    "tiktok_general",
    "unknown",
]


def classify_reference_type(video_path: str, name: str = "video") -> Dict:
    """
    Classify the type of reference video.

    Returns:
        {
            "type": str,  # One of VIDEO_TYPES
            "confidence": float,  # 0-1
            "description": str,  # Brief description
        }
    """
    print("  Classifying reference type...")

    try:
        result = classify_with_llm(video_path, name)
        if result:
            return result
    except Exception as e:
        print(f"    LLM classification failed: {e}")

    return classify_heuristic(video_path, name)


def classify_with_llm(video_path: str, name: str) -> Dict:
    """Classify using DigitalOcean Inference vision model."""
    frames = extract_sample_frames(video_path, num_frames=5)
    if not frames:
        raise ValueError("Could not extract frames")

    prompt = f"""Classify this video into one of these categories:
{json.dumps(VIDEO_TYPES, indent=2)}

Look at the frames and determine:
1. What type of content is this?
2. What is the editing style?
3. What platform is it likely for?

Return ONLY a JSON object with:
{{
    "type": "<one of the categories>",
    "confidence": <0.0-1.0>,
    "description": "<brief description of what you see>"
}}"""

    response_text = call_vision_llm(prompt, frames[:5], max_tokens=1000)

    for f in frames:
        if os.path.exists(f):
            os.remove(f)

    if not response_text:
        return None

    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if json_match:
        classification = json.loads(json_match.group())
        video_type = classification.get("type", "unknown")
        if video_type not in VIDEO_TYPES:
            video_type = "unknown"
        return {
            "type": video_type,
            "confidence": min(1.0, max(0.0, classification.get("confidence", 0.5))),
            "description": classification.get("description", ""),
        }

    return None


def classify_heuristic(video_path: str, name: str) -> Dict:
    """
    Fallback heuristic classification based on video metadata.
    Less accurate but always available.
    """
    # Get video info
    info = get_video_info(video_path)
    
    # Simple heuristics
    duration = info.get("duration", 0)
    width = info.get("width", 0)
    height = info.get("height", 0)
    
    # Vertical video = likely TikTok/short-form
    if height > width * 1.3:
        if duration < 60:
            return {
                "type": "tiktok_general",
                "confidence": 0.5,
                "description": f"Vertical short-form video ({duration:.0f}s)",
            }
    
    # Landscape + short = could be anything
    if duration < 30:
        return {
            "type": "unknown",
            "confidence": 0.3,
            "description": f"Short video ({duration:.0f}s), insufficient data",
        }
    
    return {
        "type": "unknown",
        "confidence": 0.2,
        "description": "Could not classify from metadata alone",
    }


def get_video_info(path: str) -> dict:
    """Get video metadata."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True, timeout=10
    )
    
    try:
        data = json.loads(result.stdout)
        fmt = data.get("format", {})
        
        video_stream = None
        for s in data.get("streams", []):
            if s["codec_type"] == "video":
                video_stream = s
                break
        
        return {
            "duration": float(fmt.get("duration", 0)),
            "width": video_stream.get("width", 0) if video_stream else 0,
            "height": video_stream.get("height", 0) if video_stream else 0,
        }
    except:
        return {"duration": 0, "width": 0, "height": 0}


def extract_sample_frames(video_path: str, num_frames: int = 5) -> List[str]:
    """Extract evenly spaced frames from video."""
    tmpdir = tempfile.mkdtemp(prefix="refclass-")
    
    # Get duration
    info = get_video_info(video_path)
    duration = info.get("duration", 0)
    
    if duration <= 0:
        return []
    
    frames = []
    for i in range(num_frames):
        t = (i + 0.5) * duration / num_frames  # Center of each segment
        output = os.path.join(tmpdir, f"frame_{i}.jpg")
        
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(t), "-i", video_path,
            "-vframes", "1", "-q:v", "2", output
        ], capture_output=True, timeout=10)
        
        if os.path.exists(output):
            frames.append(output)
    
    return frames


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python reference_type_classifier.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    result = classify_reference_type(video_path)
    
    print(f"\nClassification:")
    print(f"  Type: {result['type']}")
    print(f"  Confidence: {result['confidence']:.2f}")
    print(f"  Description: {result['description']}")
