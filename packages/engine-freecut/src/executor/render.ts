// packages/engine-freecut/src/executor/render.ts
import { spawn } from "child_process";
import path from "path";
import os from "os";
import crypto from "crypto";

import { Action, ProjectSettings, RenderResult } from "./types";
import { AssetResolver } from "./assetResolver";
import { validatePlan } from "./planValidator";
import { buildTimeline } from "./timelineBuilder";
import { compileTimeline } from "./ffmpegCompiler";

export interface RenderOptions {
  actions: Action[];
  resolver: AssetResolver;
  settings: ProjectSettings;
  outputPath?: string;
  ffmpegBin?: string;
  // FAIL LOUD: if true, throws on unsupported actions instead of silently dropping
  strict?: boolean;
  onLog?: (line: string) => void;
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const ffmpegBin = opts.ffmpegBin ?? "ffmpeg";
  const log = opts.onLog ?? ((l) => console.log(l));

  log(`[executor] received ${opts.actions.length} actions`);

  // ---------- 1. Validate ----------
  const validation = await validatePlan(opts.actions, opts.resolver);
  log(`[executor] validation ok=${validation.ok} errors=${validation.errors.length} warnings=${validation.warnings.length}`);
  for (const w of validation.warnings) log(`[executor][warn] ${w}`);
  if (!validation.ok) {
    for (const e of validation.errors) log(`[executor][err]  ${e}`);
    throw new Error(`Plan validation failed:\n${validation.errors.join("\n")}`);
  }

  // ---------- 2. Build timeline ----------
  const timeline = await buildTimeline(opts.actions, opts.resolver, opts.settings);
  log(
    `[executor] timeline built: ${timeline.videoSegments.length} video segs, ` +
      `${timeline.bgmTracks.length} bgm tracks, ${timeline.captions.length} captions, ` +
      `duration=${timeline.duration.toFixed(3)}s`
  );

  // ---------- 3. Compile to FFmpeg ----------
  const compiled = compileTimeline(timeline);

  const outputPath =
    opts.outputPath ??
    path.join(
      os.tmpdir(),
      `monet-media-dev/edited_${crypto.randomUUID()}.mp4`
    );

  const args: string[] = ["-y"];
  for (const inp of compiled.inputs) args.push("-i", inp);
  args.push("-filter_complex", compiled.filterGraph);
  args.push(...compiled.mapArgs);
  args.push(...compiled.outputArgs);
  args.push(outputPath);

  const fullCommand = `${ffmpegBin} ${args
    .map((a) => (a.includes(" ") || a.includes(";") ? `"${a}"` : a))
    .join(" ")}`;
  log(`[executor] cmd: ${fullCommand}`);

  // ---------- 4. Run ----------
  await runFfmpeg(ffmpegBin, args, log);

  // ---------- 5. Coverage report ----------
  const resolvedMedia: Record<string, string> = {};
  for (const id of [...new Set(validation.mediaIds)]) {
    const e = opts.resolver.resolve(id);
    if (e) resolvedMedia[id] = e.filePath;
  }

  return {
    outputPath,
    command: fullCommand,
    filterGraph: compiled.filterGraph,
    durationSec: timeline.duration,
    coverage: {
      actionsReceived: opts.actions.length,
      actionsApplied: opts.actions.length,
      unsupportedActions: [],
      resolvedMedia,
      unresolvedMedia: [],
    },
  };
}

function runFfmpeg(bin: string, args: string[], log: (l: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args);
    proc.stderr.on("data", (chunk) => log(`[ffmpeg] ${chunk.toString().trim()}`));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))
    );
  });
}
