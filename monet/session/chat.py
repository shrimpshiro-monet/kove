# monet/session/chat.py
from __future__ import annotations
import logging
from typing import List, Optional, Tuple

from monet.engines.freecut.executor.types import Action, ProjectSettings
from monet.engines.freecut.executor.plan_validator import validate_plan
from monet.engines.freecut.planner.parse_plan import parse_plan_with_hints
from monet.style.analyzer import analyze_video_style
from monet.style.profile import StyleProfile
from monet.vertex_ai import call_gemini

from .state import UnifiedSession, ChatMessage

logger = logging.getLogger("monet.session.chat")


CONVERSATIONAL_SYSTEM = """You are Monet, a video editor that talks like a friend.
You're collaborating with the user on ONE evolving video edit.

You ALWAYS have access to:
- The current timeline (list of actions already applied)
- The user's raw footage and optional reference video
- The conversation history

Your job each turn:
1. Decide: is this a CONVERSATIONAL message (greeting, question, feedback without edit intent),
   or an EDIT request (user wants the video to change)?
2. If conversational → reply naturally in plain text. No JSON.
3. If edit request → output a short natural-language acknowledgement (1-2 sentences) on the
   first line, then a __ACTIONS__ block with the JSON action array describing ONLY the
   incremental changes (not the whole timeline from scratch).

EXAMPLES:
User: "make the dunk slow-mo"
You:
Slowing the dunk to 0.3x and snapping the cut at the rim contact.
ACTIONS
[{"type":"split","trackId":"video_1","clipId":"main","time":4.2},
 {"type":"updateClip","trackId":"video_1","clipId":"main_segment_2",
  "properties":{"playbackSpeed":0.3}}]

User: "this is fire 🔥"
You:
Glad you're feeling it. Want me to add a flash at the bass drop too?

User: "the celebration is too long, cut it in half"
You:
Trimming the celebration clip from the back end by half.
ACTIONS
[{"type":"updateClip","trackId":"video_1","clipId":"celebration",
  "properties":{"sourceOut":<half-of-current>}}]

RULES:
- Reference current state by clipId (visible in CURRENT_TIMELINE).
- For incremental edits, output ONLY the deltas, not the whole plan.
- Never re-add clips already in the timeline.
- If unsure, ask a brief clarifying question instead of guessing.
"""

def _serialize_timeline_for_llm(session: UnifiedSession) -> str:
    if not session.actions:
        return "(empty — nothing on the timeline yet)"
    lines = []
    for i, a in enumerate(session.actions):
        d = a.model_dump()
        d.pop("type", None)
        kind = a.type
        lines.append(f"{i}. {kind}: {d}")
    return "\n".join(lines)


def _serialize_chat(session: UnifiedSession, n: int = 8) -> str:
    recent = session.chat_history[-n:]
    return "\n".join(f"{m.role.upper()}: {m.content}" for m in recent)


async def handle_chat_message(
    session: UnifiedSession, user_text: str,
) -> Tuple[ChatMessage, List[Action], Optional[StyleProfile]]:
    """
    Returns: (assistant_message, incremental_actions, style_profile_if_new)
    """
    # Record the user message
    session.add_message("user", user_text)

    # If this is the first message and there's a reference video, analyze style
    style_profile = None
    is_first = sum(1 for m in session.chat_history if m.role == "user") == 1
    if is_first and session.reference_path and not session.style_profile:
        style_profile = await analyze_video_style(
            session.reference_path, session.music_path
        )
        session.style_profile = style_profile.model_dump()

    # Build prompt
    resolver = session.build_resolver()
    style_str = "STYLE PROFILE (reference vibe to mimic):\n" + session.style_profile["summary"] if session.style_profile else ""
    prompt = f"""{CONVERSATIONAL_SYSTEM}

PROJECT: {session.settings.width}x{session.settings.height} @ {session.settings.fps}fps

{resolver.to_prompt_context()}

CURRENT_TIMELINE:
{_serialize_timeline_for_llm(session)}

{style_str}

RECENT_CONVERSATION:
{_serialize_chat(session)}

LATEST USER MESSAGE:
{user_text}
"""

    raw = await call_gemini(prompt)

    # Parse: split on ACTIONS
    actions: List[Action] = []
    reply_text = raw.strip()
    if "ACTIONS" in raw:
        head, _, json_part = raw.partition("ACTIONS")
        reply_text = head.strip()
        try:
            actions, _hint = parse_plan_with_hints(json_part.strip())
        except Exception as e:
            logger.warning(f"[chat] parse failed: {e}")
            reply_text += f"\n\n(internal: action parse failed: {e})"
            actions = []
    else:
        # If call_gemini returned raw json array directly, try to parse it as actions
        try:
            actions, _hint = parse_plan_with_hints(raw.strip())
            # If successfully parsed direct actions, make the reply text conversational acknowledgment
            reply_text = "Directing actions according to your prompt..."
        except Exception:
            pass

    # Record assistant message
    asst_msg = session.add_message(
        "assistant", reply_text,
        actions_applied=[f"{a.type}:{getattr(a, 'clipId', '')}" for a in actions],
    )
    return asst_msg, actions, style_profile
