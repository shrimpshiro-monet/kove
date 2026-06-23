# monet/engines/freecut/planner/gemini_prompt.py
from __future__ import annotations
from ..executor.asset_resolver import AssetResolver

def build_planner_prompt(*, user_prompt: str, resolver: AssetResolver,
                         reference_analysis: str = "", raw_footage_analysis: str = "",
                         width=1080, height=1920, fps=30) -> str:
    return f"""You are the FreeCut Director. Output ONLY a JSON array of actions — no prose, no fences.

PROJECT: {width}x{height} @ {fps}fps (vertical 9:16)

{resolver.to_prompt_context()}

ACTION SCHEMA:
- {{"type":"addMedia","trackId":"video_1|audio_1","mediaId":"<from list>","clipId":"<unique>","startTime":<sec>}}
- {{"type":"split","trackId":"video_1","clipId":"<existing>","time":<sec into source>}} → creates "<id>_segment_1" / "_segment_2"
- {{"type":"updateClip","clipId":"...","properties":{{"playbackSpeed":0.3,"volume":1.0,"mute":false}}}}
- {{"type":"addCaption","trackId":"text_1","startTime":<sec>,"duration":<sec>,"text":"...","style":{{...}}}}
- {{"type":"removeClip","trackId":"...","clipId":"..."}}

RULES:
1. mediaId MUST be from AVAILABLE ASSETS. Never invent filenames.
2. Captions on track "text_1" — NEVER addMedia for captions.
3. Music → "audio_1". Source video audio stays on video clip.
4. Times are seconds as numbers.
5. Output JSON array ONLY.

OPTIONAL: At the end of your JSON output, you may append a single JSON object on a new line starting with HINTS to declare capability requirements:
HINTS {{"needs":["sam_mask","beat_sync"],"prefers":["styled_title_overlay"],"forbids":[],"notes":"reason..."}}

Valid capabilities: basic_cut_concat, playback_speed, drawtext_caption, styled_title_overlay, bgm_mix, audio_duck, crossfade_transition, ken_burns, chroma_key, sam_mask, motion_track, beat_sync, depth_vfx, vertical_9_16.

REFERENCE ANALYSIS:
{reference_analysis or "(none)"}

RAW FOOTAGE ANALYSIS:
{raw_footage_analysis or "(none)"}

USER PROMPT:
{user_prompt}
"""


def build_regen_prompt(*, user_prompt: str, prev_actions: list, feedback,
                       resolver, width=1080, height=1920, fps=30) -> str:
    import json
    return f"""You are the FreeCut Director, REVISING a previous edit.

PROJECT: {width}x{height} @ {fps}fps

{resolver.to_prompt_context()}

ORIGINAL PROMPT:
{user_prompt}

PREVIOUS PLAN (JSON):
{json.dumps([a.model_dump() if hasattr(a, 'model_dump') else a for a in prev_actions], indent=2)}

USER FEEDBACK:
- Notes: {feedback.notes}
- Keep these clipIds intact: {feedback.keep_actions or "(none specified)"}
- Drop/replace these clipIds: {feedback.drop_actions or "(none)"}
- Intensity: {feedback.intensity} (0=tweak, 1=full re-imagine)
{"- Bias toward engine: " + feedback.target_engine if feedback.target_engine else ""}

RULES:
1. Preserve clipIds in keep list verbatim.
2. Remove or replace clipIds in drop list.
3. Lower intensity = mostly keep structure, adjust styles/timings.
4. Higher intensity = restructure freely.
5. Output JSON array only. Optionally append __HINTS__ block.
"""
