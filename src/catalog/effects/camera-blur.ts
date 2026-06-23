import { EffectItem } from "../types";

export const CameraBlur: EffectItem = {
  id: "camera-blur",
  type: "blur",
  intensity: 0.5,
  params: { blurRadius: 10, irisShape: "hexagon" },
  aiRationale: "Simulates an image leaving the camera's focal range, blurring the clip. Use for simulating a subject coming into or going out of focus."
};