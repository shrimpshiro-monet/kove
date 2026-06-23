# monet/analytics/store.py
from __future__ import annotations
import sqlite3
import os
import time
import json
from contextlib import contextmanager

DB = os.getenv("MONET_ANALYTICS_DB", "/tmp/monet/analytics.sqlite")
os.makedirs(os.path.dirname(DB), exist_ok=True)

@contextmanager
def _db():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS engine_runs (
        ts REAL, sid TEXT, engine TEXT, success INTEGER,
        render_time REAL, output_dur REAL, error TEXT, scores TEXT
    )""")
    yield con
    con.commit()
    con.close()

def log_run(sid: str, engine: str, success: bool, render_time: float,
            output_dur: float, error: str | None, scores: dict) -> None:
    with _db() as con:
        con.execute("INSERT INTO engine_runs VALUES (?,?,?,?,?,?,?,?)",
                    (time.time(), sid, engine, 1 if success else 0,
                     render_time, output_dur, error, json.dumps(scores)))

def summary(window_hours: int = 168) -> dict:
    cutoff = time.time() - window_hours * 3600
    with _db() as con:
        rows = con.execute(
            "SELECT engine, success, render_time, scores FROM engine_runs WHERE ts > ?",
            (cutoff,)
        ).fetchall()
    by: dict[str, dict] = {}
    for engine, success, rt, scores_json in rows:
        b = by.setdefault(engine, {"runs": 0, "ok": 0, "render_sum": 0.0, "overall_sum": 0.0})
        b["runs"] += 1
        b["ok"] += success
        b["render_sum"] += rt or 0
        s = json.loads(scores_json or "{}")
        b["overall_sum"] += s.get("overall", 0)
    return {
        e: {
            "runs": b["runs"],
            "success_rate": round(b["ok"]/max(1,b["runs"]), 3),
            "avg_render_sec": round(b["render_sum"]/max(1,b["runs"]), 2),
            "avg_overall": round(b["overall_sum"]/max(1,b["ok"] or 1), 3),
        } for e, b in by.items()
    }
