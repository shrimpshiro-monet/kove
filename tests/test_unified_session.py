# tests/test_unified_session.py
import asyncio
import os
import tempfile
from unittest.mock import AsyncMock, patch

# Mock asyncio.create_subprocess_exec so we don't need real ffmpeg/ffprobe binaries
class MockSubprocess:
    def __init__(self):
        self.returncode = 0
        self.stdout = AsyncMock()
        self.stderr = AsyncMock()
    async def wait(self):
        return 0
    async def communicate(self):
        return b"10.0\n", b"" # ffprobe output first, then ffmpeg output

async def mock_subprocess_exec(*args, **kwargs):
    # If rendering an output video, write a dummy file to avoid FileNotFoundError downstream
    for arg in args:
        if isinstance(arg, str) and arg.endswith(".mp4"):
            os.makedirs(os.path.dirname(arg), exist_ok=True)
            with open(arg, "wb") as f:
                f.write(b"dummy mp4 content")
    
    mock_proc = MockSubprocess()
    mock_proc.stderr.readline = AsyncMock(return_value=b"")
    return mock_proc

async def main_test():
    with patch("asyncio.create_subprocess_exec", side_effect=mock_subprocess_exec), \
         patch("monet.engines.freecut.executor.ffprobe.probe_duration", return_value=10.0):
        
        from monet.session.state import create
        from monet.session.chat import handle_chat_message
        from monet.session.api import _register_asset, _rebuild_and_render

        # Create mock assets in tmp folder so they exist if checked
        raw_path = os.path.join(tempfile.gettempdir(), "curry.mp4")
        music_path = os.path.join(tempfile.gettempdir(), "phonk.mp3")
        with open(raw_path, "wb") as f: f.write(b"")
        with open(music_path, "wb") as f: f.write(b"")

        s = create("test")
        await _register_asset(s, "raw_footage", raw_path, "video", "raw")
        await _register_asset(s, "bgm_main", music_path, "audio", "bgm")
        s.raw_footage_path = raw_path
        s.music_path = music_path

        # Turn 1: initial vibe request
        msg1, actions1, _ = await handle_chat_message(
            s, "slow mo on the dunk at 5 seconds, yellow 'NIGHT NIGHT' caption right after"
        )
        s.actions += actions1
        output1, stats1 = await _rebuild_and_render(s)
        print(f"Turn 1: {len(actions1)} actions, preview at {output1}, stats={stats1}")

        # Turn 2: incremental tweak
        msg2, actions2, _ = await handle_chat_message(s, "make the caption bigger")
        s.actions += actions2
        output2, stats2 = await _rebuild_and_render(s)
        print(f"Turn 2: {len(actions2)} actions, stats={stats2}")
        # Expect: stats2.cached == stats2.totalSegments (no video changed)
        #         stats2.overlaysOnly == True

        # Clean up
        try:
            os.remove(raw_path)
            os.remove(music_path)
        except OSError:
            pass

if __name__ == "__main__":
    asyncio.run(main_test())
