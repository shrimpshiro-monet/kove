// packages/engine-freecut/src/executor/__tests__/currySmoke.ts
import { AssetResolver } from "../assetResolver";
import { buildTimeline } from "../timelineBuilder";
import { compileTimeline } from "../ffmpegCompiler";
import { Action } from "../types";

async function main() {
  const resolver = new AssetResolver([
    { mediaId: "curry_lookaway_three_1.mp4",       filePath: "/assets/lookaway1.mp4", kind: "video", durationSec: 6.0 },
    { mediaId: "curry_shoulder_shimmy_celebration_1.mp4", filePath: "/assets/celeb1.mp4", kind: "video", durationSec: 2.0 },
    { mediaId: "curry_lookaway_three_2.mp4",       filePath: "/assets/lookaway2.mp4", kind: "video", durationSec: 7.0 },
    { mediaId: "curry_shoulder_shimmy_celebration_2.mp4", filePath: "/assets/celeb2.mp4", kind: "video", durationSec: 2.5 },
    { mediaId: "heavy_dramatic_hiphop_instrumental.mp3",  filePath: "/assets/bgm.mp3",    kind: "audio", durationSec: 60 },
  ]);

  const actions: Action[] = [
    { type: "addMedia", trackId: "audio_1", mediaId: "heavy_dramatic_hiphop_instrumental.mp3", clipId: "hiphop_bgm", startTime: 0 },
    { type: "addMedia", trackId: "video_1", mediaId: "curry_lookaway_three_1.mp4", clipId: "curry_lookaway_1_orig", startTime: 0 },
    { type: "split",    trackId: "video_1", clipId: "curry_lookaway_1_orig", time: 3.5 },
    { type: "updateClip", trackId: "video_1", clipId: "curry_lookaway_1_orig_segment_2", properties: { playbackSpeed: 0.3 } },
    { type: "addCaption", trackId: "text_1", startTime: 3.5, duration: 2.0, text: "HE ALREADY KNOWS",
      style: { color: "yellow", fontSize: "8vw", fontFamily: "Impact", fontWeight: "bold",
               textAlign: "center", verticalAlign: "middle", backgroundColor: "rgba(0,0,0,0.3)" }},
    { type: "addMedia", trackId: "video_1", mediaId: "curry_shoulder_shimmy_celebration_1.mp4", clipId: "curry_celebration_1", startTime: 11.833 },
    { type: "addMedia", trackId: "video_1", mediaId: "curry_lookaway_three_2.mp4", clipId: "curry_lookaway_2_orig", startTime: 13.833 },
    { type: "split",    trackId: "video_1", clipId: "curry_lookaway_2_orig", time: 4.0 },
    { type: "updateClip", trackId: "video_1", clipId: "curry_lookaway_2_orig_segment_2", properties: { playbackSpeed: 0.3 } },
    { type: "addCaption", trackId: "text_1", startTime: 17.833, duration: 2.0, text: "HE ALREADY KNOWS",
      style: { color: "yellow", fontSize: "8vw", fontFamily: "Impact", fontWeight: "bold",
               textAlign: "center", verticalAlign: "middle", backgroundColor: "rgba(0,0,0,0.3)" }},
    { type: "addMedia", trackId: "video_1", mediaId: "curry_shoulder_shimmy_celebration_2.mp4", clipId: "curry_celebration_2", startTime: 27.833 },
  ];

  const settings = { width: 1080, height: 1920, fps: 30, audioSampleRate: 44100, audioChannels: 2 };
  const timeline = await buildTimeline(actions, resolver, settings);
  const compiled = compileTimeline(timeline);

  console.log("DURATION:", timeline.duration.toFixed(3), "s (expected ~30.333)");
  console.log("VIDEO SEGS:", timeline.videoSegments.length, "(expected 6)");
  console.log("CAPTIONS:", timeline.captions.length, "(expected 2)");
  console.log("BGM TRACKS:", timeline.bgmTracks.length, "(expected 1)");
  console.log("\nFILTER GRAPH:\n", compiled.filterGraph);
}

main();
