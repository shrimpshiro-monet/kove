# monet/experiments/ab.py
from __future__ import annotations
import hashlib
import sqlite3
import os
import time
from contextlib import contextmanager
from typing import Dict, List

DB = os.getenv("MONET_AB_DB", "/tmp/monet/ab.sqlite")
os.makedirs(os.path.dirname(DB), exist_ok=True)

@contextmanager
def _db():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS exposures (
        ts REAL, experiment TEXT, variant TEXT, user_id TEXT
    )""")
    con.execute("""CREATE TABLE IF NOT EXISTS outcomes (
        ts REAL, experiment TEXT, variant TEXT, user_id TEXT,
        metric TEXT, value REAL
    )""")
    yield con
    con.commit()
    con.close()


def assign_variant(experiment: str, user_id: str, variants: List[str]) -> str:
    h = hashlib.md5(f"{experiment}|{user_id}".encode()).hexdigest()
    idx = int(h, 16) % len(variants)
    chosen = variants[idx]
    with _db() as con:
        con.execute("INSERT INTO exposures VALUES (?,?,?,?)",
                    (time.time(), experiment, chosen, user_id))
    return chosen


def record_outcome(experiment: str, variant: str, user_id: str,
                   metric: str, value: float) -> None:
    with _db() as con:
        con.execute("INSERT INTO outcomes VALUES (?,?,?,?,?,?)",
                    (time.time(), experiment, variant, user_id, metric, value))


def results(experiment: str) -> Dict[str, dict]:
    with _db() as con:
        rows = con.execute(
            "SELECT variant, metric, value FROM outcomes WHERE experiment=?",
            (experiment,)
        ).fetchall()
    out: Dict[str, Dict[str, list]] = {}
    for variant, metric, value in rows:
        out.setdefault(variant, {}).setdefault(metric, []).append(value)
    summary = {}
    for v, metrics in out.items():
        summary[v] = {
            m: {"n": len(vals), "mean": sum(vals)/len(vals),
                "sum": sum(vals)}
            for m, vals in metrics.items()
        }
    return summary
