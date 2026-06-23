// packages/engine-freecut/src/executor/ffmpegCompiler.ts
import { Timeline, VideoSegment, AudioSegment } from "./types";
import { buildDrawtextFilter } from "./drawtext";

export interface CompiledCommand {
  inputs: string[];           // absolute paths in -i order
  filterGraph: string;        // full filter_complex string
  mapArgs: string[];          // ["-map", "[vout]", "-map", "[aout]"]
  outputArgs: string[];       // codec/preset/etc
}

/**
 * atempo only accepts 0.5-100 per filter in modern ffmpeg, BUT for max
 * compatibility we chain it for any speed < 0.5 or > 2.0.
 */
function atempoChain(speed: number): string {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  if (Math.abs(remaining - 1.0) > 1e-6) {
    filters.push(`atempo=${remaining.toFixed(6)}`);
  }
  if (filters.length === 0) filters.push("atempo=1.0");
  return filters.join(",");
}

export function compileTimeline(t: Timeline): CompiledCommand {
  const { width, height, fps, audioSampleRate, audioChannels } = t.settings;

  // Build a list of inputs from segments (dedup by inputIndex)
  const inputMap = new Map<number, string>();
  for (const s of [...t.videoSegments, ...t.bgmTracks]) {
    inputMap.set(s.inputIndex, s.inputPath);
  }
  const inputs = [...inputMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, p]) => p);

  const parts: string[] = [];

  // ----- Per-segment video processing -----
  const vSegLabels: string[] = [];
  const aSegLabels: string[] = [];

  t.videoSegments.forEach((seg, i) => {
    const inLabel = `[${seg.inputIndex}:v]`;
    const outLabel = `[v_seg${i}]`;
    const setpts =
      seg.playbackSpeed === 1.0
        ? "setpts=PTS-STARTPTS"
        : `setpts=(PTS-STARTPTS)/${seg.playbackSpeed}`;

    parts.push(
      `${inLabel}trim=start=${seg.sourceIn.toFixed(3)}:end=${seg.sourceOut.toFixed(
        3
      )},${setpts},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps}${outLabel}`
    );
    vSegLabels.push(outLabel);

    // Source audio for this segment (muted or not)
    const aIn = `[${seg.inputIndex}:a]`;
    const aOut = `[a_seg${i}]`;
    const atempo = atempoChain(seg.playbackSpeed);
    const vol = seg.mute ? 0 : seg.volume;
    parts.push(
      `${aIn}atrim=start=${seg.sourceIn.toFixed(3)}:end=${seg.sourceOut.toFixed(
        3
      )},asetpts=PTS-STARTPTS,${atempo},volume=${vol},aresample=${audioSampleRate}${aOut}`
    );
    aSegLabels.push(aOut);
  });

  // ----- Concat all video+audio segments in timeline order -----
  const n = t.videoSegments.length;
  const concatInputs = vSegLabels.map((v, i) => `${v}${aSegLabels[i]}`).join("");
  parts.push(`${concatInputs}concat=n=${n}:v=1:a=1[v_cat][a_cat_src]`);

  // ----- Apply caption drawtext stack -----
  let lastV = "[v_cat]";
  t.captions.forEach((cap, i) => {
    const out = `[v_txt${i}]`;
    parts.push(buildDrawtextFilter(cap, t.settings, lastV, out));
    lastV = out;
  });
  parts.push(`${lastV}null[v_out]`); // alias final video label

  // ----- Mix BGM tracks with source audio -----
  const audioMixInputs: string[] = ["[a_cat_src]"];
  t.bgmTracks.forEach((bgm, i) => {
    const inLabel = `[${bgm.inputIndex}:a]`;
    const outLabel = `[a_bgm${i}]`;
    const segDur = bgm.sourceOut - bgm.sourceIn;
    parts.push(
      `${inLabel}atrim=start=${bgm.sourceIn.toFixed(3)}:end=${bgm.sourceOut.toFixed(
        3
      )},asetpts=PTS-STARTPTS,volume=${bgm.volume},adelay=${Math.round(
        bgm.timelineStart * 1000
      )}|${Math.round(bgm.timelineStart * 1000)},apad=whole_dur=${t.duration.toFixed(
        3
      )},atrim=0:${t.duration.toFixed(3)},aresample=${audioSampleRate}${outLabel}`
    );
    audioMixInputs.push(outLabel);
  });

  if (audioMixInputs.length === 1) {
    parts.push(`[a_cat_src]anull[a_out]`);
  } else {
    parts.push(
      `${audioMixInputs.join("")}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0:normalize=0[a_out]`
    );
  }

  const filterGraph = parts.join(";");

  return {
    inputs,
    filterGraph,
    mapArgs: ["-map", "[v_out]", "-map", "[a_out]"],
    outputArgs: [
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "medium",
      "-crf", "20",
      "-r", String(fps),
      "-c:a", "aac",
      "-ar", String(audioSampleRate),
      "-ac", String(audioChannels),
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
    ],
  };
}
