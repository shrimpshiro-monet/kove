#!/usr/bin/env python3
"""
Loopback Eval — Grammar Match Scoring
Takes a reference DNA, renders it, re-extracts DNA from render, scores match.

Usage:
  python3 scripts/eval/loopback.py                    # Run on all references
  python3 scripts/eval/loopback.py --reference steph-curry  # Run on specific reference
  python3 scripts/eval/loopback.py --verbose          # Show detailed comparison
"""

import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Dict, List, Any, Optional

WORKSPACE = Path("/Users/hamza/Desktop/reserves/monet-ai-story")
EVAL_DIR = WORKSPACE / "scripts" / "eval"
BASELINE_DIR = EVAL_DIR / "baseline"
LOOPBACK_DIR = EVAL_DIR / "loopback"
OUTPUT_DIR = WORKSPACE / "output"

# Add scripts to path
sys.path.insert(0, str(WORKSPACE / "scripts"))

# ── References ────────────────────────────────────────────────────────
REFERENCES = [
    {
        "name": "steph-curry",
        "path": "reference-edits-2/steph curry.MP4",
        "genre": "sports",
    },
    {
        "name": "harvey",
        "path": "reference-edits-2/harvey.MP4",
        "genre": "tv-edit",
    },
    {
        "name": "lewis-hamilton",
        "path": "reference-edits-2/lewis hamilton.MP4",
        "genre": "sports-f1",
    },
    {
        "name": "tyler-the-creator",
        "path": "reference-edits-2/tyler_the_creator.MP4",
        "genre": "music-artist",
    },
    {
        "name": "new-york",
        "path": "reference-edits-2/new york living the moment.MP4",
        "genre": "lifestyle",
    },
]

# ── Tolerance Config ──────────────────────────────────────────────────
# Tolerance per field for loopback matching
# Tighter than regression eval because we're comparing same source
TOLERANCE_CONFIG = {
    "totalShots": {"tolerance": 0.20, "weight": 1.0},
    "avgShotDuration": {"tolerance": 0.15, "weight": 1.5},
    "cutRate": {"tolerance": 0.20, "weight": 1.0},
    "motionStats.avg_magnitude": {"tolerance": 0.25, "weight": 0.8},
    "motionStats.peak_magnitude": {"tolerance": 0.30, "weight": 0.5},
    "colorProfile.grade": {"tolerance": 0, "weight": 2.0},
    "colorProfile.saturation_mean": {"tolerance": 0.25, "weight": 1.0},
    "shotTypes.dominantType": {"tolerance": 0, "weight": 2.0},
    "shotTypes.variedFraming": {"tolerance": 0, "weight": 1.0},
    "effects.totalEffects": {"tolerance": 0.30, "weight": 0.8},
    "effects.effectsPerShot": {"tolerance": 0.25, "weight": 1.0},
    "text.hasText": {"tolerance": 0, "weight": 1.5},
    "text.textFrequency": {"tolerance": 0.25, "weight": 0.8},
    "speed.avgSpeed": {"tolerance": 0.20, "weight": 1.0},
    "speed.hasRamps": {"tolerance": 0, "weight": 0.8},
    "semanticEvents.dominantEventType": {"tolerance": 0, "weight": 1.5},
    "semanticEvents.dominantEmotion": {"tolerance": 0, "weight": 1.0},
    "grammarRules.pacing.avgDuration": {"tolerance": 0.15, "weight": 1.5},
    "grammarRules.motion.hasHighMotion": {"tolerance": 0, "weight": 1.0},
    "grammarRules.color.grade": {"tolerance": 0, "weight": 2.0},
    "grammarRules.effects.effectsPerShot": {"tolerance": 0.25, "weight": 1.0},
}


def get_nested(data: dict, path: str) -> Any:
    """Get nested value from dict using dot notation."""
    parts = path.split(".")
    current = data
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def compute_match_score(original: dict, rendered: dict) -> dict:
    """
    Compute grammar match score between original and rendered DNA.
    
    Returns:
        score: 0-100 weighted match score
        field_scores: per-field match details
        summary: human-readable summary
    """
    field_scores = []
    total_weight = 0
    weighted_matches = 0
    
    for field, config in TOLERANCE_CONFIG.items():
        original_val = get_nested(original, field)
        rendered_val = get_nested(rendered, field)
        tolerance = config["tolerance"]
        weight = config["weight"]
        
        total_weight += weight
        
        # Compare
        if original_val is None and rendered_val is None:
            match = True
            score = 1.0
        elif original_val is None or rendered_val is None:
            match = False
            score = 0.0
        elif isinstance(original_val, str):
            match = original_val == rendered_val
            score = 1.0 if match else 0.0
        elif isinstance(original_val, bool):
            match = original_val == rendered_val
            score = 1.0 if match else 0.0
        elif isinstance(original_val, (int, float)):
            try:
                o = float(original_val)
                r = float(rendered_val)
                if o == 0:
                    match = r == 0
                    score = 1.0 if match else 0.0
                else:
                    delta_pct = abs(r - o) / abs(o)
                    match = delta_pct <= tolerance
                    score = max(0, 1.0 - (delta_pct / tolerance)) if tolerance > 0 else (1.0 if match else 0.0)
            except (TypeError, ValueError):
                match = False
                score = 0.0
        else:
            match = original_val == rendered_val
            score = 1.0 if match else 0.0
        
        weighted_score = score * weight
        weighted_matches += weighted_score
        
        field_scores.append({
            "field": field,
            "original": original_val,
            "rendered": rendered_val,
            "match": match,
            "score": score,
            "weighted_score": weighted_score,
            "weight": weight,
        })
    
    # Calculate total score (0-100)
    total_score = (weighted_matches / total_weight * 100) if total_weight > 0 else 0
    
    # Build summary
    matched = sum(1 for f in field_scores if f["match"])
    total = len(field_scores)
    
    return {
        "score": round(total_score, 1),
        "matched_fields": matched,
        "total_fields": total,
        "field_scores": field_scores,
        "summary": f"{matched}/{total} fields match ({total_score:.1f}%)",
    }


def run_loopback_single(ref: dict, verbose: bool = False) -> dict:
    """Run loopback eval on a single reference."""
    name = ref["name"]
    video_path = WORKSPACE / ref["path"]
    
    if not video_path.exists():
        return {
            "name": name,
            "genre": ref["genre"],
            "score": 0,
            "error": f"File not found: {video_path}",
        }
    
    try:
        from grammar_extractor import extract_grammar
        from monet_pipeline import generate_edl_from_dna, render_with_editly
        
        # Step 1: Extract original DNA
        if verbose:
            print(f"  [1/3] Extracting original DNA...")
        original_dna = extract_grammar(str(video_path), name)
        
        # Step 2: Generate EDL and render
        if verbose:
            print(f"  [2/3] Rendering...")
        LOOPBACK_DIR.mkdir(parents=True, exist_ok=True)
        render_path = LOOPBACK_DIR / f"{name}-loopback.mp4"
        
        edl = generate_edl_from_dna(original_dna, str(video_path))
        render_with_editly(edl, str(render_path))
        
        if not render_path.exists():
            return {
                "name": name,
                "genre": ref["genre"],
                "score": 0,
                "error": "Render failed",
            }
        
        # Step 3: Re-extract DNA from render
        if verbose:
            print(f"  [3/3] Re-extracting DNA from render...")
        rendered_dna = extract_grammar(str(render_path), f"{name}-rendered")
        
        # Step 4: Compute match score
        result = compute_match_score(original_dna, rendered_dna)
        
        # Save results
        output = {
            "name": name,
            "genre": ref["genre"],
            "score": result["score"],
            "matched_fields": result["matched_fields"],
            "total_fields": result["total_fields"],
            "field_scores": result["field_scores"],
            "render_path": str(render_path),
        }
        
        output_path = LOOPBACK_DIR / f"{name}-loopback.json"
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2, default=str)
        
        return output
        
    except Exception as e:
        return {
            "name": name,
            "genre": ref["genre"],
            "score": 0,
            "error": f"{type(e).__name__}: {str(e)[:100]}",
            "traceback": traceback.format_exc(),
        }


def print_loopback_results(results: List[dict]):
    """Print loopback results as a table."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich import box
        
        console = Console()
        
        table = Table(
            title="Loopback Eval — Grammar Match Scores",
            box=box.ROUNDED,
        )
        
        table.add_column("Reference", style="cyan")
        table.add_column("Genre", style="dim")
        table.add_column("Score", justify="right", style="bold")
        table.add_column("Fields Match", justify="right")
        table.add_column("Status", justify="center")
        
        for result in results:
            name = result["name"]
            genre = result["genre"]
            score = result.get("score", 0)
            matched = result.get("matched_fields", 0)
            total = result.get("total_fields", 0)
            error = result.get("error")
            
            if error:
                table.add_row(name, genre, "0", "0/0", "[red]ERROR[/red]")
            elif score >= 80:
                table.add_row(name, genre, f"{score:.1f}", f"{matched}/{total}", "[green]PASS[/green]")
            elif score >= 60:
                table.add_row(name, genre, f"{score:.1f}", f"{matched}/{total}", "[yellow]WARN[/yellow]")
            else:
                table.add_row(name, genre, f"{score:.1f}", f"{matched}/{total}", "[red]FAIL[/red]")
        
        # Summary row
        valid_scores = [r["score"] for r in results if "score" in r]
        avg_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0
        
        table.add_section()
        table.add_row("AVERAGE", "", f"[bold]{avg_score:.1f}[/bold]", "", "")
        
        console.print(table)
        
    except ImportError:
        # Plain ASCII fallback
        print("\n" + "=" * 70)
        print("LOOPBACK EVAL — GRAMMAR MATCH SCORES")
        print("=" * 70)
        print(f"{'Reference':<20} {'Genre':<15} {'Score':>8} {'Fields':>10} {'Status':>10}")
        print("-" * 70)
        
        for result in results:
            name = result["name"]
            genre = result["genre"]
            score = result.get("score", 0)
            matched = result.get("matched_fields", 0)
            total = result.get("total_fields", 0)
            error = result.get("error")
            
            if error:
                status = "ERROR"
            elif score >= 80:
                status = "PASS"
            elif score >= 60:
                status = "WARN"
            else:
                status = "FAIL"
            
            print(f"{name:<20} {genre:<15} {score:>7.1f} {matched:>5}/{total:<4} {status:>10}")
        
        valid_scores = [r["score"] for r in results if "score" in r]
        avg_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0
        print("-" * 70)
        print(f"{'AVERAGE':<20} {'':<15} {avg_score:>7.1f}")
        print("=" * 70)


def run_loopback(reference_name: Optional[str] = None, verbose: bool = False):
    """Run loopback eval."""
    print("\n" + "=" * 60)
    print("LOOPBACK EVAL — GRAMMAR MATCH SCORING")
    print("=" * 60)
    
    LOOPBACK_DIR.mkdir(parents=True, exist_ok=True)
    
    # Filter references
    refs = REFERENCES
    if reference_name:
        refs = [r for r in REFERENCES if r["name"] == reference_name]
        if not refs:
            print(f"\nError: Reference '{reference_name}' not found")
            print(f"Available: {[r['name'] for r in REFERENCES]}")
            return
    
    # Run loopback on each reference
    results = []
    total_time = 0
    
    for i, ref in enumerate(refs):
        print(f"\n[{i+1}/{len(refs)}] {ref['name']} ({ref['genre']})...")
        
        start_time = time.time()
        result = run_loopback_single(ref, verbose=verbose)
        elapsed = time.time() - start_time
        total_time += elapsed
        
        results.append(result)
        
        score = result.get("score", 0)
        error = result.get("error")
        
        if error:
            print(f"  Error: {error}")
        else:
            print(f"  Score: {score:.1f}/100 ({result.get('matched_fields', 0)}/{result.get('total_fields', 0)} fields)")
        
        print(f"  Time: {elapsed:.1f}s")
    
    # Print results table
    print_loopback_results(results)
    
    # Print detailed field comparison if verbose
    if verbose:
        print(f"\n{'=' * 60}")
        print("DETAILED FIELD COMPARISON")
        print(f"{'=' * 60}")
        
        for result in results:
            if result.get("error"):
                continue
            
            print(f"\n{result['name']} (Score: {result['score']:.1f}):")
            for field in result.get("field_scores", []):
                status = "✓" if field["match"] else "✗"
                orig = field["original"]
                rendered = field["rendered"]
                print(f"  {status} {field['field']:<40} {str(orig):>15} → {str(rendered):>15}")
    
    # Summary
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    
    valid_scores = [r["score"] for r in results if "score" in r]
    avg_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0
    
    print(f"  References evaluated: {len(results)}")
    print(f"  Average score: {avg_score:.1f}/100")
    print(f"  Total time: {total_time:.1f}s")
    
    # Score interpretation
    print(f"\n  Score Interpretation:")
    print(f"    80-100: Excellent grammar preservation")
    print(f"    60-79:  Good, some drift in extracted features")
    print(f"    40-59:  Moderate, significant differences")
    print(f"    0-39:   Poor, major grammar loss")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Loopback Eval — Grammar Match Scoring")
    parser.add_argument("--reference", "-r", help="Run on specific reference (default: all)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show detailed comparison")
    
    args = parser.parse_args()
    
    run_loopback(reference_name=args.reference, verbose=args.verbose)


if __name__ == "__main__":
    main()
