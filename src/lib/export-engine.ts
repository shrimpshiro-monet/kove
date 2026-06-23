// Client-side export engine using WebCodecs
// Renders MonetEDL to 1080p H.264/AAC MP4 entirely in the browser
// Runs in a dedicated Web Worker to avoid blocking the main thread

import type { MonetEDL } from "../server/types/edl";
import { MonetRenderer } from "./renderer/monet-renderer";

export interface ExportProgress {
  phase: "rendering" | "encoding" | "muxing" | "done" | "error";
  framesRendered: number;
  totalFrames: number;
  percent: number;
  estimatedSecondsRemaining: number;
  error?: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Server-side FFmpeg export — produces a guaranteed-valid MP4
 * with proper metadata, codecs, and moov atom positioning.
 * QuickTime, VLC, and all video players will accept this output.
 */
export async function exportEDLToMP4ViaServer(
  edl: any,
  mediaUrls: Map<string, string>,
  onProgress?: (p: { percent: number; stage: string }) => void
): Promise<Blob> {
  onProgress?.({ percent: 5, stage: "Uploading EDL to server..." });

  // Convert Map to plain object, skip blob URLs (server can't access them)
  const mediaUrlsObj: Record<string, string> = {};
  for (const [k, v] of mediaUrls.entries()) {
    if (v.startsWith("blob:")) {
      console.warn(`[export] Skipping blob URL for clip ${k} — server can't access blobs`);
      continue;
    }
    mediaUrlsObj[k] = v;
  }

  if (Object.keys(mediaUrlsObj).length === 0) {
    throw new Error(
      "No server-accessible media URLs. Re-upload clips so they're stored on the server."
    );
  }

  const response = await fetch("/api/export-mp4", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edl, mediaUrls: mediaUrlsObj }),
  });

  onProgress?.({ percent: 50, stage: "Server is rendering with FFmpeg..." });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Server export failed: HTTP ${response.status} — ${errText.slice(0, 200)}`
    );
  }

  onProgress?.({ percent: 90, stage: "Downloading rendered MP4..." });

  const blob = await response.blob();

  onProgress?.({ percent: 100, stage: "Complete" });

  console.log("[export] server render complete:", {
    size: blob.size,
    type: blob.type,
  });

  return blob;
}

interface SupportedEncoderProfile {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  hardwareAcceleration: HardwareAcceleration;
  avc?: AvcEncoderConfig;
}

type HardwareAcceleration = "no-preference" | "prefer-hardware" | "prefer-software";

interface AvcEncoderConfig {
  format: "avc" | "annexb";
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function clampFps(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(60, Math.round(value)));
}

function scaleToMaxArea(params: {
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}): { width: number; height: number } {
  const widthScale = params.maxWidth / params.width;
  const heightScale = params.maxHeight / params.height;
  const scale = Math.min(1, widthScale, heightScale);

  return {
    width: even(params.width * scale),
    height: even(params.height * scale),
  };
}

function buildCandidateProfiles(params: {
  requestedWidth: number;
  requestedHeight: number;
  fps: number;
  bitrate?: number;
}): SupportedEncoderProfile[] {
  const requestedWidth = even(params.requestedWidth);
  const requestedHeight = even(params.requestedHeight);

  const bitrate1080 = params.bitrate ?? 8_000_000;
  const bitrate720 = Math.min(params.bitrate ?? 4_000_000, 5_000_000);

  const downscaled720 = scaleToMaxArea({
    width: requestedWidth,
    height: requestedHeight,
    maxWidth: 1280,
    maxHeight: 720,
  });

  const candidates: SupportedEncoderProfile[] = [];

  /*
   * H.264 codec string format:
   * avc1.PPCCLL
   *
   * 640028 = High profile, level 4.0 (suited for 1080p @ 30fps)
   * 4d0028 = Main profile, level 4.0
   * 42e028 = Baseline profile, level 4.0
   * 42e01f = Baseline profile, level 3.1 (suited for 720p fallback)
   * 42001f = Baseline, level 3.1
   */
  candidates.push(
    {
      codec: "avc1.640028",
      width: requestedWidth,
      height: requestedHeight,
      bitrate: bitrate1080,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.4d0028",
      width: requestedWidth,
      height: requestedHeight,
      bitrate: bitrate1080,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.42e028",
      width: requestedWidth,
      height: requestedHeight,
      bitrate: bitrate1080,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.42e01f",
      width: downscaled720.width,
      height: downscaled720.height,
      bitrate: bitrate720,
      hardwareAcceleration: "prefer-hardware",
      avc: { format: "avc" },
    },
    {
      codec: "avc1.42001f",
      width: downscaled720.width,
      height: downscaled720.height,
      bitrate: bitrate720,
      hardwareAcceleration: "no-preference",
      avc: { format: "avc" },
    }
  );

  return candidates;
}

async function selectSupportedEncoderProfile(params: {
  requestedWidth: number;
  requestedHeight: number;
  fps: number;
  bitrate?: number;
}): Promise<SupportedEncoderProfile | null> {
  const candidates = buildCandidateProfiles(params);

  for (const candidate of candidates) {
    const config: VideoEncoderConfig = {
      codec: candidate.codec,
      width: candidate.width,
      height: candidate.height,
      bitrate: candidate.bitrate,
      framerate: params.fps,
      hardwareAcceleration: candidate.hardwareAcceleration,
      avc: candidate.avc,
    };

    try {
      const support = await VideoEncoder.isConfigSupported(config);

      if (support.supported) {
        return candidate;
      }

      console.warn("[export-engine] Encoder config unsupported", {
        codec: candidate.codec,
        width: candidate.width,
        height: candidate.height,
        bitrate: candidate.bitrate,
      });
    } catch (error) {
      console.warn("[export-engine] Encoder support check failed", {
        codec: candidate.codec,
        width: candidate.width,
        height: candidate.height,
        error,
      });
    }
  }

  return null;
}

/**
 * Export a MonetEDL to an MP4 Blob.
 * Uses WebCodecs VideoEncoder + a simple MP4 muxer.
 *
 * Target spec: H.264 Baseline/Main/High, up to 1080p, 30fps, ~8Mbps
 *
 * Returns a Blob that can be used with URL.createObjectURL() for download.
 */
export async function exportEDLToMP4(
  edl: MonetEDL,
  mediaUrls: Map<string, string>,
  onProgress?: ProgressCallback
): Promise<Blob> {
  // Check WebCodecs support
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error(
      "WebCodecs not supported in this browser. Please use Chrome 94+ or Edge 94+."
    );
  }

  const rawFps = edl.timeline.fps;
  const rawDuration = edl.timeline.duration;

  if (typeof rawDuration !== "number" || !Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error(`Invalid timeline duration: ${rawDuration}. Duration must be a positive finite number.`);
  }

  const fps = clampFps(rawFps);
  const duration = rawDuration;

  const totalFrames = Math.ceil(duration * fps);
  const startTime = performance.now();

  const report = (phase: ExportProgress["phase"], framesRendered: number, error?: string) => {
    if (!onProgress) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const rate = framesRendered / (elapsed || 1);
    const remaining = rate > 0 ? (totalFrames - framesRendered) / rate : 0;
    onProgress({
      phase,
      framesRendered,
      totalFrames,
      percent: Math.round((framesRendered / totalFrames) * 100),
      estimatedSecondsRemaining: Math.round(remaining),
      error,
    });
  };

  const roundedWidth = even(edl.timeline.resolution.width);
  const roundedHeight = even(edl.timeline.resolution.height);

  // Auto-detect and select supported WebCodecs profile (downscaling to 720p if 1080p level 4.0 is unsupported)
  const profile = await selectSupportedEncoderProfile({
    requestedWidth: roundedWidth,
    requestedHeight: roundedHeight,
    fps,
    bitrate: 8_000_000,
  });

  if (!profile) {
    throw new Error(
      "No supported H.264 WebCodecs encoder configuration was found for this browser/device."
    );
  }

  console.log("[export-engine] Export encoder configuration selected", {
    codec: profile.codec,
    width: profile.width,
    height: profile.height,
    bitrate: profile.bitrate,
    fps,
  });

  // --- Set up off-screen canvas for rendering ---
  const canvas = document.createElement("canvas");
  canvas.width = profile.width;
  canvas.height = profile.height;

  const renderer = new MonetRenderer();
  await renderer.initialize(edl, canvas, mediaUrls);

  // --- Collect encoded video chunks ---
  const videoChunks: EncodedVideoChunk[] = [];
  let avcDescription: ArrayBuffer | undefined;
  let encoderClosed = false;
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      // Capture the AVCDecoderConfigurationRecord from the first key frame.
      // This is the real SPS/PPS from the encoder — required for a valid avcC box.
      if (!avcDescription && metadata?.decoderConfig?.description) {
        const desc = metadata.decoderConfig.description;
        // Always produce a plain ArrayBuffer for the muxer.
        if (desc instanceof ArrayBuffer) {
          avcDescription = desc;
        } else if (ArrayBuffer.isView(desc)) {
          const view = desc as ArrayBufferView;
          avcDescription = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
        }
      }
      videoChunks.push(chunk);
    },
    error: (e) => {
      encoderError = e;
      encoderClosed = true;
      console.error("[export-engine] VideoEncoder encountered an asynchronous error:", e);
    },
  });

  try {
    encoder.configure({
      codec: profile.codec,
      width: profile.width,
      height: profile.height,
      bitrate: profile.bitrate,
      framerate: fps,
      hardwareAcceleration: profile.hardwareAcceleration,
      avc: profile.avc,
    });
  } catch (configError) {
    encoderClosed = true;
    renderer.cleanup();
    throw configError;
  }

  // --- Render and encode each frame ---
  report("rendering", 0);

  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (encoderError) {
        throw encoderError;
      }
      if (encoderClosed) {
        throw new Error("VideoEncoder closed before all frames could be encoded.");
      }

      const time = frameIdx / fps;

      // Render this frame to canvas
      await renderer.renderFrame(time);

      // Create VideoFrame from canvas
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(time * 1_000_000), // microseconds
        duration: Math.round((1 / fps) * 1_000_000),
      });

      const isKey = frameIdx % (fps * 2) === 0; // keyframe every 2s
      
      try {
        encoder.encode(frame, { keyFrame: isKey });
      } catch (encodeErr) {
        frame.close();
        throw encodeErr;
      }
      
      frame.close();

      if (frameIdx % 10 === 0) {
        report("rendering", frameIdx);
        // Yield to browser event loop every 10 frames
        await yieldToMain();
      }
    }

    if (encoderError) {
      throw encoderError;
    }

    if (!encoderClosed) {
      report("encoding", totalFrames);
      await encoder.flush();
      if (encoderError) {
        throw encoderError;
      }
      encoder.close();
      encoderClosed = true;
    }
  } catch (err) {
    if (!encoderClosed) {
      try {
        encoder.close();
      } catch {}
      encoderClosed = true;
    }
    renderer.cleanup();
    throw err;
  }

  if (encoderError) {
    throw encoderError;
  }

  // --- Mux into MP4 ---
  report("muxing", totalFrames);

  const mp4Blob = muxToMP4(videoChunks, profile.width, profile.height, fps, duration, avcDescription);

  report("done", totalFrames);

  renderer.cleanup();
  return mp4Blob;
}

/**
 * Minimal MP4 muxer for H.264 video chunks.
 *
 * Produces a valid progressive-download MP4 with:
 * - ftyp box (isom/mp41)
 * - mdat box (raw media data)
 * - moov box with correct sample table
 *
 * For MVP: video-only (audio mixing is Phase 8 expansion).
 * The music track can be mixed client-side in a follow-up using Web Audio API + OfflineAudioContext.
 */
function muxToMP4(
  chunks: EncodedVideoChunk[],
  width: number,
  height: number,
  fps: number,
  duration: number,
  avcDescription?: ArrayBuffer
): Blob {
  // Build sample data
  const samples: { data: Uint8Array; timestamp: number; duration: number; isKey: boolean }[] = [];

  for (const chunk of chunks) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    samples.push({
      data,
      timestamp: chunk.timestamp,
      duration: chunk.duration ?? Math.round((1 / fps) * 1_000_000),
      isKey: chunk.type === "key",
    });
  }

  const timescale = 90000; // Standard MP4 timescale
  const durationTS = Math.round(duration * timescale);

  // Helper functions for writing MP4 boxes
  const writeUint32 = (v: number, buf: number[]) => {
    buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  };

  const writeBox = (type: string, payload: number[]): number[] => {
    const size = 8 + payload.length;
    const box: number[] = [];
    writeUint32(size, box);
    for (const c of type) box.push(c.charCodeAt(0));
    return [...box, ...payload];
  };

  const writeString = (s: string): number[] => s.split("").map((c) => c.charCodeAt(0));

  // ftyp box
  const ftyp = writeBox("ftyp", [
    ...writeString("isom"),
    0, 0, 2, 0, // minor version
    ...writeString("isom"),
    ...writeString("iso2"),
    ...writeString("avc1"),
    ...writeString("mp41"),
  ]);

  // Calculate size of mdat payload
  let mdatPayloadSize = 0;
  for (const s of samples) {
    mdatPayloadSize += 4 + s.data.length; // 4-byte size prefix + frame data
  }
  const mdatBoxSize = 8 + mdatPayloadSize;

  // Build mdat header (length + "mdat")
  const mdatHeader = new Uint8Array(8);
  const mdatHeaderView = new DataView(mdatHeader.buffer);
  mdatHeaderView.setUint32(0, mdatBoxSize, false);
  mdatHeader.set([109, 100, 97, 116], 4); // "mdat" in ASCII

  // Compute precise sample offsets in the final file
  const ftypSize = ftyp.length;
  let currentOffset = ftypSize + 8; // ftyp size + 8 bytes of mdat header
  const sampleOffsets: number[] = [];

  for (const s of samples) {
    sampleOffsets.push(currentOffset);
    currentOffset += 4 + s.data.length;
  }

  // Construct blob parts sequentially to avoid stack/array-limit memory overhead
  const blobParts: any[] = [];
  blobParts.push(new Uint8Array(ftyp));
  blobParts.push(mdatHeader);

  for (const s of samples) {
    const sizePrefix = new Uint8Array(4);
    const view = new DataView(sizePrefix.buffer);
    view.setUint32(0, s.data.length, false);
    blobParts.push(sizePrefix);
    blobParts.push(s.data);
  }

  // Build moov box using precise offsets
  const moov = buildMoovBox(samples, sampleOffsets, width, height, fps, durationTS, timescale, avcDescription);
  blobParts.push(new Uint8Array(moov));

  return new Blob(blobParts, { type: "video/mp4" });
}

function buildMoovBox(
  samples: { data: Uint8Array; timestamp: number; duration: number; isKey: boolean }[],
  sampleOffsets: number[],
  width: number,
  height: number,
  fps: number,
  durationTS: number,
  timescale: number,
  avcDescription?: ArrayBuffer
): number[] {
  const writeUint32 = (v: number): number[] => [
    (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff,
  ];
  const writeUint16 = (v: number): number[] => [(v >>> 8) & 0xff, v & 0xff];
  const writeString = (s: string): number[] => s.split("").map((c) => c.charCodeAt(0));

  const writeBox = (type: string, payload: number[]): number[] => {
    const size = 8 + payload.length;
    return [...writeUint32(size), ...writeString(type), ...payload];
  };

  const mvhd = writeBox("mvhd", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // creation time
    0, 0, 0, 0, // modification time
    ...writeUint32(timescale),
    ...writeUint32(durationTS),
    0, 1, 0, 0, // rate = 1.0
    1, 0,       // volume = 1.0
    0, 0,       // reserved
    0, 0, 0, 0, 0, 0, 0, 0, // reserved
    0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // matrix row 1
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, // matrix row 2
    0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0, // matrix row 3
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // pre-defined
    0, 0, 0, 2, // next track ID
  ]);

  // stts: sample-to-time table
  const sampleDuration = Math.round(timescale / fps);
  const stts = writeBox("stts", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...writeUint32(samples.length), // sample count
    ...writeUint32(sampleDuration), // sample delta
  ]);

  // stss: sync sample (keyframe) table
  const keyFrameIndices = samples
    .map((s, i) => (s.isKey ? i + 1 : -1))
    .filter((i) => i !== -1);
  const stss = writeBox("stss", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(keyFrameIndices.length),
    ...keyFrameIndices.flatMap((i) => writeUint32(i)),
  ]);

  // stsz: sample sizes
  const stsz = writeBox("stsz", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // sample size (0 = variable)
    ...writeUint32(samples.length),
    ...samples.flatMap((s) => writeUint32(s.data.length + 4)), // +4 for AVCC length prefix
  ]);

  // stco: chunk offsets
  const stco = writeBox("stco", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(samples.length),
    ...sampleOffsets.flatMap((o) => writeUint32(o)),
  ]);

  // stsc: sample-to-chunk
  const stsc = writeBox("stsc", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...writeUint32(1), // first chunk
    ...writeUint32(1), // samples per chunk
    ...writeUint32(1), // sample description index
  ]);

  // avcC: use real SPS/PPS from encoder if available, otherwise fall back to
  // a known-good Baseline 4.0 record that most decoders accept.
  const avcC = avcDescription
    ? writeBox("avcC", Array.from(new Uint8Array(avcDescription)))
    : writeBox("avcC", [
        1,          // configurationVersion
        0x42, 0x00, 0x28, // Baseline profile, level 4.0
        0xff,       // lengthSizeMinusOne = 3 (4-byte NAL length prefixes)
        0xe1,       // numSequenceParameterSets = 1
        // Minimal SPS for H.264 Baseline 4.0 (generic — encoder may override at decode time)
        0x00, 0x0b,
        0x67, 0x42, 0x00, 0x28, 0xda, 0x01, 0x40, 0x16, 0xe9, 0x20, 0x20,
        1,          // numPictureParameterSets = 1
        0x00, 0x04,
        0x68, 0xce, 0x38, 0x80,
      ]);

  const avc1 = writeBox("avc1", [
    0, 0, 0, 0, 0, 0, // reserved
    0, 1, // data reference index
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // pre-defined + reserved
    ...writeUint16(width),
    ...writeUint16(height),
    0, 72, 0, 0, // horiz resolution = 72 dpi
    0, 72, 0, 0, // vert resolution = 72 dpi
    0, 0, 0, 0, // reserved
    0, 1, // frame count
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // compressorname (32 bytes)
    0, 24, // depth
    0xff, 0xff, // pre_defined
    ...avcC,
  ]);

  const stsd = writeBox("stsd", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...avc1,
  ]);

  const stbl = writeBox("stbl", [...stsd, ...stts, ...stss, ...stsc, ...stsz, ...stco]);

  const dref = writeBox("dref", [
    0, 0, 0, 0, // version + flags
    ...writeUint32(1), // entry count
    ...writeBox("url ", [0, 0, 0, 1]), // url_ with self-contained flag
  ]);

  const dinf = writeBox("dinf", [...dref]);

  const smhd = writeBox("smhd", [0, 0, 0, 0, 0, 0, 0, 0]);
  const vmhd = writeBox("vmhd", [0, 0, 0, 1, 0, 0, 0, 0]);

  const minf = writeBox("minf", [...vmhd, ...dinf, ...stbl]);

  const mdhd = writeBox("mdhd", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // creation time
    0, 0, 0, 0, // modification time
    ...writeUint32(timescale),
    ...writeUint32(durationTS),
    0, 0, // language
    0, 0, // pre_defined
  ]);

  const hdlr = writeBox("hdlr", [
    0, 0, 0, 0, // version + flags
    0, 0, 0, 0, // pre_defined
    ...writeString("vide"), // handler type
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // reserved
    ...writeString("VideoHandler"), 0, // name
  ]);

  const mdia = writeBox("mdia", [...mdhd, ...hdlr, ...minf]);

  const tkhd = writeBox("tkhd", [
    0, 0, 0, 3, // version + flags (track enabled + in movie)
    0, 0, 0, 0, // creation time
    0, 0, 0, 0, // modification time
    0, 0, 0, 1, // track ID
    0, 0, 0, 0, // reserved
    ...writeUint32(durationTS),
    0, 0, 0, 0, 0, 0, 0, 0, // reserved
    0, 0, // layer
    0, 0, // alternate group
    0, 0, // volume
    0, 0, // reserved
    0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // matrix row 1
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, // matrix row 2
    0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0, // matrix row 3
    ...writeUint32(width << 16), // width (fixed point 16.16)
    ...writeUint32(height << 16), // height (fixed point 16.16)
  ]);

  const trak = writeBox("trak", [...tkhd, ...mdia]);

  return writeBox("moov", [...mvhd, ...trak]);
}

/** Yield execution back to the browser event loop */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
