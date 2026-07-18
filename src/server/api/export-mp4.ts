import type { Env } from "../types/env";
import { FFmpegRenderer } from "../services/ffmpeg-renderer";
import { assessQuality } from "../lib/vmaf-quality-gate";
import { postProcessRender } from "../lib/post-process-render";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export async function handleExportMP4(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: any = await request.json();
    const { edl, mediaUrls } = body;

    if (!edl || !mediaUrls) {
      return jsonResponse({ success: false, error: "edl and mediaUrls are required" }, 400);
    }

    if (!edl.shots || edl.shots.length === 0) {
      return jsonResponse({ success: false, error: "EDL has no shots to render" }, 400);
    }

    // Check for blob URLs — they won't work from a server process
    const hasBlobUrls = Object.values(mediaUrls).some(
      (url: any) => typeof url === "string" && url.startsWith("blob:")
    );
    if (hasBlobUrls) {
      console.warn("[export-mp4] mediaUrls contains blob URLs — these won't resolve from the server");
      // Filter to only HTTP URLs
      const httpUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(mediaUrls) as [string, string][]) {
        if (k.endsWith("_http") || (!v.startsWith("blob:") && !v.startsWith("data:"))) {
          httpUrls[k] = v;
        }
      }
      if (Object.keys(httpUrls).length === 0) {
        return jsonResponse(
          {
            success: false,
            error: "All media URLs are blob URLs — server export requires HTTP URLs. Re-upload your footage and try again.",
          },
          400
        );
      }
      // Use the HTTP URLs
      Object.assign(mediaUrls, httpUrls);
    }

    console.log("[export-mp4] starting render", {
      shotCount: edl.shots.length,
      clipCount: Object.keys(mediaUrls).filter((k) => !k.endsWith("_http")).length,
      duration: edl.timeline?.duration,
    });

    const renderer = new FFmpegRenderer();

    try {
      const result = await renderer.render({ edl, mediaUrls });

      // Post-processing: apply LUT, ASS subtitles, subject mask if present
      const postOptions = {
        lutKey: edl?.metadata?.lutKey || edl?.globalEffects?.lutKey,
        assContent: edl?.metadata?.assContent,
        assKey: edl?.metadata?.assKey,
        maskKey: edl?.metadata?.maskKey,
        blurStrength: edl?.metadata?.blurStrength,
      };

      let finalFilePath = result.filePath;
      if (postOptions.lutKey || postOptions.assContent || postOptions.assKey || postOptions.maskKey) {
        const tempDir = path.join(os.tmpdir(), `post-${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });

        try {
          const postResult = await postProcessRender(
            result.filePath,
            path.join(tempDir, "final.mp4"),
            postOptions,
            env,
            tempDir,
          );
          finalFilePath = postResult.outputPath;
          console.log("[export-mp4] post-processing applied:", postResult.filtersApplied.join(", "), {
            durationMs: postResult.durationMs,
          });
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
      }

      const quality = await assessQuality(finalFilePath);
      if (!quality.pass) {
        console.warn("[export-mp4] Quality gate WARNING:", quality.details);
      } else {
        console.log("[export-mp4] Quality gate PASSED:", quality.details);
      }

      const fileBuffer = await fs.readFile(finalFilePath);

      renderer.cleanup().catch(() => {});

      console.log("[export-mp4] success, returning", result.size, "bytes");

      return new Response(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(result.size),
          "Content-Disposition": `attachment; filename="monet-edit-${Date.now()}.mp4"`,
          "X-Render-Duration": String(result.duration),
          "X-Quality-Pass": String(quality.pass),
          "X-Quality-SSIM": quality.ssim !== null ? quality.ssim.toFixed(4) : "n/a",
          "X-Quality-PSNR": quality.psnr !== null ? quality.psnr.toFixed(2) : "n/a",
        },
      });
    } catch (err: any) {
      await renderer.cleanup().catch(() => {});
      console.error("[export-mp4] render failed:", err.message);
      return jsonResponse(
        { success: false, error: err.message ?? "Export failed" },
        500
      );
    }
  } catch (err: any) {
    console.error("[export-mp4] request parse error:", err.message);
    return jsonResponse(
      { success: false, error: err.message ?? "Bad request" },
      400
    );
  }
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
