// packages/engine-freecut/src/executor/ffprobe.ts
import { execFile } from "child_process";
import { promisify } from "util";
const pexec = promisify(execFile);

export async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await pexec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const dur = parseFloat(stdout.trim());
  if (!isFinite(dur)) throw new Error(`ffprobe failed for ${filePath}`);
  return dur;
}
