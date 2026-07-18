"""Kove launch presets — built-in style profiles for common use cases.

Usage:
    python scripts/presets.py --list                    # list all presets
    python scripts/presets.py --show fast_tiktok        # show preset details
    python scripts/presets.py --validate                # validate all presets load
"""

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESETS_DIR = REPO_ROOT / "presets"
INDEX_FILE = PRESETS_DIR / "index.json"


def load_index() -> dict:
    with open(INDEX_FILE) as f:
        return json.load(f)


def load_preset(preset_id: str) -> dict:
    index = load_index()
    for p in index["presets"]:
        if p["id"] == preset_id:
            profile_path = REPO_ROOT / p["file"]
            with open(profile_path) as f:
                return json.load(f)
    raise ValueError(f"Preset '{preset_id}' not found")


def list_presets():
    index = load_index()
    print(f"Kove Launch Presets ({len(index['presets'])})\n")
    print(f"{'ID':20s} {'Mode':12s} {'Name':30s}")
    print("-" * 62)
    for p in index["presets"]:
        print(f"{p['id']:20s} {p['mode']:12s} {p['name']:30s}")
    print()
    for p in index["presets"]:
        print(f"  {p['id']}: {p['description']}")
        print(f"           Tags: {', '.join(p['tags'])}")
        print()


def show_preset(preset_id: str):
    profile = load_preset(preset_id)
    print(json.dumps(profile, indent=2))


def validate_all():
    index = load_index()
    errors = []
    for p in index["presets"]:
        path = REPO_ROOT / p["file"]
        if not path.exists():
            errors.append(f"  ✗ {p['id']}: file not found at {p['file']}")
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            assert data.get("profile_id") == f"preset_{p['id']}", \
                f"profile_id mismatch: expected preset_{p['id']}, got {data.get('profile_id')}"
            assert "pacing" in data, "missing pacing"
            assert "transition_preferences" in data, "missing transition_preferences"
            assert data.get("mode") in ("montage", "dialogue"), \
                f"invalid mode: {data.get('mode')}"
            print(f"  ✓ {p['id']}: valid")
        except Exception as e:
            errors.append(f"  ✗ {p['id']}: {e}")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors:
            print(e)
        return False
    print(f"\nAll {len(index['presets'])} presets valid ✓")
    return True


def main():
    parser = argparse.ArgumentParser(description="Kove launch presets")
    parser.add_argument("--list", action="store_true", help="List all presets")
    parser.add_argument("--show", metavar="ID", help="Show preset details")
    parser.add_argument("--validate", action="store_true", help="Validate all presets")
    args = parser.parse_args()

    if args.list:
        list_presets()
    elif args.show:
        show_preset(args.show)
    elif args.validate:
        ok = validate_all()
        sys.exit(0 if ok else 1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
