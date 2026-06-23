# monet/learning/reward.py
from __future__ import annotations
import json
import os
import time
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional

DB_PATH = os.getenv("MONET_REWARD_DB", "/tmp/monet/reward.sqlite")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@contextmanager
def _db():
    con = sqlite3.connect(DB_PATH)
    con.execute("""CREATE TABLE IF NOT EXISTS picks (
        ts REAL, sid TEXT, user_id TEXT, prompt TEXT,
        capabilities TEXT, scores TEXT, auto_winner TEXT, user_pick TEXT
    )""")
    con.execute("""CREATE TABLE IF NOT EXISTS weights (
        engine TEXT PRIMARY KEY, w REAL, updates INTEGER
    )""")
    yield con
    con.commit()
    con.close()


@dataclass
class PickEvent:
    sid: str
    user_id: str
    prompt: str
    capabilities: List[str]
    scores: Dict[str, dict]
    auto_winner: Optional[str]
    user_pick: str


def record_pick(ev: PickEvent) -> None:
    with _db() as con:
        con.execute(
            "INSERT INTO picks VALUES (?,?,?,?,?,?,?,?)",
            (time.time(), ev.sid, ev.user_id, ev.prompt,
             json.dumps(ev.capabilities), json.dumps(ev.scores),
             ev.auto_winner, ev.user_pick),
        )


def update_weights(lr: float = 0.05) -> Dict[str, float]:
    """
    Simple online bandit: each engine has a running weight in [0..2].
    When user picks an engine over the auto-winner, that engine's weight bumps up.
    When auto-winner == user_pick, the system is calibrated → small bump.
    """
    with _db() as con:
        rows = con.execute(
            "SELECT auto_winner, user_pick FROM picks WHERE user_pick IS NOT NULL"
        ).fetchall()

        weights: Dict[str, float] = {}
        updates: Dict[str, int] = {}
        for w, u in rows:
            for e in {w, u}:
                if not e:
                    continue
                weights.setdefault(e, 1.0)
                updates[e] = updates.get(e, 0) + 1
            if u and w:
                if u == w:
                    weights[u] = min(2.0, weights[u] + lr * 0.5)
                else:
                    weights[u] = min(2.0, weights[u] + lr * 1.0)
                    weights[w] = max(0.1, weights[w] - lr * 0.5)
        for e, w in weights.items():
            con.execute("INSERT OR REPLACE INTO weights VALUES (?,?,?)",
                        (e, w, updates.get(e, 0)))
        return weights


def get_weights() -> Dict[str, float]:
    with _db() as con:
        return {row[0]: row[1] for row in con.execute("SELECT engine, w FROM weights")}
