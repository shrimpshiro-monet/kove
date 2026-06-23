import type { FastifyInstance } from "fastify";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface ExecuteBlenderBody {
  script: string;
  fileId: string;
}

interface ExecuteFFmpegBody {
  args: string[];
  outputId: string;
}

export async function registerNativeExecutorRoutes(app: FastifyInstance): Promise<void> {
  // Execute a raw Blender script
  app.post("/api/execute/blender", async (req, res) => {
    console.log("[api/execute/blender] >>> NEW EXECUTION REQUEST");
    try {
      const { script, fileId } = req.body as ExecuteBlenderBody;
      console.log(`[api/execute/blender] Request for fileId: ${fileId}`);
      
      const localDir = path.join(os.tmpdir(), "monet-media-dev");
      console.log(`[api/execute/blender] Ensuring directory: ${localDir}`);
      await fs.mkdir(localDir, { recursive: true });

      const scriptPath = path.join(localDir, `blender_script_${Date.now()}_${fileId}.py`);
      console.log(`[api/execute/blender] Writing script to: ${scriptPath}`);
      await fs.writeFile(scriptPath, script);

      console.log(`[api/execute/blender] Spawning Blender headless process...`);
      const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        // Try 'blender' from PATH first, then fallback to common paths
        const blenderPath = "blender"; 
        
        const proc = spawn(blenderPath, ["-b", "-P", scriptPath], {
          shell: true, // Use shell to resolve PATH correctly on different OS
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
          }
        });

        let output = "";
        proc.stdout.on("data", (d) => {
          const chunk = d.toString();
          output += chunk;
        });
        proc.stderr.on("data", (d) => {
          const chunk = d.toString();
          output += chunk;
        });
        
        proc.on("close", (code) => {
          console.log(`[api/execute/blender] Process closed with code: ${code}`);
          resolve({ code, output });
        });
        proc.on("error", (err) => {
          console.error("[api/execute/blender] Spawn Error:", err);
          reject(err);
        });
      });

      if (result.code !== 0) {
        console.error(`[api/execute/blender] Blender FAILED (code ${result.code})`);
        return res.status(500).send({
          success: false,
          error: {
            code: "BLENDER_FAILED",
            message: `Blender exited with code ${result.code}`,
            details: result.output
          }
        });
      }

      // Write .meta file for getLocalMedia compatibility
      const outputId = `edited_${fileId}.mp4`;
      const metaPath = path.join(localDir, `${outputId}.meta`);
      console.log(`[api/execute/blender] Writing metadata to: ${metaPath}`);
      await fs.writeFile(
        metaPath,
        JSON.stringify({
          mimeType: "video/mp4",
          r2Key: outputId,
          fileName: outputId
        })
      );

      console.log("[api/execute/blender] <<< EXECUTION SUCCESSFUL");
      return res.send({
        success: true,
        log: result.output
      });
    } catch (error: any) {
      console.error("[api/execute/blender] !!! FATAL ERROR:", error);
      return res.status(500).send({
        success: false,
        error: { code: "EXECUTION_ERROR", message: error.message }
      });
    }
  });

  // Execute a raw FFmpeg command
  app.post("/api/execute/ffmpeg", async (req, res) => {
    console.log("[api/execute/ffmpeg] >>> NEW EXECUTION REQUEST");
    try {
      const { args } = req.body as ExecuteFFmpegBody;
      console.log(`[api/execute/ffmpeg] Args: ${JSON.stringify(args)}`);
      
      console.log(`[api/execute/ffmpeg] Spawning FFmpeg process...`);
      const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        const proc = spawn("/usr/local/bin/ffmpeg", args, {
          shell: false,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
          }
        });

        let output = "";
        proc.stdout.on("data", (d) => output += d.toString());
        proc.stderr.on("data", (d) => output += d.toString());
        
        proc.on("close", (code) => {
          console.log(`[api/execute/ffmpeg] Process closed with code: ${code}`);
          resolve({ code, output });
        });
        proc.on("error", (err) => {
          console.error("[api/execute/ffmpeg] Spawn Error:", err);
          reject(err);
        });
      });

      if (result.code !== 0) {
        console.error(`[api/execute/ffmpeg] FFmpeg FAILED (code ${result.code})`);
        return res.status(500).send({
          success: false,
          error: {
            code: "FFMPEG_FAILED",
            message: `FFmpeg exited with code ${result.code}`,
            details: result.output
          }
        });
      }

      // Write .meta file for getLocalMedia compatibility
      // Extract output path from args (usually the last one)
      const outputPath = args[args.length - 1];
      const outputId = path.basename(outputPath);
      const localDir = path.dirname(outputPath);
      const metaPath = path.join(localDir, `${outputId}.meta`);

      console.log(`[api/execute/ffmpeg] Writing metadata to: ${metaPath}`);
      await fs.writeFile(
        metaPath,
        JSON.stringify({
          mimeType: "video/mp4",
          r2Key: outputId,
          fileName: outputId
        })
      );

      console.log("[api/execute/ffmpeg] <<< EXECUTION SUCCESSFUL");
      return res.send({
        success: true,
        log: result.output
      });
    } catch (error: any) {
      console.error("[api/execute/ffmpeg] !!! FATAL ERROR:", error);
      return res.status(500).send({
        success: false,
        error: { code: "EXECUTION_ERROR", message: error.message }
      });
    }
  });
}
