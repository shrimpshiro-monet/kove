# monet/vibe/history.py
from __future__ import annotations
import json
import sqlite3
import os
import time
import uuid
from contextlib import contextmanager
from typing import List, Optional

DB = os.getenv("MONET_HISTORY_DB", "/tmp/monet/history.sqlite")
os.makedirs(os.path.dirname(DB), exist_ok=True)

@contextmanager
def _db():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY, sid TEXT, ts REAL,
        actions TEXT, feedback TEXT
    )""")
    yield con
    con.commit()
    con.close()

def record_revision(sid: str, actions, feedback=None) -> str:
    rid = uuid.uuid4().hex
    with _db() as con:
        con.execute(
            "INSERT INTO revisions VALUES (?,?,?,?,?)",
            (rid, sid, time.time(),
             json.dumps([a.model_dump() if hasattr(a, 'model_dump') else a for a in actions]),
             json.dumps(feedback.model_dump() if feedback and hasattr(feedback, 'model_dump') else feedback) if feedback else None),
        )
    return rid

def list_revisions(sid: str) -> List[dict]:
    with _db() as con:
        rows = con.execute(
            "SELECT id, ts, feedback FROM revisions WHERE sid=? ORDER BY ts DESC",
            (sid,)
        ).fetchall()
    return [{"id": r[0], "ts": r[1], "feedback": json.loads(r[2]) if r[2] else None}
            for r in rows]

def load_revision(rid: str) -> Optional[dict]:
    with _db() as con:
        row = con.execute("SELECT sid, actions FROM revisions WHERE id=?", (rid,)).fetchone()
    if not row:
        return None
    return {"sid": row[0], "actions": json.loads(row[1])}
