import * as MP4Box from "mp4box";

export interface DemuxerConfig {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  description?: ArrayBuffer | null;
  duration: number;
}

export interface DemuxerEvents {
  onReady: (config: DemuxerConfig) => void;
  onSample: (chunk: EncodedVideoChunk) => void;
  onError: (error: Error) => void;
}

export function createDemuxer(events: DemuxerEvents) {
  const mp4box = MP4Box.createFile();

  mp4box.onReady = (info: MP4Box.Movie) => {
    const track = info.videoTracks[0];
    if (!track) {
      events.onError(new Error("No video track found"));
      return;
    }

    if (!track.video) {
      events.onError(new Error("Video track missing video dimensions"));
      return;
    }

    const trak = mp4box.getTrackById(track.id);
    let description: ArrayBuffer | null = null;
    try {
      const stsd = (trak as any)?.mdia?.minf?.stbl?.stsd;
      if (stsd?.entries?.[0]?.avcC) {
        description = stsd.entries[0].avcC.buffer;
      } else if (stsd?.entries?.[0]?.hvcC) {
        description = stsd.entries[0].hvcC.buffer;
      }
    } catch {
      // description may be unavailable
    }

    events.onReady({
      codec: track.codec,
      codedWidth: track.video.width,
      codedHeight: track.video.height,
      description,
      duration: info.duration / info.timescale,
    });

    mp4box.setExtractionOptions(track.id, null, { nbSamples: 30 });
  };

  mp4box.onSamples = (trackId: number, _user: unknown, samples: MP4Box.Sample[]) => {
    for (const s of samples) {
      if (!s.data) {
        events.onError(new Error("Sample missing data"));
        continue;
      }

      try {
        const chunk = new EncodedVideoChunk({
          type: s.is_sync ? "key" : "delta",
          timestamp: (s.cts / s.timescale) * 1_000_000,
          duration: (s.duration / s.timescale) * 1_000_000,
          data: s.data,
        });
        events.onSample(chunk);
      } catch (e) {
        events.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  };

  return {
    appendBuffer: (data: ArrayBuffer, _offset: number) =>
      mp4box.appendBuffer(MP4Box.MP4BoxBuffer.fromArrayBuffer(data, _offset)),
    flush: () => mp4box.flush(),
  };
}
