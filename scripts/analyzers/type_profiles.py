"""
Type Profiles
Per-type threshold overrides for analyzers.

Each video type has different editing grammar. These profiles
adjust analyzer behavior based on the classified reference type.

Currently defined:
- sports_highlight: Fast cuts, close-ups on action, high motion

Others use defaults until calibrated with real eval data.
"""

from typing import Dict, Any

# ── Default Thresholds ────────────────────────────────────────────────
DEFAULTS = {
    "shot_type": {
        "extreme_close_face_ratio": 0.40,
        "close_face_ratio": 0.25,
        "medium_face_ratio": 0.10,
    },
    "effects": {
        "confidence_threshold": 0.7,
    },
    "text": {
        "confidence_threshold": 0.6,
    },
}

# ── Per-Type Overrides ────────────────────────────────────────────────
# Only sports_highlight is calibrated for now.
# Others will be added after eval data shows what needs tuning.

TYPE_PROFILES: Dict[str, Dict[str, Any]] = {
    "sports_highlight": {
        "description": "Fast-paced sports clips with close-ups on athletes, crowd shots, replays",
        "shot_type": {
            # Sports has more extreme close-ups (face close-ups on reactions)
            # and more wide shots (court/field views)
            # Lower threshold for close-up detection since faces are often smaller
            "extreme_close_face_ratio": 0.35,
            "close_face_ratio": 0.20,
            "medium_face_ratio": 0.08,
        },
        "effects": {
            # Sports edits often use flash cuts and speed ramps
            # Lower threshold to catch more effects
            "confidence_threshold": 0.6,
        },
        "text": {
            # Sports edits often have scoreboard text, player names
            # Keep threshold high to avoid false positives
            "confidence_threshold": 0.65,
        },
    },
    
    "vlog": {
        "description": "Personal vlogs, talking head, day-in-life content",
        "shot_type": {
            # Vlogs have more medium shots (talking head)
            # Use defaults
        },
        "effects": {
            # Vlogs use fewer effects
            "confidence_threshold": 0.7,
        },
        "text": {
            # Vlogs often have lower-third text, titles
            "confidence_threshold": 0.6,
        },
    },
    
    "amv_anime": {
        "description": "Anime music videos, fast cuts synced to music",
        "shot_type": {
            # AMVs have varied framing
            # Use defaults
        },
        "effects": {
            # AMVs use lots of effects (glow, flash, shake)
            "confidence_threshold": 0.6,
        },
        "text": {
            # AMVs often have lyrics/subtitles
            "confidence_threshold": 0.55,
        },
    },
    
    "dance_edit": {
        "description": "Dance performances, choreography, TikTok dance trends",
        "shot_type": {
            # Dance edits focus on full-body shots
            "medium_face_ratio": 0.12,
        },
        "effects": {
            # Dance edits use beat-synced effects
            "confidence_threshold": 0.65,
        },
        "text": {
            "confidence_threshold": 0.6,
        },
    },
    
    "gaming_montage": {
        "description": "Gaming highlights, kills, clips, montages",
        "shot_type": {
            # Gaming has UI elements that look like text
            # Use defaults
        },
        "effects": {
            # Gaming montages use lots of effects
            "confidence_threshold": 0.6,
        },
        "text": {
            # Gaming has HUD text, kill feeds
            # Keep threshold high
            "confidence_threshold": 0.7,
        },
    },
    
    "movie_trailer": {
        "description": "Film trailers, teasers, promotional clips",
        "shot_type": {
            # Trailers have cinematic framing
            # Use defaults
        },
        "effects": {
            # Trailers use professional effects
            "confidence_threshold": 0.7,
        },
        "text": {
            # Trailers have title cards, release dates
            "confidence_threshold": 0.6,
        },
    },
    
    "tiktok_general": {
        "description": "General TikTok content, trends, comedy, lifestyle",
        "shot_type": {
            # TikTok has varied framing
            # Use defaults
        },
        "effects": {
            # TikTok uses lots of effects
            "confidence_threshold": 0.65,
        },
        "text": {
            # TikTok has text overlays, captions
            "confidence_threshold": 0.55,
        },
    },
    
    "unknown": {
        "description": "Unclassified content",
        # All defaults
    },
}


def get_type_profile(video_type: str) -> Dict[str, Any]:
    """
    Get the profile for a video type.
    Falls back to defaults if type not found.
    """
    return TYPE_PROFILES.get(video_type, TYPE_PROFILES["unknown"])


def get_threshold(video_type: str, category: str, key: str) -> Any:
    """
    Get a specific threshold value.
    
    Args:
        video_type: The classified video type
        category: Analyzer category (shot_type, effects, text)
        key: Specific threshold key
    
    Returns:
        Threshold value, or default if not found
    """
    profile = get_type_profile(video_type)
    category_profile = profile.get(category, {})
    
    # Get from type profile, fall back to defaults
    if key in category_profile:
        return category_profile[key]
    
    return DEFAULTS.get(category, {}).get(key)


if __name__ == "__main__":
    # Print all profiles
    print("Type Profiles:")
    print("=" * 60)
    
    for vtype, profile in TYPE_PROFILES.items():
        print(f"\n{vtype}:")
        print(f"  {profile.get('description', 'No description')}")
        
        for category, settings in profile.items():
            if category == "description":
                continue
            if settings:  # Only print non-empty
                print(f"  {category}: {settings}")
