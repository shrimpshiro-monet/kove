import { EffectItem } from "../types";

export const Extract: EffectItem = {
  id: "extract",
  type: "extract",
  params: {
    blackInputLevel: 0.1,
    whiteInputLevel: 0.9,
  },
  aiRationale: "Removes colors turning the video into grayscale based on luminance. Makes pixels less than black input level black, and greater than white input level white. Great for a stylized or monochromatic look."
};
