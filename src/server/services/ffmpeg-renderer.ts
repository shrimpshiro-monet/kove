import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { clampEffectIntensity, enforceShotBudget, enforceIntensityBudget } from "../lib/effect-limits";

export interface RenderEDLOptions {
  edl: any;
  mediaUrls: Record<string, string>;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
}

export interface RenderResult {
  filePath: string;
  size: number;
  duration: number;
  mimeType: "video/mp4";
}

export class FFmpegRenderer {
  private workDir: string;

  constructor() {
    this.workDir = path.join(
      os.tmpdir(),
      `monet-render-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  async render(opts: RenderEDLOptions): Promise<RenderResult> {
    const {
      edl,
      mediaUrls,
      width = 1920,
      height = 1080,
      fps = 30,
      bitrate = "6M",
    } = opts;

    await fs.mkdir(this.workDir, { recursive: true });

    try {
      // 1. Download clips
      const clipFiles = await this.downloadClips(mediaUrls);
      if (clipFiles.size === 0) {
        throw new Error("No clips downloaded — nothing to render");
      }

      // 2. Write filter graph to a file (avoids shell escaping issues)
      const filterScript = this.buildFilterGraph(edl, clipFiles, width, height, fps);
      const filterScriptPath = path.join(this.workDir, "filter_graph.txt");
      await fs.writeFile(filterScriptPath, filterScript, "utf-8");
      console.log("[ffmpeg-renderer] filter graph length:", filterScript.length, "chars");

      // 3. Build args array — avoids shell command-length limits
      const outputPath = path.join(this.workDir, "output.mp4");
      const hasMusic = !!edl.music?.sourceId && clipFiles.has(edl.music.sourceId);

      const args: string[] = ["-y"];

      for (const filePath of clipFiles.values()) {
        args.push("-i", filePath);
      }

      args.push("-filter_complex_script", filterScriptPath);
      args.push("-map", "[outv]");

      if (hasMusic) {
        args.push("-map", "[outa]");
      }

      args.push(
        "-c:v", "libx264",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-b:v", bitrate,
        "-r", String(fps),
        "-movflags", "+faststart",
      );

      if (hasMusic) {
        args.push("-c:a", "aac", "-b:a", "192k");
      }

      args.push(outputPath);

      console.log("[ffmpeg-renderer] running ffmpeg with", args.length, "args");
      console.log("[ffmpeg-renderer] command preview:", "ffmpeg " + args.slice(0, 8).join(" "), "...");

      // 4. Use spawn instead of exec to avoid shell command-length limits
      const { spawn } = await import("node:child_process");
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stderrBuf = "";

        proc.stderr.on("data", (chunk: Buffer) => {
          stderrBuf += chunk.toString();
          if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
        });

        proc.on("error", (err: Error) => {
          reject(new Error(`FFmpeg spawn failed: ${err.message}`));
        });

        proc.on("close", async (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            const errLogPath = path.join(this.workDir, "ffmpeg_error.log");
            try {
              await fs.writeFile(
                errLogPath,
                `=== FFmpeg exited with code ${code} ===\n\n=== STDERR ===\n${stderrBuf}\n\n=== FILTER GRAPH ===\n${filterScript}\n\n=== ARGS ===\n${args.join(" ")}`,
                "utf-8",
              );
              console.error(`[ffmpeg-renderer] Full error log: ${errLogPath}`);
            } catch {}

            console.error("[ffmpeg-renderer] STDERR last 3000 chars:\n", stderrBuf.slice(-3000));
            console.error("[ffmpeg-renderer] FILTER GRAPH (first 1500 chars):\n", filterScript.slice(0, 1500));

            reject(
              new Error(
                `FFmpeg exit ${code}. See server logs for full stderr and filter graph.`,
              ),
            );
          }
        });
      });

      console.log("[ffmpeg-renderer] complete");

      const stats = await fs.stat(outputPath);

      if (stats.size < 1000) {
        throw new Error(
          `Output file is suspiciously small (${stats.size} bytes). FFmpeg may have failed silently.`
        );
      }

      console.log("[ffmpeg-renderer] complete, size:", stats.size);

      return {
        filePath: outputPath,
        size: stats.size,
        duration: edl.timeline?.duration ?? 0,
        mimeType: "video/mp4",
      };
    } catch (err: any) {
      console.error("[ffmpeg-renderer] FAILED:", err.message);
      await this.cleanup().catch(() => {});
      throw new Error(`FFmpeg render failed: ${err.message}`);
    }
  }

  private async downloadClips(mediaUrls: Record<string, string>): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const entries = Object.entries(mediaUrls);

    for (let i = 0; i < entries.length; i++) {
      const [clipId, url] = entries[i];

      // Skip _http metadata keys
      if (clipId.endsWith("_http")) continue;

      const ext = url.includes(".webm") ? ".webm" : ".mp4";
      const localPath = path.join(this.workDir, `clip_${i}${ext}`);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[ffmpeg-renderer] Failed to download ${clipId}: HTTP ${response.status}`);
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(localPath, buffer);
        map.set(clipId, localPath);
        console.log(`[ffmpeg-renderer] downloaded ${clipId} -> clip_${i}${ext} (${buffer.length} bytes)`);
      } catch (err: any) {
        console.warn(`[ffmpeg-renderer] Error downloading ${clipId}:`, err.message);
      }
    }

    return map;
  }

  private buildFilterGraph(
    edl: any,
    clipFiles: Map<string, string>,
    width: number,
    height: number,
    fps: number
  ): string {
    const shots = edl.shots ?? [];
    const clipIndexMap = new Map<string, number>();
    Array.from(clipFiles.keys()).forEach((id, idx) => clipIndexMap.set(id, idx));

    const segments: string[] = [];
    const validSegments: number[] = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const clipIdx = clipIndexMap.get(shot.source?.clipId);
      if (clipIdx === undefined) {
        console.warn(`[ffmpeg-renderer] shot ${i} references missing clip ${shot.source?.clipId}, skipping`);
        continue;
      }

      const inPoint = shot.source?.inPoint ?? 0;
      const outPoint = shot.source?.outPoint ?? inPoint + (shot.timing?.duration ?? 2);
      const shotDuration = outPoint - inPoint;

      // Base chain — trim, scale, pad, normalize framerate
      const baseChain: string[] = [
        `[${clipIdx}:v]trim=${inPoint}:${outPoint}`,
        "setpts=PTS-STARTPTS",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        "setsar=1",
        `fps=${fps}`,
      ];

      // Apply per-shot effects from EDL
      const effectFilters = this.buildShotEffectFilters(shot, width, height, shotDuration, fps, edl.intensity ?? 0.5);
      baseChain.push(...effectFilters);

      // CRITICAL: NORMALIZATION at the end — forces every shot to identical
      // size, sar, pixel format, and framerate. Without this, concat fails.
      baseChain.push(
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        `setsar=1`,
        `fps=${fps}`,
        `format=yuv420p`,
      );

      segments.push(`${baseChain.join(",")}[v${i}]`);
      validSegments.push(i);
    }

    if (validSegments.length === 0) {
      segments.push(`[0:v]copy[outv]`);
    } else {
      const concatInputs = validSegments.map((i) => `[v${i}]`).join("");
      segments.push(
        `${concatInputs}concat=n=${validSegments.length}:v=1:a=0[outv]`
      );
    }

    const hasMusic = !!edl.music?.sourceId && clipFiles.has(edl.music.sourceId);
    let audioPart = "";
    if (hasMusic) {
      const musicIdx = clipIndexMap.get(edl.music.sourceId)!;
      const duration = edl.timeline?.duration ?? 30;
      audioPart = `;[${musicIdx}:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.85[outa]`;
    }

    const filter = segments.join(";\n") + audioPart;
    console.log("[ffmpeg-renderer] filter graph:\n", filter.slice(0, 500));
    return filter;
  }

  /**
   * Map Monet EDL effects to FFmpeg filter strings.
   * Each effect type translates to one or more FFmpeg native filters.
   */
  private buildShotEffectFilters(
    shot: any,
    width: number,
    height: number,
    shotDuration: number,
    fps: number,
    globalIntensity: number = 0.5
  ): string[] {
    const filters: string[] = [];
    const effects = shot.effects ?? [];

    // Enforce shot budget: max effects per shot, max total intensity
    const budgetedEffects = enforceIntensityBudget(enforceShotBudget(effects));

    for (const effect of budgetedEffects) {
      const type = (effect.type ?? effect.kind ?? "").toString().toLowerCase();
      // Scale intensity by global edit intensity (0-1 slider)
      const rawIntensity = clampEffectIntensity(type, effect.intensity ?? 0.7);
      const intensity = rawIntensity * globalIntensity;
      const effectStart = numberOr(effect.startTime, 0);
      const effectDuration = numberOr(effect.duration, shotDuration);
      const effectEnd = effectStart + effectDuration;

      const enableExpr = `'between(t,${effectStart.toFixed(3)},${effectEnd.toFixed(3)})'`;

      try {
        switch (type) {
          case "push_in": {
            const zoomTo = 1.0 + 0.22 * intensity;
            filters.push(
              `scale=w='iw*(1+(${(zoomTo - 1).toFixed(3)})*t/${shotDuration.toFixed(3)})':h=-2:eval=frame`,
              `crop=${width}:${height}`,
            );
            break;
          }

          case "pull_out": {
            const zoomFrom = 1.0 + 0.22 * intensity;
            filters.push(
              `scale=w='iw*(${zoomFrom.toFixed(3)}-(${(zoomFrom - 1).toFixed(3)})*t/${shotDuration.toFixed(3)})':h=-2:eval=frame`,
              `crop=${width}:${height}`,
            );
            break;
          }

          case "impact_flash": {
            // SAFE brightness boost — must stay tiny to prevent stacking blowout
            // FFmpeg eq brightness is ADDITIVE — 3 effects at 0.5 = +1.5 = pure white.
            const boost = 0.08 + 0.12 * intensity;
            filters.push(`eq=brightness=${boost.toFixed(3)}:enable=${enableExpr}`);
            break;
          }

          case "color_pulse": {
            // SAFE saturation boost — capped to prevent over-saturation
            const sat = 1.0 + 0.25 * intensity;
            filters.push(`eq=saturation=${sat.toFixed(3)}:enable=${enableExpr}`);
            break;
          }

          case "context_shake":
          case "shake": {
            const amp = Math.max(2, Math.floor(14 * intensity));
            const cropW = Math.max(2, width - amp * 2);
            const cropH = Math.max(2, height - amp * 2);
            filters.push(
              `crop=${cropW}:${cropH}:x='${amp}+${(amp / 2).toFixed(1)}*sin(2*PI*t*8)':y='${amp}+${(amp / 2).toFixed(1)}*cos(2*PI*t*9)'`,
              `scale=${width}:${height}`,
            );
            break;
          }

          case "vignette_punch":
          case "vignette": {
            filters.push(`vignette=angle=PI/4:eval=init`);
            break;
          }

          case "chromatic_burst":
          case "rgb_shift":
          case "chromatic_aberration":
          case "rgb_split": {
            const shift = Math.max(1, Math.floor(6 * intensity));
            filters.push(`rgbashift=rh=${shift}:bh=-${shift}:enable=${enableExpr}`);
            break;
          }

          case "speed_ramp": {
            const speedMin = numberOr(effect.params?.minSpeed, Math.max(0.3, 1.0 - 0.6 * intensity));
            const ptsMult = 1 / speedMin;
            filters.push(`setpts=${ptsMult.toFixed(3)}*PTS`);
            break;
          }

          case "whip_pan":
          case "whip_transition": {
            const blurAmt = Math.max(1, Math.floor(20 * intensity));
            filters.push(`gblur=sigma=${blurAmt}:steps=1:enable=${enableExpr}`);
            break;
          }

          case "glow":
          case "neon_glow": {
            const brt = 0.03 * intensity;
            const con = 1.0 + 0.05 * intensity;
            filters.push(
              `eq=brightness=${brt.toFixed(3)}:contrast=${con.toFixed(3)}:enable=${enableExpr}`,
            );
            break;
          }

          case "freeze_frame": {
            const holdDur = numberOr(effect.params?.holdDuration, 0.5);
            filters.push(`tpad=stop_mode=clone:stop_duration=${holdDur.toFixed(2)}`);
            break;
          }

          case "color_grade": {
            const grade = (effect.params?.preset ?? "cinematic").toString().toLowerCase();
            filters.push(...mapColorGradeToFilters(grade));
            break;
          }

          case "beat_cut":
          case "cut":
          case "transition":
            break;

          default:
            console.log(`[ffmpeg-renderer] unmapped effect type: ${type}`);
            break;
        }
      } catch (err: any) {
        console.warn(
          `[ffmpeg-renderer] skipping malformed effect "${type}":`,
          err.message,
        );
      }
    }

    const globalGrade = shot.globalGrade ?? null;
    if (globalGrade) {
      filters.push(...mapColorGradeToFilters(globalGrade.toString().toLowerCase()));
    }

    return filters;
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function numberOr(value: any, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.7;
  return Math.max(0, Math.min(1, n));
}

function mapColorGradeToFilters(grade: string): string[] {
  switch (grade) {
    case "cinematic":
      return [`eq=contrast=1.10:saturation=0.90:brightness=-0.03`];
    case "vibrant":
      return [`eq=contrast=1.08:saturation=1.20:brightness=0.02`];
    case "vintage":
      return [`eq=contrast=0.95:saturation=0.85:brightness=0.03`, `vignette=angle=PI/4:eval=init`];
    case "monochrome":
      return [`hue=s=0`, `eq=contrast=1.15`];
    case "anime":
      return [`eq=contrast=1.20:saturation=1.30:brightness=0.02`];
    case "noir":
    case "wong-kar-wai":
    case "wongkarwai":
      return [`hue=s=0.5`, `eq=contrast=1.20:saturation=1.05`];
    case "raw":
    default:
      return [];
  }
}
