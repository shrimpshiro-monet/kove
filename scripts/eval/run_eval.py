#!/usr/bin/env python3
"""
Regression Eval — Grammar Extractor
Runs grammar extraction on all reference videos, compares current vs baseline.

Usage:
  python3 scripts/eval/run_eval.py           # Run eval, compare to baseline
  python3 scripts/eval/run_eval.py --save    # Run eval, save as new baseline
  python3 scripts/eval/run_eval.py --diff    # Only show differences
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
CURRENT_DIR = EVAL_DIR / "current"

# Add scripts to path
sys.path.insert(0, str(WORKSPACE / "scripts"))

# ── Reference Videos ──────────────────────────────────────────────────
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

# ── Fields to Compare ─────────────────────────────────────────────────
# Fields with expected types and tolerances
COMPARE_FIELDS = {
    "totalShots": {"tolerance": 0.15, "type": "int"},
    "avgShotDuration": {"tolerance": 0.10, "type": "float"},
    "cutRate": {"tolerance": 0.15, "type": "float"},
    "motionStats.avg_magnitude": {"tolerance": 0.15, "type": "float"},
    "motionStats.peak_magnitude": {"tolerance": 0.20, "type": "float"},
    "colorProfile.grade": {"tolerance": 0, "type": "string"},
    "colorProfile.saturation_mean": {"tolerance": 0.20, "type": "float"},
    "shotTypes.dominantType": {"tolerance": 0, "type": "string"},
    "shotTypes.variedFraming": {"tolerance": 0, "type": "bool"},
    "effects.totalEffects": {"tolerance": 0.25, "type": "int"},
    "effects.effectsPerShot": {"tolerance": 0.20, "type": "float"},
    "text.hasText": {"tolerance": 0, "type": "bool"},
    "text.textFrequency": {"tolerance": 0.20, "type": "float"},
    "speed.avgSpeed": {"tolerance": 0.15, "type": "float"},
    "speed.hasRamps": {"tolerance": 0, "type": "bool"},
    "semanticEvents.dominantEventType": {"tolerance": 0, "type": "string"},
    "semanticEvents.dominantEmotion": {"tolerance": 0, "type": "string"},
    "grammarRules.pacing.avgDuration": {"tolerance": 0.10, "type": "float"},
    "grammarRules.motion.hasHighMotion": {"tolerance": 0, "type": "bool"},
    "grammarRules.color.grade": {"tolerance": 0, "type": "string"},
    "grammarRules.effects.effectsPerShot": {"tolerance": 0.20, "type": "float"},
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


def compare_values(baseline: Any, current: Any, field_config: dict) -> dict:
    """Compare two values and return delta info."""
    if baseline is None and current is None:
        return {"match": True, "delta": 0, "delta_pct": 0}
    
    if baseline is None or current is None:
        return {"match": False, "delta": None, "delta_pct": None, "reason": "missing"}
    
    field_type = field_config["type"]
    tolerance = field_config["tolerance"]
    
    if field_type == "string":
        match = baseline == current
        return {"match": match, "delta": "changed" if not match else "same", "delta_pct": 0}
    
    if field_type == "bool":
        match = baseline == current
        return {"match": match, "delta": "changed" if not match else "same", "delta_pct": 0}
    
    if field_type in ("int", "float"):
        try:
            b = float(baseline)
            c = float(current)
            delta = c - b
            delta_pct = abs(delta / b * 100) if b != 0 else (100 if delta != 0 else 0)
            match = delta_pct <= (tolerance * 100)
            return {"match": match, "delta": delta, "delta_pct": delta_pct}
        except (TypeError, ValueError):
            return {"match": False, "delta": None, "delta_pct": None, "reason": "parse_error"}
    
    return {"match": True, "delta": 0, "delta_pct": 0}


def format_value(value: Any, field_type: str) -> str:
    """Format value for display."""
    if value is None:
        return "N/A"
    if field_type == "float":
        return f"{float(value):.3f}"
    if field_type == "int":
        return str(int(value))
    if field_type == "bool":
        return "True" if value else "False"
    return str(value)


def print_table(results: List[dict]):
    """Print comparison table with color coding."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich import box
        
        console = Console()
        
        table = Table(
            title="Grammar Extractor Regression Eval",
            box=box.ROUNDED,
            show_lines=True,
        )
        
        table.add_column("Reference", style="cyan", no_wrap=True)
        table.add_column("Field", style="white")
        table.add_column("Baseline", justify="right", style="dim")
        table.add_column("Current", justify="right")
        table.add_column("Delta", justify="right")
        table.add_column("Status", justify="center")
        
        for ref_result in results:
            ref_name = ref_result["name"]
            genre = ref_result["genre"]
            first_row = True
            
            if ref_result.get("error"):
                table.add_row(
                    f"{ref_name}\n({genre})",
                    "ERROR",
                    "",
                    ref_result["error"][:50],
                    "",
                    "[red]FAIL[/red]"
                )
                continue
            
            for field_result in ref_result.get("fields", []):
                field = field_result["field"]
                baseline = field_result["baseline"]
                current = field_result["current"]
                comparison = field_result["comparison"]
                
                ref_label = f"{ref_name}\n({genre})" if first_row else ""
                first_row = False
                
                status = "[green]OK[/green]" if comparison["match"] else "[red]CHANGED[/red]"
                delta_str = ""
                
                if comparison["delta_pct"] is not None:
                    delta_pct = comparison["delta_pct"]
                    if isinstance(delta_pct, (int, float)):
                        delta_str = f"{delta_pct:+.1f}%"
                        if not comparison["match"]:
                            status = f"[red]{delta_str}[/red]"
                        else:
                            status = f"[green]{delta_str}[/green]"
                
                table.add_row(
                    ref_label,
                    field,
                    format_value(baseline, field_result["type"]),
                    format_value(current, field_result["type"]),
                    delta_str,
                    status,
                )
        
        console.print(table)
        
    except ImportError:
        # Fallback to plain ASCII table
        print("\n" + "=" * 100)
        print("GRAMMAR EXTRACTOR REGRESSION EVAL")
        print("=" * 100)
        print(f"{'Reference':<20} {'Field':<35} {'Baseline':>12} {'Current':>12} {'Delta':>10} {'Status':>8}")
        print("-" * 100)
        
        for ref_result in results:
            ref_name = ref_result["name"]
            
            if ref_result.get("error"):
                print(f"{ref_name:<20} {'ERROR':<35} {'':>12} {ref_result['error'][:30]:>12} {'':>10} {'FAIL':>8}")
                continue
            
            first_row = True
            for field_result in ref_result.get("fields", []):
                field = field_result["field"]
                baseline = field_result["baseline"]
                current = field_result["current"]
                comparison = field_result["comparison"]
                
                ref_label = ref_name if first_row else ""
                first_row = False
                
                status = "OK" if comparison["match"] else "CHANGED"
                delta_str = ""
                
                if comparison["delta_pct"] is not None:
                    delta_pct = comparison["delta_pct"]
                    if isinstance(delta_pct, (int, float)):
                        delta_str = f"{delta_pct:+.1f}%"
                
                print(f"{ref_label:<20} {field:<35} {format_value(baseline, field_result['type']):>12} {format_value(current, field_result['type']):>12} {delta_str:>10} {status:>8}")
        
        print("=" * 100)


def run_single_eval(ref: dict, output_dir: Path) -> dict:
    """Run grammar extraction on a single reference video."""
    name = ref["name"]
    video_path = WORKSPACE / ref["path"]
    
    # Check if baseline already exists
    baseline_path = output_dir / f"{name}-dna.json"
    if baseline_path.exists():
        try:
            with open(baseline_path) as f:
                dna = json.load(f)
            return {
                "name": name,
                "genre": ref["genre"],
                "dna": dna,
                "elapsed": 0,
                "cached": True,
            }
        except:
            pass
    
    if not video_path.exists():
        return {
            "name": name,
            "genre": ref["genre"],
            "error": f"File not found: {video_path}",
        }
    
    try:
        from grammar_extractor import extract_grammar
        
        start_time = time.time()
        dna = extract_grammar(str(video_path), name)
        elapsed = time.time() - start_time
        
        # Save DNA
        output_path = output_dir / f"{name}-dna.json"
        with open(output_path, "w") as f:
            json.dump(dna, f, indent=2, default=str)
        
        return {
            "name": name,
            "genre": ref["genre"],
            "dna": dna,
            "elapsed": elapsed,
            "output_path": str(output_path),
        }
        
    except Exception as e:
        return {
            "name": name,
            "genre": ref["genre"],
            "error": f"{type(e).__name__}: {str(e)[:100]}",
            "traceback": traceback.format_exc(),
        }


def run_eval(save_baseline: bool = False, diff_only: bool = False):
    """Run full evaluation."""
    print("\n" + "=" * 60)
    print("GRAMMAR EXTRACTOR REGRESSION EVAL")
    print("=" * 60)
    
    # Determine output directory
    output_dir = BASELINE_DIR if save_baseline else CURRENT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    
    mode = "SAVE BASELINE" if save_baseline else "COMPARE TO BASELINE"
    print(f"\nMode: {mode}")
    print(f"Output: {output_dir}")
    
    # Run eval on each reference
    all_results = []
    total_time = 0
    
    for i, ref in enumerate(REFERENCES):
        print(f"\n[{i+1}/{len(REFERENCES)}] {ref['name']} ({ref['genre']})...")
        
        result = run_single_eval(ref, output_dir)
        all_results.append(result)
        
        if result.get("elapsed"):
            total_time += result["elapsed"]
            print(f"  Time: {result['elapsed']:.1f}s")
        
        if result.get("error"):
            print(f"  Error: {result['error']}")
    
    # If saving baseline, just print summary
    if save_baseline:
        print(f"\n{'=' * 60}")
        print(f"BASELINE SAVED")
        print(f"{'=' * 60}")
        print(f"Files saved to: {BASELINE_DIR}")
        print(f"Total time: {total_time:.1f}s")
        return
    
    # Load baselines and compare
    print(f"\n{'=' * 60}")
    print(f"COMPARING TO BASELINE")
    print(f"{'=' * 60}")
    
    comparison_results = []
    
    for result in all_results:
        name = result["name"]
        genre = result["genre"]
        
        if result.get("error"):
            comparison_results.append(result)
            continue
        
        # Load baseline
        baseline_path = BASELINE_DIR / f"{name}-dna.json"
        if not baseline_path.exists():
            comparison_results.append({
                **result,
                "error": f"No baseline found: {baseline_path.name}",
            })
            continue
        
        with open(baseline_path) as f:
            baseline_dna = json.load(f)
        
        current_dna = result["dna"]
        
        # Compare fields
        field_results = []
        for field, config in COMPARE_FIELDS.items():
            baseline_val = get_nested(baseline_dna, field)
            current_val = get_nested(current_dna, field)
            
            comparison = compare_values(baseline_val, current_val, config)
            
            field_results.append({
                "field": field,
                "baseline": baseline_val,
                "current": current_val,
                "type": config["type"],
                "comparison": comparison,
            })
        
        # Count matches
        matches = sum(1 for f in field_results if f["comparison"]["match"])
        total = len(field_results)
        match_rate = matches / total * 100 if total > 0 else 0
        
        comparison_results.append({
            **result,
            "fields": field_results,
            "match_rate": match_rate,
            "matches": matches,
            "total_fields": total,
        })
    
    # Print table
    if not diff_only:
        print_table(comparison_results)
    
    # Print summary
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    
    total_matches = 0
    total_fields = 0
    
    for result in comparison_results:
        name = result["name"]
        
        if result.get("error"):
            print(f"  {name}: ERROR - {result['error'][:60]}")
            continue
        
        matches = result.get("matches", 0)
        total = result.get("total_fields", 0)
        rate = result.get("match_rate", 0)
        
        total_matches += matches
        total_fields += total
        
        status = "PASS" if rate >= 90 else "WARN" if rate >= 70 else "FAIL"
        print(f"  {name}: {matches}/{total} fields match ({rate:.1f}%) [{status}]")
    
    overall_rate = total_matches / total_fields * 100 if total_fields > 0 else 0
    print(f"\n  Overall: {total_matches}/{total_fields} fields match ({overall_rate:.1f}%)")
    print(f"  Total eval time: {total_time:.1f}s")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Grammar Extractor Regression Eval")
    parser.add_argument("--save", action="store_true", help="Save current run as new baseline")
    parser.add_argument("--diff", action="store_true", help="Only show differences")
    
    args = parser.parse_args()
    
    run_eval(save_baseline=args.save, diff_only=args.diff)


if __name__ == "__main__":
    main()
