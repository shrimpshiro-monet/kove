# monet/engines/freecut/planner/parse_plan.py
from __future__ import annotations
import json
import re
from typing import List, Tuple, Optional
from pydantic import TypeAdapter
from ..executor.types import Action
from monet.router.capabilities import CapabilityHint

_action_adapter = TypeAdapter(List[Action])


def parse_plan(raw: str) -> List[Action]:
    cleaned = re.sub(r"^\s*(?:json)?\s*", "", raw)
    cleaned = re.sub(r"\s*$", "", cleaned).strip()
    no_comments = re.sub(r"^\s*//.*$", "", cleaned, flags=re.M)
    data = json.loads(no_comments)
    if not isinstance(data, list):
        raise ValueError("Plan must be a JSON array")
    return _action_adapter.validate_python(data)


def parse_plan_with_hints(raw: str) -> Tuple[List[Action], Optional[CapabilityHint]]:
    cleaned = re.sub(r"^\s*(?:json)?\s*", "", raw)
    cleaned = re.sub(r"\s*$", "", cleaned).strip()
    no_comments = re.sub(r"^\s*//.*$", "", cleaned, flags=re.M)

    hint = None
    hint_match = re.search(r"HINTS\s*({.*?})\s*$", no_comments, re.S)
    if hint_match:
        try:
            hint = CapabilityHint(**json.loads(hint_match.group(1)))
        except Exception:
            # Gracefully handle hint parsing issues
            pass
        no_comments = no_comments[:hint_match.start()].rstrip()

    actions = parse_plan(no_comments)
    return actions, hint
