export interface FlashFrame {
  timestamp: number;
  type: "white" | "black";
  brightness: number;
  precedingShotIndex: number;
  followingShotIndex: number;
}

export function detectFlashFrames(
  frameData: Array<{ timestamp: number; brightness: number }>,
  shots: Array<{ startTime: number; duration: number }>,
  threshold: number = 0.85
): FlashFrame[] {
  if (frameData.length < 3 || shots.length === 0) return [];

  const brightnesses = frameData.map((f) => f.brightness);
  const mean = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
  const variance =
    brightnesses.reduce((s, v) => s + (v - mean) ** 2, 0) / brightnesses.length;
  const stddev = Math.sqrt(variance);

  const flashes: FlashFrame[] = [];

  for (let i = 1; i < frameData.length - 1; i++) {
    const prev = brightnesses[i - 1];
    const curr = brightnesses[i];
    const next = brightnesses[i + 1];

    if (prev === 0 || next === 0) continue;

    const ratioToPrev = curr / prev;
    const ratioToNext = curr / next;

    let flashType: "white" | "black" | null = null;

    if (
      ratioToPrev > 2.5 &&
      ratioToNext > 2.5 &&
      curr > mean + 2 * stddev &&
      curr > threshold
    ) {
      flashType = "white";
    } else if (
      ratioToPrev < 0.4 &&
      ratioToNext < 0.4 &&
      curr < mean - 2 * stddev &&
      curr < (1 - threshold)
    ) {
      flashType = "black";
    }

    if (!flashType) continue;

    const timestamp = frameData[i].timestamp;
    let precedingShotIndex = 0;
    let followingShotIndex = 0;

    for (let s = 0; s < shots.length; s++) {
      const shotEnd = shots[s].startTime + shots[s].duration;
      if (timestamp >= shots[s].startTime && timestamp < shotEnd) {
        precedingShotIndex = s;
        followingShotIndex = Math.min(s + 1, shots.length - 1);
        break;
      }
      if (timestamp < shots[s].startTime) {
        precedingShotIndex = Math.max(0, s - 1);
        followingShotIndex = s;
        break;
      }
      precedingShotIndex = s;
      followingShotIndex = Math.min(s, shots.length - 1);
    }

    flashes.push({
      timestamp,
      type: flashType,
      brightness: curr,
      precedingShotIndex,
      followingShotIndex,
    });
  }

  return flashes;
}
