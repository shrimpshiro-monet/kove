"""
LLM Deep Analyzer

Uses NVIDIA NIM (deepseek-v4-flash) to analyze the structured edit events
data and produce a moment-by-moment timeline of what happens in every segment.

This per-segment analysis is the blueprint for style application.
"""

import json
import os
import time
from typing import Any, Optional

from openai import OpenAI

_client = None
_client_model = ""


def _get_client() -> Optional[OpenAI]:
    global _client, _client_model
    if _client is not None:
        return _client

    providers = [
        ("Groq", "https://api.groq.com/openai/v1", os.environ.get("GROQ_API_KEY"), "llama-3.3-70b-versatile"),
        ("Cerebras", "https://api.cerebras.ai/v1", os.environ.get("CEREBRAS_API_KEY"), "llama-3.3-70b"),
        ("NVIDIA", "https://integrate.api.nvidia.com/v1", os.environ.get("NVIDIA_NIM_API_KEY"), os.environ.get("NVIDIA_NIM_MODEL", "moonshotai/kimi-k2.6")),
    ]
    for name, base_url, api_key, model in providers:
        if not api_key:
            continue
        _client = OpenAI(base_url=base_url, api_key=api_key, timeout=30)
        _client_model = model
        print(f"  [llm] Using {name} ({model})")
        return _client

    print("  [llm] No API key configured — skipping LLM analysis")
    return None

_SYSTEM_PROMPT = """\
You are a professional video editing analyst. You receive structured data about \
every segment of a reference video and must produce a MOMENT-BY-MOMENT timeline \
describing exactly what happens in each segment.

Your output MUST be valid JSON matching this schema:

{
  "styleDNA": {
    "genre": "string",
    "mood": "string",
    "energyLevel": "number 1-10",
    "editingPhilosophy": "string"
  },
  "timeline": [
    {
      "startTime": "number — segment start in seconds",
      "endTime": "number — segment end in seconds",
      "duration": "number — segment duration",
      "description": "string — what is happening in this segment: visual content, \
camera movement, text overlays, transition type entering and exiting. \
Describe the ENERGY of this moment (high/medium/low). \
Describe WHAT the viewer sees (subject, action, framing). \
Mention any text that appears and where.",
      "transitionIn": "string — how this segment begins (cut, crossfade, fade_from_white, etc.)",
      "transitionOut": "string — how this segment ends (cut, crossfade, fade_to_black, etc.)",
      "cameraMotion": "string — static, pan_left, pan_right, zoom_in, zoom_out, shake",
      "textOverlay": "string | null — text content if any, or null",
      "energy": "string — 'high' | 'medium' | 'low'",
      "beatSynced": "boolean — whether this segment aligns with a beat"
    }
  ],
  "overallStyle": {
    "replicationGuide": ["string — step-by-step instructions to recreate this edit"],
    "criticalElements": ["string — must-have elements"],
    "pacingProfile": "string — how pacing changes across the video"
  }
}

RULES:
- Describe EVERY segment. Do not skip any.
- Be specific about what the viewer sees in each moment.
- Note the transition that ENTERS each segment (transitionIn) and EXITS it (transitionOut).
- If text appears, describe its content, position, and timing.
- Energy should reflect cut density + visual intensity + audio energy at that moment.
- The timeline array MUST have one entry per segment, ordered by startTime.\
"""


def analyze_with_llm(profile_data: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Send structured profile data to LLM for moment-by-moment analysis."""
    client = _get_client()
    if not client:
        return None

    user_msg = _build_analysis_message(profile_data)

    print(f"  [llm] Sending to {_client_model}...")

    try:
        t0 = time.time()
        response = client.chat.completions.create(
            model=_client_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=4096,
        )
        elapsed = time.time() - t0
        content = response.choices[0].message.content
        print(f"  [llm] Response received ({elapsed:.1f}s, {len(content)} chars)")

        # Extract JSON from potentially markdown-wrapped response
        result = _extract_json(content)
        return result

    except Exception as e:
        print(f"  [llm] Error: {e}")
        return None


def _extract_json(text: str) -> dict:
    """Extract JSON from possible markdown-wrapped response."""
    import re
    # Try markdown code block first
    m = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if m:
        text = m.group(1)
    # Try bare JSON object
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        text = m.group(0)
    return json.loads(text)


def _build_analysis_message(profile_data: dict[str, Any]) -> str:
    """Build a structured user message from the reference profile data."""
    sections = []

    # Video metadata
    meta = profile_data.get("metadata", {})
    sections.append(f"""## Video Metadata
- Duration: {meta.get('duration', '?')}s
- Resolution: {meta.get('width', '?')}x{meta.get('height', '?')}
- FPS: {meta.get('fps', '?')}
- Detected cuts: {meta.get('cuts', '?')}""")

    # Audio
    audio = profile_data.get("audio", {})
    if audio:
        sections.append(f"""## Audio Analysis
- BPM: {audio.get('bpm', '?')}
- Beat count: {audio.get('beats', '?')}""")

    # Transitions (compact)
    transitions = profile_data.get("edit_events", {}).get("transitions", [])
    if transitions:
        trans_str = ", ".join(f"{t['time']:.1f}s={t['type']}" for t in transitions)
        sections.append(f"## Transitions ({len(transitions)}): {trans_str}")

    # Keyframes (compact)
    keyframes = profile_data.get("edit_events", {}).get("keyframes", [])
    if keyframes:
        kf_str = ", ".join(f"{kf['type']}@{kf['time']:.1f}s" for seg in keyframes for kf in seg.get("keyframes", []))
        sections.append(f"## Keyframes: {kf_str}")

    # Speed ramps
    speed_ramps = profile_data.get("edit_events", {}).get("speed_ramps", [])
    if speed_ramps:
        ramps = [r for r in speed_ramps if r.get("ramp_type") and r["ramp_type"] != "?"]
        if ramps:
            sections.append(f"""## Speed Ramps ({len(ramps)} detected)
{chr(10).join(f"  seg@{r.get('segment_index', '?')}: {r.get('ramp_type', '?')}" for r in ramps)}""")

    # Text overlays (compact)
    segments = profile_data.get("segments", [])
    text_segments = [s for s in segments if s.get("text_content")]
    if text_segments:
        text_lines = []
        for s in text_segments:
            texts = [c.get("text", "") for c in s.get("text_content", [])[:3]
                     if c.get("confidence", 0) > 0.4 and len(c.get("text", "")) > 2]
            if texts:
                text_lines.append(f"@{s.get('start', 0):.1f}s: {', '.join(texts)}")
        sections.append(f"## Text: {' | '.join(text_lines)}")

    # Camera motion (compact)
    motion_parts = []
    for s in segments:
        cam = s.get("camera_motion", "static")
        if cam != "static":
            motion_parts.append(f"@{s.get('start', 0):.1f}s={cam}")
    if motion_parts:
        sections.append(f"## Camera Motion: {' | '.join(motion_parts)}")

    # Composite layouts
    composites = [s for s in segments if s.get("has_composite")]
    if composites:
        comp_parts = []
        for s in composites:
            comp_parts.append(f"@{s.get('start', 0):.1f}s({s.get('duration', 0):.1f}s): {s.get('composite_layout', '?')}")
        sections.append(f"## Multi-Clip Composites: {' | '.join(comp_parts)}")

    # Energy curve
    energy = profile_data.get("energyCurve", [])
    if energy:
        # Summarize energy in 5 buckets
        bucket_size = len(energy) // 5
        energy_summary = []
        for i in range(5):
            chunk = energy[i * bucket_size:(i + 1) * bucket_size]
            avg = sum(chunk) / len(chunk) if chunk else 0
            energy_summary.append(f"  {i*20}-{(i+1)*20}%: {avg:.2f}")
        sections.append(f"""## Energy Curve (5 buckets)
{chr(10).join(energy_summary)}""")

    # Effects vocabulary
    effects = profile_data.get("effects", [])
    if effects:
        sections.append(f"""## Detected Effects
{', '.join(e.get('type', '?') for e in effects)}""")

    return "\n\n".join(sections)
