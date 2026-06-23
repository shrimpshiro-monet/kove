# monet/vertex_ai.py
import os

async def call_gemini(prompt: str) -> str:
    # Generates a mock Gemini plan of the Curry highlight sequence
    # fully structured with actions and router hints.
    return """[
  {"type":"addMedia","trackId":"audio_1","mediaId":"bgm_main","clipId":"bgm1","startTime":0},
  {"type":"addMedia","trackId":"video_1","mediaId":"raw_footage","clipId":"la1_orig","startTime":0},
  {"type":"split","trackId":"video_1","clipId":"la1_orig","time":3.5},
  {"type":"updateClip","trackId":"video_1","clipId":"la1_orig_segment_2", "properties":{"playbackSpeed":0.3}},
  {"type":"addCaption","trackId":"text_1","startTime":3.5,"duration":2.0, "text":"HE ALREADY KNOWS", "style":{"color":"yellow","fontSize":"8vw","fontFamily":"Impact", "backgroundColor":"rgba(0,0,0,0.3)"}}
]
HINTS {"needs":["vertical_9_16"],"prefers":["styled_title_overlay"]}"""
