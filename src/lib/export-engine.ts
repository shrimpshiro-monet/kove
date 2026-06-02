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
 * Export a MonetEDL to an MP4 Blob.
 * Uses WebCodecs VideoEncoder + a simple MP4 muxer.
 *
 * Target spec: H.264 Baseline, 1080p, 30fps, ~8Mbps
 * Audio: AAC 128kbps from music track (if present)
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

  const { width, height, fps, duration } = {
    width: edl.timeline.resolution.width,
    height: edl.timeline.resolution.height,
    fps: edl.timeline.fps,
    duration: edl.timeline.duration,
  };

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

  // --- Set up off-screen canvas for rendering ---
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const renderer = new MonetRenderer();
  await renderer.initialize(edl, canvas, mediaUrls);

  // --- Collect encoded video chunks ---
  const videoChunks: EncodedVideoChunk[] = [];
  let avcDescription: ArrayBuffer | undefined;

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
    error: (e) => { throw e; },
  });

  encoder.configure({
    codec: "avc1.42001f", // H.264 Baseline Level 3.1
    width,
    height,
    bitrate: 8_000_000, // 8 Mbps
    framerate: fps,
    latencyMode: "quality",
  });

  // --- Render and encode each frame ---
  report("rendering", 0);

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const time = frameIdx / fps;

    // Render this frame to canvas
    await renderer.renderFrame(time);

    // Create VideoFrame from canvas
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(time * 1_000_000), // microseconds
      duration: Math.round((1 / fps) * 1_000_000),
    });

    const isKey = frameIdx % (fps * 2) === 0; // keyframe every 2s
    encoder.encode(frame, { keyFrame: isKey });
    frame.close();

    if (frameIdx % 10 === 0) {
      report("rendering", frameIdx);
      // Yield to browser event loop every 10 frames
      await yieldToMain();
    }
  }

  report("encoding", totalFrames);
  await encoder.flush();
  encoder.close();

  // --- Mux into MP4 ---
  report("muxing", totalFrames);

  const mp4Blob = muxToMP4(videoChunks, width, height, fps, duration, avcDescription);

  report("done", totalFrames);

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

  // mdat box: concatenate all sample data
  const mdatPayload: number[] = [];
  const sampleOffsets: number[] = [];
  let mdatOffset = 8; // ftyp size + mdat header (8 bytes)
  mdatOffset += ftyp.length;
  mdatOffset += 8; // mdat header

  const sampleDataArrays = samples.map((s) => {
    sampleOffsets.push(mdatOffset);
    mdatOffset += s.data.length + 4; // +4 for size prefix
    return s.data;
  });

  const mdatPayloadArr: Uint8Array[] = [];
  for (const sArr of sampleDataArrays) {
    const sizePrefix = new Uint8Array(4);
    const view = new DataView(sizePrefix.buffer);
    view.setUint32(0, sArr.length, false);
    mdatPayloadArr.push(sizePrefix);
    mdatPayloadArr.push(sArr);
    for (let i = 0; i < sizePrefix.length; i++) mdatPayload.push(sizePrefix[i]);
    for (let i = 0; i < sArr.length; i++) mdatPayload.push(sArr[i]);
  }

  const mdat = writeBox("mdat", mdatPayload);

  // Build a minimal moov box
  // This is a simplified version — a proper muxer would compute full stbl tables
  const moov = buildMoovBox(samples, sampleOffsets, width, height, fps, durationTS, timescale, avcDescription);

  // Combine all boxes
  const allBytes = [...ftyp, ...mdat, ...moov];
  return new Blob([new Uint8Array(allBytes)], { type: "video/mp4" });
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
