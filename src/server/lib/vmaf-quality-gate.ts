import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface QualityScore {
  vmaf: number | null;
  ssim: number | null;
  psnr: number | null;
  bitrateOk: boolean;
  resolutionOk: boolean;
  noBlackFrames: boolean;
  pass: boolean;
  details: string[];
}

interface ProbeInfo {
  width: number;
  height: number;
  duration: number;
  bitrate: number;
  codec: string;
  hasVideo: boolean;
}

async function probe(filePath: string): Promise<ProbeInfo | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      filePath,
    ]);
    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find(
      (s: any) => s.codec_type === "video"
    );
    if (!videoStream) return null;

    return {
      width: videoStream.width ?? 0,
      height: videoStream.height ?? 0,
      duration: parseFloat(info.format?.duration ?? "0"),
      bitrate: parseInt(info.format?.bit_rate ?? "0", 10) / 1000,
      codec: videoStream.codec_name ?? "unknown",
      hasVideo: true,
    };
  } catch {
    return null;
  }
}

function estimateMinBitrateKbps(width: number, height: number): number {
  const pixels = width * height;
  if (pixels >= 1920 * 1080) return 2000;
  if (pixels >= 1280 * 720) return 1000;
  return 500;
}

async function detectBlackFrames(
  filePath: string,
  duration: number
): Promise<{ count: number; total: number }> {
  if (duration <= 0) return { count: 0, total: 0 };

  const samplePoints = Math.min(Math.ceil(duration), 20);
  const step = duration / samplePoints;
  let blackCount = 0;

  for (let i = 0; i < samplePoints; i++) {
    const ts = i * step;
    try {
      const { stdout } = await execFileAsync("ffmpeg", [
        "-ss", String(ts),
        "-i", filePath,
        "-frames:v", "1",
        "-vf", "blackdetect=d=0.1:pix_th=0.10",
        "-f", "null", "-",
      ], { timeout: 5000 });
      if (stdout.includes("black_start")) {
        blackCount++;
      }
    } catch {
      // blackdetect not available or frame unreadable
    }
  }

  return { count: blackCount, total: samplePoints };
}

async function measureSSIM(
  exportedPath: string,
  referencePath: string
): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", exportedPath,
      "-i", referencePath,
      "-lavfi", "ssim=stats_file=-",
      "-f", "null", "-",
    ]);
    const match = stdout.match(/All:(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
  } catch {
    return null;
  }
}

async function measurePSNR(
  exportedPath: string,
  referencePath: string
): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", exportedPath,
      "-i", referencePath,
      "-lavfi", "psnr=stats_file=-",
      "-f", "null", "-",
    ]);
    const match = stdout.match(/average:(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
  } catch {
    return null;
  }
}

async function measureVMAF(
  exportedPath: string,
  referencePath: string
): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-i", exportedPath,
      "-i", referencePath,
      "-lavfi", "libvmaf=model=version=vmaf_v0.6.1",
      "-f", "null", "-",
    ]);
    const match = stdout.match(/VMAF score:(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
  } catch {
    return null;
  }
}

export async function assessQuality(
  exportedPath: string,
  referencePath?: string
): Promise<QualityScore> {
  const details: string[] = [];
  let vmaf: number | null = null;
  let ssim: number | null = null;
  let psnr: number | null = null;
  let bitrateOk = true;
  let resolutionOk = true;
  let noBlackFrames = true;

  const info = await probe(exportedPath);
  if (!info) {
    details.push("PROBE: file unreadable or no video stream");
    return {
      vmaf: null,
      ssim: null,
      psnr: null,
      bitrateOk: false,
      resolutionOk: false,
      noBlackFrames: false,
      pass: false,
      details,
    };
  }

  details.push(`STREAM: ${info.codec} ${info.width}x${info.height} ${info.duration.toFixed(1)}s ${info.bitrate.toFixed(0)}kbps`);

  if (info.width < 240 || info.height < 240) {
    resolutionOk = false;
    details.push(`RESOLUTION: too low (${info.width}x${info.height})`);
  }

  const minBitrate = estimateMinBitrateKbps(info.width, info.height);
  if (info.bitrate > 0 && info.bitrate < minBitrate) {
    bitrateOk = false;
    details.push(`BITRATE: ${info.bitrate.toFixed(0)}kbps below minimum ${minBitrate}kbps for ${info.width}x${info.height}`);
  }

  const blackFrames = await detectBlackFrames(exportedPath, info.duration);
  const blackRatio = blackFrames.total > 0 ? blackFrames.count / blackFrames.total : 0;
  if (blackRatio > 0.3) {
    noBlackFrames = false;
    details.push(`BLACK_FRAMES: ${blackFrames.count}/${blackFrames.total} sampled frames are black`);
  }

  if (referencePath) {
    ssim = await measureSSIM(exportedPath, referencePath);
    if (ssim !== null) {
      details.push(`SSIM: ${ssim.toFixed(4)}`);
    } else {
      details.push("SSIM: unavailable");
    }

    psnr = await measurePSNR(exportedPath, referencePath);
    if (psnr !== null) {
      details.push(`PSNR: ${psnr.toFixed(2)} dB`);
    } else {
      details.push("PSNR: unavailable");
    }

    vmaf = await measureVMAF(exportedPath, referencePath);
    if (vmaf !== null) {
      details.push(`VMAF: ${vmaf.toFixed(2)}`);
    } else {
      details.push("VMAF: libvmaf not available");
    }
  }

  const pass =
    bitrateOk &&
    resolutionOk &&
    noBlackFrames &&
    (ssim === null || ssim > 0.85) &&
    (psnr === null || psnr > 25);

  return { vmaf, ssim, psnr, bitrateOk, resolutionOk, noBlackFrames, pass, details };
}
