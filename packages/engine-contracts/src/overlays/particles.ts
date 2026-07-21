/**
 * Particle Engine Contract
 *
 * Extracted from: apps/kove-advanced/packages/core/src/effects/particle-engine.ts
 *                 apps/kove-advanced/packages/core/src/effects/particle-types.ts
 *
 * Defines particle system presets and params.
 */
import { z } from "zod";

// ── Particle Type ───────────────────────────────────────────────────────────

export const ParticleTypeSchema = z.enum([
  "sparkle",
  "rain",
  "snow",
  "fire",
  "smoke",
  "confetti",
  "dust",
  "bokeh",
  "glitter",
  "custom",
]);
export type ParticleType = z.infer<typeof ParticleTypeSchema>;

// ── Particle Emission ───────────────────────────────────────────────────────

export const ParticleEmissionSchema = z.object({
  rate: z.number().min(0).max(1000).default(50).describe("Particles per second"),
  burst: z.number().min(0).max(500).optional().describe("One-shot burst count"),
  spread: z.number().min(0).max(360).default(360).describe("Emission angle spread"),
  direction: z.number().min(0).max(360).default(270).describe("Emission direction (degrees)"),
});
export type ParticleEmission = z.infer<typeof ParticleEmissionSchema>;

// ── Particle Physics ────────────────────────────────────────────────────────

export const ParticlePhysicsSchema = z.object({
  gravity: z.number().default(0).describe("Downward acceleration"),
  wind: z.number().default(0).describe("Horizontal wind force"),
  drag: z.number().min(0).max(1).default(0.01).describe("Air resistance"),
  turbulence: z.number().min(0).max(1).default(0).describe("Random motion"),
});
export type ParticlePhysics = z.infer<typeof ParticlePhysicsSchema>;

// ── Particle Appearance ─────────────────────────────────────────────────────

export const ParticleAppearanceSchema = z.object({
  color: z.string().default("#ffffff"),
  colorEnd: z.string().optional().describe("Color at end of life"),
  size: z.number().min(0).max(100).default(5),
  sizeEnd: z.number().min(0).max(100).optional(),
  opacity: z.number().min(0).max(1).default(1),
  opacityEnd: z.number().min(0).max(1).optional(),
  rotation: z.boolean().default(false).describe("Random rotation"),
  shape: z.enum(["circle", "square", "triangle", "star"]).default("circle"),
});
export type ParticleAppearance = z.infer<typeof ParticleAppearanceSchema>;

// ── Particle System ─────────────────────────────────────────────────────────

export const ParticleSystemSchema = z.object({
  type: ParticleTypeSchema,
  emission: ParticleEmissionSchema,
  physics: ParticlePhysicsSchema,
  appearance: ParticleAppearanceSchema,
  lifetime: z.number().min(0.1).max(10).default(2).describe("Seconds"),
  maxParticles: z.number().min(1).max(5000).default(200),
  startTime: z.number().min(0).default(0),
  duration: z.number().min(0).max(60).default(5).describe("System lifetime in seconds"),
});
export type ParticleSystem = z.infer<typeof ParticleSystemSchema>;

// ── Presets ─────────────────────────────────────────────────────────────────

export const PARTICLE_PRESETS: Record<string, ParticleSystem> = {
  "sparkle": {
    type: "sparkle",
    emission: { rate: 30, spread: 360, direction: 270 },
    physics: { gravity: -0.5, wind: 0, drag: 0.02, turbulence: 0.3 },
    appearance: { color: "#FFD700", colorEnd: "#FFA500", size: 4, sizeEnd: 0, opacity: 1, opacityEnd: 0, rotation: true, shape: "star" },
    lifetime: 1.5, maxParticles: 100, startTime: 0, duration: 5,
  },
  "rain": {
    type: "rain",
    emission: { rate: 100, spread: 10, direction: 260 },
    physics: { gravity: 2, wind: 0.5, drag: 0, turbulence: 0.1 },
    appearance: { color: "#88BBFF", size: 2, opacity: 0.6, shape: "square" },
    lifetime: 1, maxParticles: 500, startTime: 0, duration: 10,
  },
  "confetti": {
    type: "confetti",
    emission: { burst: 100, spread: 120, direction: 270 },
    physics: { gravity: 1.5, wind: 0.3, drag: 0.05, turbulence: 0.5 },
    appearance: { color: "#FF4444", size: 8, opacity: 1, rotation: true, shape: "square" },
    lifetime: 3, maxParticles: 200, startTime: 0, duration: 0.1,
  },
  "bokeh": {
    type: "bokeh",
    emission: { rate: 5, spread: 360, direction: 0 },
    physics: { gravity: -0.1, wind: 0, drag: 0.01, turbulence: 0.2 },
    appearance: { color: "#FFFFFF", opacity: 0.3, size: 20, shape: "circle" },
    lifetime: 4, maxParticles: 30, startTime: 0, duration: 10,
  },
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

export function validateParticleSystem(data: unknown): ParticleSystem {
  return ParticleSystemSchema.parse(data);
}
