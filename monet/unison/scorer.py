# monet/unison/scorer.py
from __future__ import annotations
import asyncio
import json
import os
from typing import Dict, List
from monet.unison.harness import EngineRun, UnisonReport


async def _ffprobe_json(path: str) -> dict:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_streams", "-show_format",
        "-of", "json", path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, _ = await proc.communicate()
    return json.loads(out.decode()) if out else {}


async def score_runs(report: UnisonReport,
                     target_width: int = 1080,
                     target_height: int = 1920) -> Dict[str, dict]:
    """
    Produces a per-engine scorecard:
      {
        "freecut": {"resolution_ok": True, "duration_match": 1.0,
                    "size_kb": ..., "render_speed": ..., "overall": 0.82},
        ...
      }
    """
    scores: Dict[str, dict] = {}
    valid_runs = [r for r in report.runs if r.success and r.outputPath]
    if not valid_runs:
        return scores

    fastest = min(r.renderTimeSec for r in valid_runs) if valid_runs else 1.0
    fastest = max(0.01, fastest)

    for run in report.runs:
        s: dict = {"engine": run.engine, "success": run.success}
        if not run.success:
            s["error"] = run.error
            s["overall"] = 0.0
            scores[run.engine] = s
            continue

        probe = await _ffprobe_json(run.outputPath)
        v_streams = [x for x in probe.get("streams", []) if x.get("codec_type") == "video"]
        a_streams = [x for x in probe.get("streams", []) if x.get("codec_type") == "audio"]

        w = v_streams[0].get("width", 0) if v_streams else 0
        h = v_streams[0].get("height", 0) if v_streams else 0
        resolution_ok = (w == target_width and h == target_height)

        actual_dur = float(probe.get("format", {}).get("duration", 0))
        dur_match = max(0.0, 1.0 - abs(actual_dur - run.durationSec) / max(1.0, run.durationSec))

        size_kb = os.path.getsize(run.outputPath) / 1024 if os.path.exists(run.outputPath) else 0
        # speed score: faster = better, normalized
        speed_score = fastest / max(0.01, run.renderTimeSec)

        # bitrate sanity: 1500-6000 kbps for 1080x1920@30 is healthy
        kbps = (size_kb * 8) / max(1.0, actual_dur)
        bitrate_score = (
            1.0 if 1500 <= kbps <= 6000
            else 0.6 if 800 <= kbps < 1500 or 6000 < kbps <= 10000
            else 0.3
        )

        has_audio = len(a_streams) > 0

        overall = (
            (0.25 * (1.0 if resolution_ok else 0.0))
            + (0.20 * dur_match)
            + (0.20 * bitrate_score)
            + (0.20 * speed_score)
            + (0.15 * (1.0 if has_audio else 0.5))
        )

        s.update({
            "width": w, "height": h, "resolution_ok": resolution_ok,
            "duration_sec": actual_dur, "duration_match": round(dur_match, 3),
            "size_kb": round(size_kb, 1), "kbps": round(kbps, 1),
            "bitrate_score": round(bitrate_score, 2),
            "render_time_sec": round(run.renderTimeSec, 2),
            "speed_score": round(speed_score, 2),
            "has_audio": has_audio,
            "overall": round(overall, 3),
        })
        scores[run.engine] = s

    return scores


def pick_winner(scores: Dict[str, dict]) -> str | None:
    valid = [(name, s) for name, s in scores.items() if s.get("success")]
    if not valid:
        return None
    return max(valid, key=lambda kv: kv[1].get("overall", 0.0))[0]
