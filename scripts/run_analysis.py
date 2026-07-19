#!/usr/bin/env python3
"""
run_analysis.py — Complete analysis pipeline CLI.

Runs the full pipeline (normalization → genre → analyzers → composition → audio),
then optionally renders the QA visualizer.

Usage:
    python scripts/run_analysis.py <video> [--name NAME] [--output JSON] [--visualize]
"""

import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))


def main():
    parser = argparse.ArgumentParser(description="Run full analysis pipeline")
    parser.add_argument("video", help="Video path to analyze")
    parser.add_argument("--name", default="reference", help="Analysis name")
    parser.add_argument("--output", default=None, help="Output JSON path")
    parser.add_argument("--visualize", action="store_true",
                        help="Render QA visualizer after analysis")
    parser.add_argument("--visualize-layers", default=None,
                        help="Comma-separated layers for visualizer (default: all)")
    parser.add_argument("--no-audio", action="store_true", help="Skip audio analysis")

    args = parser.parse_args()

    from analyzers.pipeline_context import run_pipeline

    result = run_pipeline(args.video, name=args.name)

    output_path = args.output or f"/tmp/{args.name}-analysis.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)
    print(f"Analysis saved to: {output_path}")

    if args.visualize:
        viz_args = [
            "python", os.path.join(os.path.dirname(__file__), "analysis_visualizer.py"),
            args.video, output_path,
        ]
        if args.visualize_layers:
            viz_args.extend(["--only", args.visualize_layers])
        if args.no_audio:
            viz_args.append("--no-audio")
        subprocess.run(viz_args)

    # Print summary
    g = result.get("genre", "?")
    gc = result.get("genre_confidence", 0)
    v = result.get("video", {})
    shots = len(result.get("shots", []))
    cuts = [t for t in result.get("edit_events", {}).get("transitions", [])
            if t.get("type") == "cut"]
    print(f"\n{'='*50}")
    print(f"  {result.get('name', 'video')}")
    print(f"  Genre: {g} (conf={gc:.2f})")
    print(f"  Duration: {v.get('duration', 0):.1f}s {v.get('resolution', '?')}")
    print(f"  Shots: {shots}, Cuts: {len(cuts)}")
    print(f"  Audio stems: {result.get('audio', {}).get('stems', {})}")
    comp = result.get("composition", {})
    if comp:
        print(f"  Composition: RoT={comp.get('avgRuleOfThirds', 0):.2f} "
              f"Headroom={comp.get('avgHeadroom', 0):.2f} "
              f"Symmetry={comp.get('avgSymmetry', 0):.2f}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
