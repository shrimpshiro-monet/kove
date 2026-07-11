import { type EffectBlock as MonetEffectBlock } from "@monet/edl";

export type EffectParamKind = "number" | "boolean" | "text" | "select";

export interface EffectParamDefinition {
  key: string;
  label: string;
  kind: EffectParamKind;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  defaultValue: unknown;
}

export interface EffectDefinition {
  type: MonetEffectBlock["type"];
  label: string;
  description: string;
  params: EffectParamDefinition[];
}

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    type: "impact_flash",
    label: "Impact Flash",
    description: "Quick brightness hit at the start of a clip.",
    params: [
      {
        key: "intensity",
        label: "Intensity",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.8,
      },
    ],
  },
  {
    type: "context_shake",
    label: "Context Shake",
    description: "Directional procedural camera shake.",
    params: [
      {
        key: "intensity",
        label: "Intensity",
        kind: "number",
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 0.4,
      },
      {
        key: "frequency",
        label: "Frequency",
        kind: "number",
        min: 1,
        max: 30,
        step: 1,
        defaultValue: 8,
      },
      {
        key: "decay",
        label: "Decay",
        kind: "boolean",
        defaultValue: true,
      },
    ],
  },
  {
    type: "speed_ramp",
    label: "Speed Ramp",
    description: "Velocity change over a short segment.",
    params: [
      {
        key: "from",
        label: "From",
        kind: "number",
        min: 0.1,
        max: 8,
        step: 0.05,
        defaultValue: 1,
      },
      {
        key: "to",
        label: "To",
        kind: "number",
        min: 0.1,
        max: 8,
        step: 0.05,
        defaultValue: 1.5,
      },
      {
        key: "easing",
        label: "Easing",
        kind: "select",
        options: ["linear", "ease-in", "ease-out", "ease-in-out", "bezier"],
        defaultValue: "ease-in-out",
      },
    ],
  },
  {
    type: "color_grade",
    label: "Color Grade",
    description: "Global or clip-level color treatment.",
    params: [
      {
        key: "preset",
        label: "Preset",
        kind: "select",
        options: ["cinematic", "anime", "sports", "monochrome"],
        defaultValue: "cinematic",
      },
      {
        key: "strength",
        label: "Strength",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.7,
      },
    ],
  },
  {
    type: "gl_transition",
    label: "GL Transition",
    description: "Shader transition attached to a cut.",
    params: [
      {
        key: "preset",
        label: "Preset",
        kind: "select",
        options: ["whip", "directional_blur", "flash_wipe"],
        defaultValue: "whip",
      },
      {
        key: "direction",
        label: "Direction",
        kind: "select",
        options: ["left", "right", "up", "down"],
        defaultValue: "right",
      },
    ],
  },
  {
    type: "audio_fx",
    label: "Audio FX",
    description: "Audio mix/effect automation.",
    params: [
      {
        key: "gain",
        label: "Gain",
        kind: "number",
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 1,
      },
      {
        key: "ducking",
        label: "Ducking",
        kind: "boolean",
        defaultValue: false,
      },
    ],
  },
  {
    type: "mask_composite",
    label: "Mask Composite",
    description: "Mask-driven layer compositing.",
    params: [
      {
        key: "mode",
        label: "Mode",
        kind: "select",
        options: ["text_behind_subject", "aura", "foreground_holdout"],
        defaultValue: "text_behind_subject",
      },
      {
        key: "feather",
        label: "Feather",
        kind: "number",
        min: 0,
        max: 50,
        step: 1,
        defaultValue: 6,
      },
    ],
  },
];

export function getEffectDefinition(
  type: MonetEffectBlock["type"]
): EffectDefinition | null {
  return EFFECT_DEFINITIONS.find((definition) => definition.type === type) ?? null;
}

export function createDefaultEffect(
  type: MonetEffectBlock["type"],
  clipStartTime: number
): MonetEffectBlock {
  const definition = getEffectDefinition(type);

  if (!definition) {
    throw new Error(`Unknown effect type: ${type}`);
  }

  const params: Record<string, unknown> = {};

  for (const param of definition.params) {
    params[param.key] = param.defaultValue;
  }

  return {
    id: `${type}-${Date.now()}-${crypto.randomUUID()}`,
    type,
    start: clipStartTime,
    duration: type === "impact_flash" ? 0.15 : 0.4,
    params,
  };
}