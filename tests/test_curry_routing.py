# tests/test_curry_routing.py
import asyncio
from monet.engines.freecut.executor.types import ProjectSettings
from monet.engines.freecut.executor.asset_resolver import AssetResolver, AssetEntry
from monet.engines.freecut.planner.parse_plan import parse_plan
from monet.router.router import pick_engine, infer_capabilities, score_engines

CURRY_PLAN = """[
  {"type":"addMedia","trackId":"audio_1","mediaId":"bgm","clipId":"bgm1","startTime":0},
  {"type":"addMedia","trackId":"video_1","mediaId":"la1","clipId":"la1_orig","startTime":0},
  {"type":"split","trackId":"video_1","clipId":"la1_orig","time":3.5},
  {"type":"updateClip","trackId":"video_1","clipId":"la1_orig_segment_2",
   "properties":{"playbackSpeed":0.3}},
  {"type":"addCaption","trackId":"text_1","startTime":3.5,"duration":2.0,
   "text":"HE ALREADY KNOWS",
   "style":{"color":"yellow","fontSize":"8vw","fontFamily":"Impact",
            "backgroundColor":"rgba(0,0,0,0.3)"}}
]"""

async def main():
    actions = parse_plan(CURRY_PLAN)
    resolver = AssetResolver([
        AssetEntry(mediaId="bgm", filePath="/assets/bgm.mp3", kind="audio", durationSec=60.0),
        AssetEntry(mediaId="la1", filePath="/assets/la1.mp4", kind="video", durationSec=6.0),
    ])

    caps = infer_capabilities(actions)
    print("caps:", sorted(c.value for c in caps))
    for s in score_engines(caps):
        print(f"  {s.engine.name:8} score={s.score:+.3f} q={s.quality:.2f} miss={s.missing}")
    print("PICK:", pick_engine(actions).engine.name)

if __name__ == "__main__":
    asyncio.run(main())
