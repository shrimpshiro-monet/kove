export type ReferenceEditEventType =
  | "cut"
  | "flash"
  | "push_in"
  | "speed_ramp"
  | "shake"
  | "whip"
  | "hold"
  | "caption_hit"
  | "color_pulse"
  | "beat_hit";

export type ReferenceEditEvent = {
  timeSec: number;
  normalizedTime: number; // 0 to 1
  type: ReferenceEditEventType;
  intensity: number; // 0 to 1
  durationSec?: number;
  beatAligned?: boolean;
  visualRole?: "establishing" | "action" | "closeup" | "reaction" | "impact" | "breath";
  notes?: string;
};

export type ReferenceEditTrace = {
  sourceId: string;
  durationSec: number;
  avgShotDurationSec: number;
  events: ReferenceEditEvent[];
  shotDurations: number[];
  energyCurve: number[];
  effectDensityPer10Sec: number;
  motionDensityPer10Sec: number;
};

export type StyleSlot = {
  outputTimeSec: number;
  normalizedTime: number;
  preferredShotDurationSec: number;
  requiredEvents: ReferenceEditEventType[];
  intensity: number;
  visualRole?: "establishing" | "action" | "closeup" | "reaction" | "impact" | "breath";
};

export function compileTraceToStyleSlots(
  trace: ReferenceEditTrace,
  targetDurationSec: number
): StyleSlot[] {
  return trace.events.map((event) => ({
    outputTimeSec: event.normalizedTime * targetDurationSec,
    normalizedTime: event.normalizedTime,
    preferredShotDurationSec: trace.avgShotDurationSec,
    requiredEvents: [event.type],
    intensity: event.intensity,
    visualRole: event.visualRole,
  }));
}
