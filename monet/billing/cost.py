# monet/billing/cost.py
from __future__ import annotations
import sqlite3
import os
import time
from contextlib import contextmanager
from typing import Dict

DB = os.getenv("MONET_COST_DB", "/tmp/monet/cost.sqlite")
os.makedirs(os.path.dirname(DB), exist_ok=True)

# Cost per second of render or per API call ($)
RATES = {
    "freecut_render_sec":   0.0005,
    "editly_render_sec":    0.0008,
    "opencut_render_sec":   0.0006,
    "sam_vfx_render_sec":   0.012,    # GPU
    "gemini_planner_call":  0.003,
    "gcs_egress_gb":        0.12,
}

@contextmanager
def _db():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS costs (
        ts REAL, user_id TEXT, sid TEXT, item TEXT, qty REAL, cost REAL
    )""")
    yield con
    con.commit()
    con.close()


def charge(user_id: str, sid: str, item: str, qty: float) -> float:
    rate = RATES.get(item, 0.0)
    cost = qty * rate
    with _db() as con:
        con.execute("INSERT INTO costs VALUES (?,?,?,?,?,?)",
                    (time.time(), user_id, sid, item, qty, cost))
    return cost


def user_total(user_id: str, since: float = 0) -> Dict[str, dict]:
    with _db() as con:
        rows = con.execute(
            "SELECT item, SUM(qty), SUM(cost) FROM costs WHERE user_id=? AND ts>=? GROUP BY item",
            (user_id, since)
        ).fetchall()
    return {row[0]: {"qty": row[1], "cost": row[2]} for row in rows}
