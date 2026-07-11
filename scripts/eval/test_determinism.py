#!/usr/bin/env python3
"""
Determinism Test
Runs grammar extraction multiple times and asserts byte-identical output.

Usage:
  python3 scripts/eval/test_determinism.py                    # Test Curry reference
  python3 scripts/eval/test_determinism.py --all              # Test all references
  python3 scripts/eval/test_determinism.py --runs 5           # Run 5 times
"""

import json
import os
import sys
import hashlib
from pathlib import Path

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
sys.path.insert(0, str(WORKSPACE / "scripts"))

# Test references
REFERENCES = [
    {"name": "steph-curry", "path": "reference-edits-2/steph curry.MP4"},
    {"name": "harvey", "path": "reference-edits-2/harvey.MP4"},
    {"name": "lewis-hamilton", "path": "reference-edits-2/lewis hamilton.MP4"},
    {"name": "tyler-the-creator", "path": "reference-edits-2/tyler_the_creator.MP4"},
    {"name": "new-york", "path": "reference-edits-2/new york living the moment.MP4"},
]

# Fields to exclude from comparison (non-deterministic)
EXCLUDE_FIELDS = {
    "semanticEvents",  # LLM API calls are non-deterministic
    "audioAnalysis",   # May vary slightly
    "grammarRules.semantic",  # Depends on semantic events
}


def get_deterministic_hash(dna: dict) -> str:
    """Compute hash of deterministic fields only."""
    # Remove non-deterministic fields
    filtered = {k: v for k, v in dna.items() if k not in EXCLUDE_FIELDS}
    
    # Also remove semantic events from shots
    if "shots" in filtered:
        filtered["shots"] = [
            {k: v for k, v in shot.items() if k != "semanticEvent"}
            for shot in filtered["shots"]
        ]
    
    # Convert to JSON with sorted keys for consistency
    json_str = json.dumps(filtered, sort_keys=True, default=str)
    
    return hashlib.sha256(json_str.encode()).hexdigest()


def run_single_test(ref: dict, run_num: int) -> dict:
    """Run grammar extraction once and return DNA hash."""
    from grammar_extractor import extract_grammar
    
    video_path = WORKSPACE / ref["path"]
    if not video_path.exists():
        return {"error": f"File not found: {video_path}"}
    
    dna = extract_grammar(str(video_path), ref["name"])
    dna_hash = get_deterministic_hash(dna)
    
    return {
        "hash": dna_hash,
        "totalShots": dna.get("totalShots"),
        "avgShotDuration": dna.get("avgShotDuration"),
        "motionAvg": dna.get("motionStats", {}).get("avg_magnitude"),
        "colorGrade": dna.get("colorProfile", {}).get("grade"),
    }


def test_determinism(ref: dict, num_runs: int = 3) -> dict:
    """Test determinism for a single reference."""
    name = ref["name"]
    
    results = []
    for i in range(num_runs):
        print(f"  Run {i+1}/{num_runs}...", end=" ", flush=True)
        result = run_single_test(ref, i)
        
        if "error" in result:
            print(f"ERROR: {result['error']}")
            return {"name": name, "passed": False, "error": result["error"]}
        
        results.append(result)
        print(f"hash={result['hash'][:16]}...")
    
    # Check if all hashes match
    hashes = [r["hash"] for r in results]
    all_match = len(set(hashes)) == 1
    
    return {
        "name": name,
        "passed": all_match,
        "runs": num_runs,
        "unique_hashes": len(set(hashes)),
        "sample_result": results[0] if results else None,
    }


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Determinism Test")
    parser.add_argument("--all", action="store_true", help="Test all references")
    parser.add_argument("--runs", type=int, default=3, help="Number of runs per reference")
    
    args = parser.parse_args()
    
    print("\n" + "=" * 60)
    print("DETERMINISM TEST")
    print("=" * 60)
    
    refs = REFERENCES if args.all else [REFERENCES[0]]
    
    all_passed = True
    
    for ref in refs:
        print(f"\n{ref['name']}:")
        result = test_determinism(ref, args.runs)
        
        if result["passed"]:
            print(f"  ✅ PASS — {result['runs']} runs, all identical")
        else:
            print(f"  ❌ FAIL — {result['unique_hashes']} unique hashes out of {result['runs']} runs")
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("ALL TESTS PASSED ✅")
    else:
        print("SOME TESTS FAILED ❌")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
