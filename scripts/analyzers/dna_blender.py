"""
DNA Blender
Blends multiple reference DNAs with weights to create a "vibe."

Blending strategies:
- weighted_avg: Weighted average for numeric fields, weighted merge for distributions
- dominant_wins: Highest-weighted DNA wins all fields (stub)
- union: Union of all effects/transitions (stub)
"""

import numpy as np
from typing import Dict, List, Any


def blend_dnas(dnas: List[Dict], weights: List[float], strategy: str = "weighted_avg") -> Dict:
    """
    Blend multiple DNAs with weights.
    
    Args:
        dnas: List of DNA dicts from grammar extraction
        weights: List of weights (should sum to 1.0)
        strategy: Blending strategy ("weighted_avg", "dominant_wins", "union")
    
    Returns:
        Blended DNA dict
    """
    if not dnas:
        raise ValueError("No DNAs to blend")
    
    if len(dnas) != len(weights):
        raise ValueError("DNAs and weights must have same length")
    
    if strategy == "weighted_avg":
        return _blend_weighted_avg(dnas, weights)
    elif strategy == "dominant_wins":
        return _blend_dominant_wins(dnas, weights)
    elif strategy == "union":
        return _blend_union(dnas, weights)
    else:
        raise ValueError(f"Unknown strategy: {strategy}")


def _blend_weighted_avg(dnas: List[Dict], weights: List[float]) -> Dict:
    """
    Weighted average blending strategy.
    
    - Numeric fields: weighted average
    - Distribution fields: weighted sum, then normalize
    - Dominant fields: pick from highest-weighted DNA
    - List fields: merge and deduplicate
    """
    # Normalize weights to sum to 1.0
    total_weight = sum(weights)
    weights = [w / total_weight for w in weights]
    
    # Find the primary DNA (highest weight) for dominant fields
    primary_idx = weights.index(max(weights))
    primary = dnas[primary_idx]
    
    blended = {}
    
    # ── Top-level scalar fields ──────────────────────────────────────
    # These are directly from the primary DNA (not blended)
    blended["name"] = primary["name"]
    blended["source"] = primary["source"]
    blended["duration"] = primary["duration"]
    blended["resolution"] = primary["resolution"]
    blended["fps"] = primary["fps"]
    
    # ── Numeric fields: weighted average ─────────────────────────────
    numeric_fields = [
        "totalShots", "avgShotDuration", "cutRate",
    ]
    
    for field in numeric_fields:
        values = [dna.get(field, 0) for dna in dnas]
        blended[field] = sum(v * w for v, w in zip(values, weights))
    
    # ── Motion stats: weighted average ───────────────────────────────
    blended["motionStats"] = _blend_numeric_dict(
        [dna.get("motionStats", {}) for dna in dnas],
        weights,
        fields=["avg_magnitude", "peak_magnitude", "variance"]
    )
    blended["motionStats"]["flow_method"] = primary.get("motionStats", {}).get("flow_method", "unknown")
    
    # ── Color profile: dominant color from primary + weighted stats ──
    blended["colorProfile"] = _blend_color_profile(dnas, weights, primary)
    
    # ── Shot types: weighted distribution ────────────────────────────
    blended["shotTypes"] = _blend_distribution(
        [dna.get("shotTypes", {}) for dna in dnas],
        weights,
        distribution_key="distribution"
    )
    
    # ── Effects: weighted distribution ───────────────────────────────
    blended["effects"] = _blend_effects(dnas, weights)
    
    # ── Text: dominant from primary + weighted stats ─────────────────
    blended["text"] = _blend_text(dnas, weights, primary)
    
    # ── Speed: weighted average ──────────────────────────────────────
    blended["speed"] = _blend_speed(dnas, weights)
    
    # ── Semantic events: dominant from primary ───────────────────────
    blended["semanticEvents"] = _blend_semantic(dnas, weights, primary)
    
    # ── Audio: from primary ──────────────────────────────────────────
    blended["audioAnalysis"] = primary.get("audioAnalysis")
    
    # ── Rhythm: weighted average ─────────────────────────────────────
    blended["rhythm"] = _blend_rhythm(dnas, weights)
    
    # ── Energy curve: primary's curve ────────────────────────────────
    blended["energyCurve"] = primary.get("energyCurve", [])
    
    # ── Shots: primary's shots with blended metadata ─────────────────
    blended["shots"] = primary.get("shots", [])
    
    # ── Reference type: from primary ─────────────────────────────────
    blended["referenceType"] = primary.get("referenceType", "unknown")
    blended["referenceTypeConfidence"] = primary.get("referenceTypeConfidence", 0)
    
    # ── Blending metadata ────────────────────────────────────────────
    blended["_blendingMeta"] = {
        "strategy": "weighted_avg",
        "sources": [
            {"name": dna.get("name", "unknown"), "weight": w}
            for dna, w in zip(dnas, weights)
        ],
        "sourceCount": len(dnas),
    }
    
    # ── Grammar rules ────────────────────────────────────────────────
    blended["grammarRules"] = _build_blended_grammar_rules(blended)
    
    return blended


def _blend_numeric_dict(dicts: List[Dict], weights: List[float], 
                        fields: List[str]) -> Dict:
    """Blend numeric dictionary fields with weighted average."""
    result = {}
    for field in fields:
        values = [d.get(field, 0) for d in dicts]
        result[field] = sum(v * w for v, w in zip(values, weights))
    return result


def _blend_color_profile(dnas: List[Dict], weights: List[float], 
                         primary: Dict) -> Dict:
    """
    Blend color profiles.
    - grade: from primary (categorical)
    - color_temperature: from primary (categorical)
    - saturation_mean: weighted average
    - dominant_palette: merge palettes from all sources
    """
    primary_color = primary.get("colorProfile", {})
    
    # Weighted saturation
    sat_values = [dna.get("colorProfile", {}).get("saturation_mean", 50) for dna in dnas]
    avg_sat = sum(v * w for v, w in zip(sat_values, weights))
    
    # Merge palettes (take top 3 from each, deduplicate by hex)
    all_palette = []
    for dna, w in zip(dnas, weights):
        palette = dna.get("colorProfile", {}).get("dominant_palette", [])
        for color in palette[:3]:
            all_palette.append({**color, "weight": w * color.get("percentage", 0)})
    
    # Deduplicate by hex, keeping highest weight
    seen = {}
    for color in all_palette:
        hex_key = color.get("hex", "")
        if hex_key not in seen or color["weight"] > seen[hex_key]["weight"]:
            seen[hex_key] = color
    
    merged_palette = sorted(seen.values(), key=lambda c: c["weight"], reverse=True)[:5]
    
    return {
        "grade": primary_color.get("grade", "normal"),
        "color_temperature": primary_color.get("color_temperature", "neutral"),
        "saturation_mean": avg_sat,
        "dominant_palette": merged_palette,
    }


def _blend_distribution(dicts: List[Dict], weights: List[float],
                        distribution_key: str) -> Dict:
    """
    Blend distribution fields (e.g., shotTypes.distribution).
    Weighted sum, then normalize to sum to 1.0.
    """
    # Collect all distribution keys
    all_keys = set()
    for d in dicts:
        dist = d.get(distribution_key, {})
        all_keys.update(dist.keys())
    
    # Weighted sum
    merged = {}
    for key in all_keys:
        values = [d.get(distribution_key, {}).get(key, 0) for d in dicts]
        merged[key] = sum(v * w for v, w in zip(values, weights))
    
    # Normalize
    total = sum(merged.values())
    if total > 0:
        merged = {k: v / total for k, v in merged.items()}
    
    # Find dominant
    dominant = max(merged, key=merged.get) if merged else "unknown"
    
    # Check variety
    non_zero = sum(1 for v in merged.values() if v > 0.05)
    
    return {
        "distribution": merged,
        "dominantType": dominant,
        "variedFraming": non_zero >= 3,
    }


def _blend_effects(dnas: List[Dict], weights: List[float]) -> Dict:
    """
    Blend effects.
    - totalEffects: weighted average
    - effectsPerShot: weighted average
    - transitions: weighted sum, then normalize
    - visualEffects: weighted sum, then normalize
    """
    # Weighted averages
    total_values = [dna.get("effects", {}).get("totalEffects", 0) for dna in dnas]
    per_shot_values = [dna.get("effects", {}).get("effectsPerShot", 0) for dna in dnas]
    
    blended_total = sum(v * w for v, w in zip(total_values, weights))
    blended_per_shot = sum(v * w for v, w in zip(per_shot_values, weights))
    
    # Merge transition distributions
    all_transitions = {}
    for dna, w in zip(dnas, weights):
        transitions = dna.get("effects", {}).get("transitions", {})
        for key, count in transitions.items():
            all_transitions[key] = all_transitions.get(key, 0) + count * w
    
    # Merge visual effect distributions
    all_visual = {}
    for dna, w in zip(dnas, weights):
        visual = dna.get("effects", {}).get("visualEffects", {})
        for key, count in visual.items():
            all_visual[key] = all_visual.get(key, 0) + count * w
    
    # Find most common
    all_effects_list = []
    for trans, count in all_transitions.items():
        all_effects_list.extend([trans] * int(count * 10))
    for visual, count in all_visual.items():
        all_effects_list.extend([visual] * int(count * 10))
    
    most_common = max(all_effects_list, key=all_effects_list.count) if all_effects_list else "none"
    
    return {
        "totalEffects": blended_total,
        "effectsPerShot": blended_per_shot,
        "transitions": {k: round(v, 1) for k, v in all_transitions.items() if v > 0.1},
        "visualEffects": {k: round(v, 1) for k, v in all_visual.items() if v > 0.1},
        "mostCommonEffect": most_common,
        "effectVariety": len(set(list(all_transitions.keys()) + list(all_visual.keys()))),
    }


def _blend_text(dnas: List[Dict], weights: List[float], primary: Dict) -> Dict:
    """
    Blend text detection results.
    - hasText: from primary
    - textFrequency: weighted average
    - dominantColor/Size/Placement: from primary
    """
    primary_text = primary.get("text", {})
    
    freq_values = [dna.get("text", {}).get("textFrequency", 0) for dna in dnas]
    avg_freq = sum(v * w for v, w in zip(freq_values, weights))
    
    return {
        "hasText": primary_text.get("hasText", False),
        "textFrequency": avg_freq,
        "shotsWithText": primary_text.get("shotsWithText", 0),
        "totalTextRegions": primary_text.get("totalTextRegions", 0),
        "dominantColor": primary_text.get("dominantColor"),
        "dominantSize": primary_text.get("dominantSize"),
        "dominantPlacement": primary_text.get("dominantPlacement"),
        "confidenceThreshold": primary_text.get("confidenceThreshold", 0.6),
    }


def _blend_speed(dnas: List[Dict], weights: List[float]) -> Dict:
    """
    Blend speed analysis.
    - avgSpeed: weighted average
    - hasRamps: from any DNA with ramps (union)
    - dominantSpeed: from highest-weighted
    """
    avg_values = [dna.get("speed", {}).get("avgSpeed", 1.0) for dna in dnas]
    avg_speed = sum(v * w for v, w in zip(avg_values, weights))
    
    has_ramps = any(dna.get("speed", {}).get("hasRamps", False) for dna in dnas)
    
    # Find dominant speed type from primary
    primary_speed = max(weights)
    primary_idx = weights.index(primary_speed)
    dominant_speed = dnas[primary_idx].get("speed", {}).get("dominantSpeed", "normal")
    
    return {
        "avgSpeed": avg_speed,
        "dominantSpeed": dominant_speed,
        "hasSlowMotion": any(dna.get("speed", {}).get("hasSlowMotion", False) for dna in dnas),
        "hasFastMotion": any(dna.get("speed", {}).get("hasFastMotion", False) for dna in dnas),
        "hasRamps": has_ramps,
    }


def _blend_semantic(dnas: List[Dict], weights: List[float], primary: Dict) -> Dict:
    """
    Blend semantic events.
    - dominantEventType: from primary
    - dominantEmotion: from primary
    - eventTypes distribution: weighted sum
    """
    primary_sem = primary.get("semanticEvents", {})
    
    # Merge event type distributions
    all_event_types = {}
    for dna, w in zip(dnas, weights):
        event_types = dna.get("semanticEvents", {}).get("eventTypes", {})
        for key, count in event_types.items():
            all_event_types[key] = all_event_types.get(key, 0) + count * w
    
    # Normalize
    total = sum(all_event_types.values())
    if total > 0:
        all_event_types = {k: v / total for k, v in all_event_types.items()}
    
    return {
        "totalEvents": primary_sem.get("totalEvents", 0),
        "eventTypes": all_event_types,
        "dominantEventType": primary_sem.get("dominantEventType", "action"),
        "dominantEmotion": primary_sem.get("dominantEmotion", "neutral"),
        "avgImportance": primary_sem.get("avgImportance", 5),
    }


def _blend_rhythm(dnas: List[Dict], weights: List[float]) -> Dict:
    """
    Blend rhythm analysis.
    - tempo: weighted average
    - cuts_on_beat: weighted average
    """
    tempo_values = [dna.get("rhythm", {}).get("tempo", 0) for dna in dnas]
    beat_values = [dna.get("rhythm", {}).get("cuts_on_beat", 0) for dna in dnas]
    
    avg_tempo = sum(v * w for v, w in zip(tempo_values, weights))
    avg_beat = sum(v * w for v, w in zip(beat_values, weights))
    
    return {
        "tempo": avg_tempo,
        "cuts_on_beat": avg_beat,
        "isBeatDriven": avg_beat > 40,
    }


def _build_blended_grammar_rules(dna: dict) -> dict:
    """Build grammar rules from blended DNA."""
    shots = dna.get("shots", [])
    
    return {
        "pacing": {
            "avgDuration": dna.get("avgShotDuration", 0),
            "cutRate": dna.get("cutRate", 0),
        },
        "motion": {
            "avgMagnitude": dna.get("motionStats", {}).get("avg_magnitude", 0),
            "hasHighMotion": dna.get("motionStats", {}).get("avg_magnitude", 0) > 0.15,
        },
        "rhythm": {
            "tempo": dna.get("rhythm", {}).get("tempo", 0),
            "isBeatDriven": dna.get("rhythm", {}).get("isBeatDriven", False),
        },
        "color": {
            "grade": dna.get("colorProfile", {}).get("grade", "normal"),
            "temperature": dna.get("colorProfile", {}).get("color_temperature", "neutral"),
        },
        "shotTypes": {
            "distribution": dna.get("shotTypes", {}).get("distribution", {}),
            "dominantType": dna.get("shotTypes", {}).get("dominantType", "medium"),
        },
        "effects": {
            "totalEffects": dna.get("effects", {}).get("totalEffects", 0),
            "effectsPerShot": dna.get("effects", {}).get("effectsPerShot", 0),
        },
        "text": {
            "hasText": dna.get("text", {}).get("hasText", False),
            "textFrequency": dna.get("text", {}).get("textFrequency", 0),
        },
        "speed": {
            "avgSpeed": dna.get("speed", {}).get("avgSpeed", 1.0),
            "hasRamps": dna.get("speed", {}).get("hasRamps", False),
        },
        "semantic": {
            "dominantEventType": dna.get("semanticEvents", {}).get("dominantEventType", "action"),
            "dominantEmotion": dna.get("semanticEvents", {}).get("dominantEmotion", "neutral"),
        },
    }


# ── Stub strategies ──────────────────────────────────────────────────

def _blend_dominant_wins(dnas: List[Dict], weights: List[float]) -> Dict:
    """Dominant wins: highest-weighted DNA takes all fields."""
    primary_idx = weights.index(max(weights))
    result = dict(dnas[primary_idx])
    result["_blendingMeta"] = {
        "strategy": "dominant_wins",
        "sources": [{"name": dna.get("name"), "weight": w} for dna, w in zip(dnas, weights)],
    }
    return result


def _blend_union(dnas: List[Dict], weights: List[float]) -> Dict:
    """Union: merge all effects/transitions, take primary for everything else."""
    # Start with dominant
    result = _blend_dominant_wins(dnas, weights)
    
    # Union of effects
    all_transitions = set()
    all_visual = set()
    for dna in dnas:
        all_transitions.update(dna.get("effects", {}).get("transitions", {}).keys())
        all_visual.update(dna.get("effects", {}).get("visualEffects", {}).keys())
    
    result["effects"]["transitions"] = {t: 1.0 for t in all_transitions}
    result["effects"]["visualEffects"] = {v: 1.0 for v in all_visual}
    result["_blendingMeta"]["strategy"] = "union"
    
    return result
