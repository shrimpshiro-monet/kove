"""
Semantic Event Analyzer
Uses DigitalOcean Inference (nemotron-nano-12b-v2-vl) to understand what's
happening in each shot:
- Actions (dribbling, shooting, celebrating, etc.)
- Emotions (tension, release, excitement, calm)
- Subjects (player, coach, crowd, referee)
- Event classification (setup, action, reaction, celebration, transition)
- Narrative role (establishing, building, climax, resolution)

Requires DIGITALOCEAN_API_KEY env var.
"""

import json
import os
import re
import subprocess
import tempfile
import time
import logging
from typing import Dict, List, Optional

from llm_provider import call_vision_llm

logger = logging.getLogger(__name__)

def analyze_semantic_events(video_path: str, shots: list, name: str = "video", profile: Optional[dict] = None) -> List[Dict]:
    """Analyze semantic events for each shot. Returns per-shot semantic analysis."""
    print("  Analyzing semantic events with LLM...")
    
    # profile: available for future genre-conditioned thresholds
    frames = extract_key_frames(video_path, shots)
    
    if not frames:
        print("  No frames extracted, using heuristic fallback...")
        return heuristic_semantic_analysis(shots)
    
    # Process in batches of 5 frames per LLM call
    BATCH_SIZE = 5
    frame_items = list(frames.items())
    chunks = [frame_items[i:i+BATCH_SIZE] for i in range(0, len(frame_items), BATCH_SIZE)]
    print(f"  Semantic: processing {len(frames)} shots in {len(chunks)} batches")
    
    all_events = []
    for batch_idx, chunk in enumerate(chunks):
        chunk_frames = dict(chunk)
        shot_indices = [idx for idx, _ in chunk]
        
        if batch_idx > 0:
            time.sleep(1)
        
        batch_shots = [s for s in shots if s["index"] in shot_indices]
        
        # Build mosaic of all frames in this batch
        mosaic_paths = [path for _, path in chunk]
        
        prompt = build_semantic_prompt(batch_shots, chunk_frames)
        result = call_vision_llm(prompt, mosaic_paths)
        
        if result:
            batch_events = parse_semantic_result(result, batch_shots)
            # Validate: check if descriptions are real (not heuristic)
            real_count = sum(1 for e in batch_events 
                           if e.get("description", "") 
                           and not e.get("description", "").startswith("Shot with")
                           and e.get("description", "") != "Unknown action")
            
            if real_count >= len(batch_shots) // 2:
                all_events.extend(batch_events)
                print(f"  Batch {batch_idx+1}: {real_count}/{len(batch_shots)} real descriptions")
            else:
                print(f"  Batch {batch_idx+1}: only {real_count}/{len(batch_shots)} real, using heuristic")
                all_events.extend(heuristic_semantic_analysis(batch_shots))
        else:
            print(f"  Batch {batch_idx+1}: LLM failed, using heuristic")
            all_events.extend(heuristic_semantic_analysis(batch_shots))
    
    # Merge: ensure all shots have events
    event_map = {e.get("shotIndex", -1): e for e in all_events}
    final_events = []
    for shot in shots:
        idx = shot["index"]
        if idx in event_map:
            final_events.append(event_map[idx])
        else:
            final_events.append(create_default_event(shot))
    
    return final_events

def extract_key_frames(video_path: str, shots: list) -> Dict[int, str]:
    """Extract key frames for semantic analysis."""
    tmpdir = tempfile.mkdtemp(prefix="semantic-")
    frames = {}
    
    for shot in shots[:20]:  # Cap at 20 shots for LLM analysis
        # Extract middle frame
        mid_time = shot["start"] + shot["duration"] / 2
        output = os.path.join(tmpdir, f"shot_{shot['index']:03d}.jpg")
        
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(mid_time), "-i", video_path,
            "-vframes", "1", "-q:v", "2", output
        ], capture_output=True, timeout=10)
        
        if os.path.exists(output):
            frames[shot["index"]] = output
    
    return frames

def build_semantic_prompt(shots: list, frames: Dict[int, str]) -> str:
    """Build prompt for LLM semantic analysis."""
    
    shot_descriptions = []
    for shot in shots:
        shot_descriptions.append(
            f"Shot {shot['index']}: {shot['start']:.1f}s-{shot['end']:.1f}s ({shot['duration']:.1f}s)"
        )
    
    prompt = f"""Analyze this video edit and describe what happens in each shot.

VIDEO EDIT BREAKDOWN:
{chr(10).join(shot_descriptions)}

For each shot, provide a JSON object with:
1. "description": Brief description of what's happening (1-2 sentences)
2. "actions": List of actions occurring (e.g., ["dribbling", "shooting", "celebrating"])
3. "subjects": Who/what is visible (e.g., ["player", "crowd", "basketball"])
4. "emotion": Emotional tone (e.g., "tension", "excitement", "calm", "celebration")
5. "event_type": Classification (setup/action/reaction/celebration/transition)
6. "narrative_role": Story position (establishing/building/climax/resolution)
7. "importance": How important is this shot (1-10)

Return ONLY a JSON array of objects, one per shot analyzed. Example:
[
  {{
    "shotIndex": 0,
    "description": "Player receives ball at top of key",
    "actions": ["receiving", "dribbling"],
    "subjects": ["player", "defender"],
    "emotion": "anticipation",
    "event_type": "setup",
    "narrative_role": "establishing",
    "importance": 5
  }},
  ...
]
"""
    
    return prompt

def parse_semantic_result(result: str, shots: list) -> List[Dict]:
    """Parse LLM response into semantic events."""
    try:
        json_match = re.search(r'\[[\s\S]*\]', result)
        if json_match:
            events = json.loads(json_match.group())
            
            # Ensure all shots have events
            event_map = {e.get("shotIndex", -1): e for e in events}
            
            semantic_events = []
            for shot in shots:
                idx = shot["index"]
                if idx in event_map:
                    event = event_map[idx]
                    event["shotIndex"] = idx
                    event["time"] = shot["start"]
                    semantic_events.append(event)
                else:
                    semantic_events.append(create_default_event(shot))
            
            return semantic_events
    except Exception as e:
        print(f"  Parse error: {e}")
    
    return heuristic_semantic_analysis(shots)

def create_default_event(shot: dict) -> Dict:
    """Create default semantic event for a shot."""
    return {
        "shotIndex": shot["index"],
        "time": shot["start"],
        "description": "Unknown action",
        "actions": [],
        "subjects": [],
        "emotion": "neutral",
        "event_type": "action",
        "narrative_role": "building",
        "importance": 5,
    }

def heuristic_semantic_analysis(shots: list) -> List[Dict]:
    """
    Fallback semantic analysis using heuristics.
    Based on shot properties to infer event types.
    """
    events = []
    
    for i, shot in enumerate(shots):
        # Infer from shot properties
        duration = shot.get("duration", 1.0)
        motion = shot.get("motion_magnitude", 0)
        shot_type = shot.get("shotType", "medium")
        
        # Event type inference
        if duration < 0.3:
            event_type = "transition"
            actions = ["flash"]
            emotion = "impact"
        elif shot_type in ["extreme_close", "close"]:
            if motion > 0.5:
                event_type = "reaction"
                actions = ["celebrating", "reacting"]
                emotion = "excitement"
            else:
                event_type = "reaction"
                actions = ["observing", "watching"]
                emotion = "anticipation"
        elif shot_type == "wide":
            if motion > 0.3:
                event_type = "action"
                actions = ["running", "dribbling"]
                emotion = "excitement"
            else:
                event_type = "setup"
                actions = ["positioning"]
                emotion = "calm"
        else:
            event_type = "action"
            actions = ["playing"]
            emotion = "neutral"
        
        # Narrative role based on position
        position = i / len(shots)
        if position < 0.2:
            narrative = "establishing"
        elif position < 0.5:
            narrative = "building"
        elif position < 0.8:
            narrative = "climax"
        else:
            narrative = "resolution"
        
        # Importance based on motion and position
        importance = min(10, int(motion * 10 + (1 if position > 0.7 else 0)))
        
        events.append({
            "shotIndex": shot["index"],
            "time": shot["start"],
            "description": f"Shot with {event_type} - {', '.join(actions)}",
            "actions": actions,
            "subjects": ["player"],
            "emotion": emotion,
            "event_type": event_type,
            "narrative_role": narrative,
            "importance": max(1, importance),
        })
    
    return events

def aggregate_semantic_results(semantic_events: List[Dict]) -> Dict:
    """Aggregate semantic analysis results."""
    if not semantic_events:
        return {
            "totalEvents": 0,
            "eventTypes": {},
            "emotions": {},
            "narrativeArc": [],
            "avgImportance": 0,
        }
    
    event_types = [e.get("event_type", "action") for e in semantic_events]
    emotions = [e.get("emotion", "neutral") for e in semantic_events]
    narrative = [e.get("narrative_role", "building") for e in semantic_events]
    importances = [e.get("importance", 5) for e in semantic_events]
    
    # Count distributions
    event_counts = {}
    for et in event_types:
        event_counts[et] = event_counts.get(et, 0) + 1
    
    emotion_counts = {}
    for em in emotions:
        emotion_counts[em] = emotion_counts.get(em, 0) + 1
    
    narrative_counts = {}
    for nr in narrative:
        narrative_counts[nr] = narrative_counts.get(nr, 0) + 1
    
    return {
        "totalEvents": len(semantic_events),
        "eventTypes": {k: v / len(semantic_events) for k, v in event_counts.items()},
        "emotions": {k: v / len(semantic_events) for k, v in emotion_counts.items()},
        "narrativeArc": {k: v / len(semantic_events) for k, v in narrative_counts.items()},
        "avgImportance": sum(importances) / len(importances),
        "dominantEventType": max(event_counts, key=event_counts.get) if event_counts else "action",
        "dominantEmotion": max(emotion_counts, key=emotion_counts.get) if emotion_counts else "neutral",
        "climaxPosition": next((i for i, nr in enumerate(narrative) if nr == "climax"), len(narrative) // 2),
    }

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python semantic_analyzer.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    # Create dummy shots
    shots = [
        {"index": 0, "start": 0, "end": 2, "duration": 2, "shotType": "wide", "motion_magnitude": 0.1},
        {"index": 1, "start": 2, "end": 4, "duration": 2, "shotType": "close", "motion_magnitude": 0.6},
        {"index": 2, "start": 4, "end": 6, "duration": 2, "shotType": "medium", "motion_magnitude": 0.3},
    ]
    
    events = analyze_semantic_events(video_path, shots)
    
    print(f"\nSemantic Events:")
    for e in events:
        print(f"  Shot {e['shotIndex']}: {e['event_type']} - {e['emotion']} (importance: {e['importance']})")
