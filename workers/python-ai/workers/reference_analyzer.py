"""
reference_analyzer.py — Combined rhythm + perception analysis for reference videos.
Calls beat_engine.analyze_rhythm() and perception_pro.run() and merges results.
"""
from __future__ import annotations

import json
import sys
from typing import Any


def analyze_reference(file_path: str) -> dict[str, Any]:
    from beat_engine import analyze_rhythm
    from perception_pro import run

    rhythm = analyze_rhythm(file_path)
    perception = run(file_path)

    return {
        "rhythm": rhythm,
        "perception": perception,
    }


if __name__ == "__main__":
    print(json.dumps(analyze_reference(sys.argv[1])))
