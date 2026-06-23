# tests/test_full_vibe_flow.py
import asyncio
import os
import sys
import tempfile
from unittest.mock import AsyncMock, patch

# Mock asyncio.create_subprocess_exec so we don't need real editly / opencut / sam2 globally installed
class MockSubprocess:
    def __init__(self):
        self.returncode = 0
        self.stdout = AsyncMock()
        self.stderr = AsyncMock()
    async def wait(self):
        return 0
    async def communicate(self):
        return b"{}", b""

async def mock_subprocess_exec(*args, **kwargs):
    # If rendering an output video, write a dummy file to avoid FileNotFoundError downstream
    for arg in args:
        if isinstance(arg, str) and arg.endswith(".mp4"):
            with open(arg, "wb") as f:
                f.write(b"dummy mp4 content")
    
    mock_proc = MockSubprocess()
    # Mock readline to return empty line for logs loop
    mock_proc.stderr.readline = AsyncMock(return_value=b"")
    return mock_proc

async def main():
    # Patch asyncio.create_subprocess_exec globally during the vibe flow test
    with patch("asyncio.create_subprocess_exec", side_effect=mock_subprocess_exec), \
         patch("os.path.getsize", return_value=1024 * 100), \
         patch("monet.unison.scorer._ffprobe_json", return_value={
             "streams": [{"codec_type": "video", "width": 1080, "height": 1920}, {"codec_type": "audio"}],
             "format": {"duration": "10.0"}
         }):
        
        from monet.vibe.session import create_session
        from monet.vibe.pipeline import plan_session, render_unison, finalize

        s = create_session("test_user")
        
        # Set dummy paths
        temp_dir = tempfile.gettempdir()
        raw_video = os.path.join(temp_dir, "test_curry_raw.mp4")
        music_file = os.path.join(temp_dir, "test_hiphop.mp3")
        
        # Create empty files so AssetResolver verification passes
        with open(raw_video, "wb") as f: f.write(b"")
        with open(music_file, "wb") as f: f.write(b"")
        
        s.raw_footage_path = raw_video
        s.music_path = music_file
        s.prompt = "cinematic slow-mo on the lookaway three, 'HE ALREADY KNOWS' yellow impact text right after he shoots, then shoulder shimmy at full speed"

        hint = await plan_session(s)
        print(f"✅ planned {len(s.actions)} actions, hint={hint}")

        result = await render_unison(s, hint)
        print(f"✅ rendered on {len(result['engines'])} engines")
        print(f"🏆 winner: {result['winner']}")
        for engine, score in result['scores'].items():
            print(f"   {engine}: overall={score.get('overall', 0):.2f} "
                  f"time={score.get('render_time_sec', 0):.1f}s")
        print(f"🎞️  triptych: {result['triptychPath']}")

        final = await finalize(s, "freecut")
        print(f"✨ final: {final}")

        # Clean up files
        try:
            os.remove(raw_video)
            os.remove(music_file)
        except OSError:
            pass

if __name__ == "__main__":
    asyncio.run(main())
