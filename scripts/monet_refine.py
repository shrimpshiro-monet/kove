#!/usr/bin/env python3
"""
monet_refine.py — Refine an existing MonetEDL via Nemotron.

Input: current MonetEDL (JSON), user refinement prompt, optional scope
Output: refined MonetEDL (JSON)

Usage:
  python3 monet_refine.py --edl current.json --prompt "add slow-mo to clip 3" --output refined.json
  python3 monet_refine.py --edl current.json --prompt "make it punchier" --scope scope.json --output refined.json
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional, List

WORKSPACE = Path(__file__).resolve().parent.parent


def load_json(path: str) -> dict:
    with open(path, "r") as f:
        return json.load(f)


def save_json(path: str, data: dict) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def emit_progress(progress: int, message: str) -> None:
    print(f"progress:{progress}:{message}", flush=True)


def _load_dev_vars():
    """Load .dev.vars into os.environ."""
    if os.environ.get("NVIDIA_API_KEY") or os.environ.get("NVIDIA_NIM_API_KEY"):
        return
    for parent in Path(__file__).resolve().parents:
        dev_vars = parent / ".dev.vars"
        if dev_vars.exists():
            with open(dev_vars) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
            break


def call_nemotron(prompt: str, timeout: int = 60) -> Optional[list]:
    """Call Nemotron via NVIDIA NIM API to get refinement actions."""
    _load_dev_vars()

    api_key = os.environ.get("NVIDIA_NIM_API_KEY") or os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return None

    try:
        import urllib.request
        import urllib.error

        body = {
            "model": "nvidia/llama-3.3-nemotron-super-49b-v1",
            "messages": [
                {"role": "system", "content": "You are a JSON-only API. Return ONLY a valid JSON array of actions. No explanation text, no markdown, no code fences."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        }

        req = urllib.request.Request(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )

        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read().decode())

        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            return None

        # Parse JSON — try direct parse, then extract array from object
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            # Try common wrapper keys
            for key in ["actions", "edl_actions", "result", "output"]:
                if key in parsed and isinstance(parsed[key], list):
                    return parsed[key]
            # If it has type/params, wrap it as single action
            if "type" in parsed and "params" in parsed:
                return [parsed]
        return None

    except Exception as e:
        print(f"[monet_refine] Nemotron call failed: {e}", file=sys.stderr)
        return None


def build_refine_prompt(edl: dict, prompt: str, scope: Optional[List[str]], capabilities_md: str) -> str:
    """Build the Nemotron prompt for refinement."""
    # Mark clips as editable or locked based on scope
    editable_clips = set(scope) if scope else None

    edl_with_locks = json.dumps(edl, indent=2)

    system = f"""You are Kove Director — a world-class video editor.

The user is refining an existing edit. You must modify the edit according to their request.

RULES:
1. Preserve all clips marked LOCKED (not in scope). Do not change their timing, effects, speed, or transitions.
2. Only modify clips marked EDITABLE (in scope). If no scope is provided, all clips are editable.
3. Preserve any user-added effects, transitions, or speed changes unless the user explicitly asks to change them.
4. Only use capabilities marked ✓ (alpha) from the capabilities list below.
5. If the user requests something marked ◐ (beta) or ○ (planned), respond honestly: "That capability is coming soon in Kove."
6. Return ONLY a JSON array of DirectorAction objects. No explanation text.

CAPABILITIES:
{capabilities_md}

CURRENT EDIT (JSON):
{edl_with_locks}

USER REQUEST:
{prompt}

{f"SCOPE: Only modify clips with IDs in this list: {json.dumps(scope)}" if scope else "SCOPE: No scope — you may modify any clip."}

OUTPUT FORMAT: Return a JSON array of actions. Example:
[
  {{"type": "clip.speed", "params": {{"clipId": "clip-3", "speed": 0.5}}}}
]"""

    return system


def load_capabilities_manifest() -> str:
    """Load the capabilities markdown manifest."""
    md_path = WORKSPACE / "scripts" / "capabilities.md"
    if md_path.exists():
        return md_path.read_text()
    return "No capabilities manifest found. Use default editing actions."


def compile_actions_to_edl(actions: list[dict], current_edl: dict) -> dict:
    """
    Apply Nemotron's actions to the current EDL.
    Handles clip-level and track-level operations.
    """
    edl = json.loads(json.dumps(current_edl))  # deep copy

    # Build clip index and track index
    clip_index = {}
    track_index = {}
    for track in edl.get("timeline", {}).get("tracks", []):
        track_index[track["id"]] = track
        for clip in track.get("clips", []):
            clip_index[clip["id"]] = clip

    for action in actions:
        action_type = action.get("type", "")
        params = action.get("params", {})

        # --- Track-level operations ---

        if action_type == "track/create":
            track_id = params.get("trackId")
            if track_id and track_id not in track_index:
                new_track = {
                    "id": track_id,
                    "type": params.get("trackType", "video"),
                    "name": params.get("name", track_id),
                    "clips": [],
                }
                edl["timeline"]["tracks"].append(new_track)
                track_index[track_id] = new_track

        elif action_type == "track/remove":
            track_id = params.get("trackId")
            if track_id and track_id in track_index:
                edl["timeline"]["tracks"] = [
                    t for t in edl["timeline"]["tracks"] if t["id"] != track_id
                ]
                del track_index[track_id]

        # --- Clip-level operations ---

        elif action_type == "clip/add":
            clip_id = params.get("clipId")
            track_id = params.get("trackId", "video-main")
            if clip_id and track_id in track_index:
                new_clip = {
                    "id": clip_id,
                    "mediaId": params.get("mediaId", ""),
                    "startTime": params.get("startTime", 0),
                    "duration": params.get("duration", 5),
                    "inPoint": params.get("inPoint", 0),
                    "outPoint": params.get("outPoint", 5),
                    "speed": params.get("speed", 1),
                }
                track_index[track_id]["clips"].append(new_clip)
                clip_index[clip_id] = new_clip

        elif action_type == "clip/remove":
            clip_id = params.get("clipId")
            ripple = params.get("ripple", False)
            if clip_id and clip_id in clip_index:
                removed_clip = clip_index[clip_id]
                removed_duration = removed_clip.get("duration", 0)
                for track in edl["timeline"]["tracks"]:
                    idx = next((i for i, c in enumerate(track["clips"]) if c["id"] == clip_id), None)
                    if idx is not None:
                        track["clips"].pop(idx)
                        # Ripple: shift subsequent clips earlier
                        if ripple:
                            for i in range(idx, len(track["clips"])):
                                track["clips"][i]["startTime"] = max(0, track["clips"][i]["startTime"] - removed_duration)
                        break
                del clip_index[clip_id]

        elif action_type == "clip.reorder":
            clip_id = params.get("clipId")
            new_start = params.get("newStartTime")
            if clip_id and clip_id in clip_index and new_start is not None:
                clip_index[clip_id]["startTime"] = new_start

        elif action_type == "clip.speed":
            clip_id = params.get("clipId")
            speed = params.get("speed")
            if clip_id and clip_id in clip_index and speed is not None:
                clip_index[clip_id]["speed"] = speed

        elif action_type == "clip.update":
            clip_id = params.get("clipId")
            if clip_id and clip_id in clip_index:
                clip = clip_index[clip_id]
                if "speed" in params:
                    clip["speed"] = params["speed"]
                if "volume" in params:
                    clip.setdefault("audio", {})["gain"] = params["volume"]
                if "fade" in params:
                    clip.setdefault("audio", {}).update(params["fade"])

        elif action_type == "effect/apply":
            target_id = params.get("targetId")
            if target_id and target_id in clip_index:
                clip = clip_index[target_id]
                effect = {
                    "id": f"fx-{len(clip.get('effects', []))}",
                    "type": params.get("effectType", "unknown"),
                    "start": 0,
                    "duration": clip.get("duration", 1),
                    "params": params.get("params", {}),
                }
                clip.setdefault("effects", []).append(effect)

        elif action_type == "effect.custom":
            target_id = params.get("targetId")
            if target_id and target_id in clip_index:
                clip = clip_index[target_id]
                effect = {
                    "id": f"fx-{len(clip.get('effects', []))}",
                    "type": params.get("effectType", "unknown"),
                    "start": 0,
                    "duration": clip.get("duration", 1),
                    "params": params.get("params", {}),
                }
                clip.setdefault("effects", []).append(effect)

        elif action_type == "transition/add":
            clip_a_id = params.get("clipAId")
            clip_b_id = params.get("clipBId")
            # Find the clip and set its transition
            if clip_b_id and clip_b_id in clip_index:
                clip_index[clip_b_id]["transition"] = {
                    "type": params.get("type", "crossfade"),
                    "duration": params.get("duration", 0.5),
                }

        elif action_type == "keyframe/add":
            clip_id = params.get("clipId")
            if clip_id and clip_id in clip_index:
                clip = clip_index[clip_id]
                kf = {
                    "time": params.get("time", 0),
                    "value": params.get("value", 0),
                    "easing": params.get("easing", "linear"),
                }
                prop = params.get("property", "")
                if "scale" in prop:
                    clip.setdefault("transforms", {}).setdefault("scale", []).append(kf)
                elif "rotation" in prop:
                    clip.setdefault("transforms", {}).setdefault("rotation", []).append(kf)

    return edl


def main():
    parser = argparse.ArgumentParser(description="Refine a MonetEDL via Nemotron")
    parser.add_argument("--edl", required=True, help="Path to current EDL JSON")
    parser.add_argument("--prompt", required=True, help="Path to refinement prompt text file")
    parser.add_argument("--output", required=True, help="Path to write refined EDL")
    parser.add_argument("--scope", help="Path to scope JSON (list of clip IDs)")
    parser.add_argument("--reference-dna", help="Path to reference DNA JSON (optional)")
    args = parser.parse_args()

    emit_progress(10, "Loading current edit...")

    current_edl = load_json(args.edl)
    prompt = Path(args.prompt).read_text().strip()

    scope = None
    if args.scope and os.path.exists(args.scope):
        raw_scope = load_json(args.scope)
        # GAP-005: Re-validate scope against current EDL clip IDs
        all_clip_ids = set()
        for track in current_edl.get("timeline", {}).get("tracks", []):
            for clip in track.get("clips", []):
                all_clip_ids.add(clip["id"])
        if isinstance(raw_scope, list):
            scope = [cid for cid in raw_scope if cid in all_clip_ids]
        else:
            scope = None

    emit_progress(20, "Loading capabilities manifest...")

    capabilities_md = load_capabilities_manifest()

    emit_progress(30, "Building refinement prompt...")

    system_prompt = build_refine_prompt(current_edl, prompt, scope, capabilities_md)

    emit_progress(40, "Querying AI for refinement actions...")

    # Try Nemotron first, fall back to rule-based if unavailable
    actions = call_nemotron(system_prompt)
    if actions:
        emit_progress(60, f"Nemotron returned {len(actions)} actions")
    else:
        emit_progress(50, "Nemotron unavailable, using rule-based refinement")
        actions = apply_rule_based_refinement(current_edl, prompt, scope)

    emit_progress(70, "Applying refinement actions...")

    refined_edl = compile_actions_to_edl(actions, current_edl)

    emit_progress(90, "Validating refined edit...")

    # Basic validation
    if "timeline" not in refined_edl:
        refined_edl["timeline"] = current_edl.get("timeline", {})

    # Update metadata
    refined_edl.setdefault("meta", {})["updatedAt"] = __import__("time").time() * 1000

    emit_progress(100, "Refinement complete")

    save_json(args.output, refined_edl)
    print(f"Refined EDL saved to {args.output}")


def apply_rule_based_refinement(edl: dict, prompt: str, scope: Optional[List[str]]) -> list:
    """
    Simple rule-based refinement that handles common requests.
    In production, this would be replaced by Nemotron.
    """
    actions = []
    prompt_lower = prompt.lower()
    tracks = edl.get("timeline", {}).get("tracks", [])

    # Collect all clip IDs
    all_clips = []
    for track in tracks:
        for clip in track.get("clips", []):
            all_clips.append(clip["id"])

    # Determine target clips
    if scope:
        target_clips = [c for c in scope if c in all_clips]
    else:
        target_clips = all_clips

    # Rule: slow-mo / slow motion
    if any(word in prompt_lower for word in ["slow", "slow-mo", "slow motion", "half speed"]):
        for clip_id in target_clips:
            actions.append({
                "type": "clip.speed",
                "params": {"clipId": clip_id, "speed": 0.5},
            })

    # Rule: speed up / faster
    elif any(word in prompt_lower for word in ["fast", "speed up", "quicker", "faster"]):
        for clip_id in target_clips:
            actions.append({
                "type": "clip.speed",
                "params": {"clipId": clip_id, "speed": 1.5},
            })

    # Rule: shake / impact
    elif any(word in prompt_lower for word in ["shake", "impact", "hit harder", "punch"]):
        for clip_id in target_clips:
            actions.append({
                "type": "effect.custom",
                "params": {
                    "target": "clip",
                    "targetId": clip_id,
                    "effectType": "context_shake",
                    "params": {"intensity": 0.5},
                },
            })

    # Rule: flash
    elif any(word in prompt_lower for word in ["flash", "white flash"]):
        for clip_id in target_clips:
            actions.append({
                "type": "effect.custom",
                "params": {
                    "target": "clip",
                    "targetId": clip_id,
                    "effectType": "impact_flash",
                    "params": {"intensity": 0.7},
                },
            })

    # Rule: zoom in / push in
    elif any(word in prompt_lower for word in ["zoom in", "push in", "get closer"]):
        for clip_id in target_clips:
            actions.append({
                "type": "effect.custom",
                "params": {
                    "target": "clip",
                    "targetId": clip_id,
                    "effectType": "push_in",
                    "params": {"intensity": 0.6},
                },
            })

    # Rule: zoom out / pull out
    elif any(word in prompt_lower for word in ["zoom out", "pull out", "widen"]):
        for clip_id in target_clips:
            actions.append({
                "type": "effect.custom",
                "params": {
                    "target": "clip",
                    "targetId": clip_id,
                    "effectType": "pull_out",
                    "params": {"intensity": 0.6},
                },
            })

    # Rule: crossfade / transition
    elif any(word in prompt_lower for word in ["crossfade", "fade", "transition"]):
        for i in range(len(target_clips) - 1):
            actions.append({
                "type": "transition.apply",
                "params": {
                    "clipAId": target_clips[i],
                    "clipBId": target_clips[i + 1],
                    "type": "crossfade",
                    "duration": 0.5,
                },
            })

    # Rule: warmer / cooler / color
    elif any(word in prompt_lower for word in ["warm", "cooler", "color", "grade"]):
        preset = "warm" if "warm" in prompt_lower else "cool" if "cool" in prompt_lower else "cinematic"
        actions.append({
            "type": "color.grade",
            "params": {"target": "timeline", "preset": preset},
        })

    # Rule: mute / quiet
    elif any(word in prompt_lower for word in ["mute", "quiet", "silent", "lower volume"]):
        for clip_id in target_clips:
            actions.append({
                "type": "audio.set-volume",
                "params": {"clipId": clip_id, "volume": 0.2},
            })

    else:
        # No recognized pattern — return empty (no-op)
        pass

    return actions


if __name__ == "__main__":
    main()
