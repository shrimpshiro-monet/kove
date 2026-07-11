#!/usr/bin/env python3
"""Quick comparison - uses existing baseline/current files."""
import json
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
BASELINE = WORKSPACE / "scripts/eval/baseline"
CURRENT = WORKSPACE / "scripts/eval/current"

def get_nested(data, path):
    parts = path.split(".")
    for p in parts:
        if isinstance(data, dict) and p in data:
            data = data[p]
        else:
            return None
    return data

FIELDS = [
    ("totalShots", 0.15), ("avgShotDuration", 0.10), ("cutRate", 0.15),
    ("motionStats.avg_magnitude", 0.15), ("colorProfile.grade", 0),
    ("shotTypes.dominantType", 0), ("effects.totalEffects", 0.25),
    ("text.hasText", 0), ("speed.avgSpeed", 0.15), ("speed.hasRamps", 0),
    ("semanticEvents.dominantEventType", 0), ("grammarRules.pacing.avgDuration", 0.10),
]

print(f"\n{'='*90}")
print("GRAMMAR EXTRACTOR REGRESSION EVAL")
print(f"{'='*90}")
print(f"{'Reference':<20} {'Field':<35} {'Baseline':>12} {'Current':>12} {'Delta':>10} {'Status':>8}")
print(f"{'-'*90}")

for name in ["steph-curry", "harvey", "lewis-hamilton", "tyler-the-creator", "new-york"]:
    b_path = BASELINE / f"{name}-dna.json"
    c_path = CURRENT / f"{name}-dna.json"
    
    if not b_path.exists() or not c_path.exists():
        print(f"{name:<20} {'MISSING DATA':<35}")
        continue
    
    with open(b_path) as f: b = json.load(f)
    with open(c_path) as f: c = json.load(f)
    
    first = True
    for field, tol in FIELDS:
        bv = get_nested(b, field)
        cv = get_nested(c, field)
        label = name if first else ""
        first = False
        
        if bv is None and cv is None:
            print(f"{label:<20} {field:<35} {'N/A':>12} {'N/A':>12} {'':>10} {'OK':>8}")
        elif bv is None or cv is None:
            print(f"{label:<20} {field:<35} {str(bv):>12} {str(cv):>12} {'':>10} {'MISS':>8}")
        elif isinstance(bv, str):
            match = bv == cv
            print(f"{label:<20} {field:<35} {bv:>12} {cv:>12} {'same' if match else 'diff':>10} {'OK' if match else 'DIFF':>8}")
        elif isinstance(bv, bool):
            match = bv == cv
            print(f"{label:<20} {field:<35} str(bv):>12 str(cv):>12 {'same' if match else 'diff':>10} {'OK' if match else 'DIFF':>8}")
        else:
            try:
                delta = abs(float(cv) - float(bv))
                pct = delta / abs(float(bv)) * 100 if bv != 0 else (100 if delta != 0 else 0)
                match = pct <= tol * 100
                print(f"{label:<20} {field:<35} {float(bv):>12.3f} {float(cv):>12.3f} {pct:>+9.1f}% {'OK' if match else 'DIFF':>8}")
            except:
                print(f"{label:<20} {field:<35} {str(bv):>12} {str(cv):>12} {'':>10} {'ERR':>8}")

print(f"{'='*90}")
