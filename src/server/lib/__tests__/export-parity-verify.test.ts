import { describe, it, expect } from "vitest";
import { effectToFFmpegFilters } from "../../lib/editly-effects";
import { mapTransition, getAvailableTransitions } from "../../lib/editly-transitions";

// ─── Test EDL: Effects Covered by Export Parity Pass 1 ──────────────────────
// This test exercises every effect, transition, and grade that was fixed.

const testEffects = [
  // Previously missing — now fixed
  { id: "fx1", type: "noise_grain", intensity: 0.5 },
  { id: "fx2", type: "wave_warp", intensity: 0.4, params: { frequency: 3, speed: 2 } },
  { id: "fx3", type: "fisheye", intensity: 0.6 },
  { id: "fx4", type: "color_balance", intensity: 0.5 },
  { id: "fx5", type: "light_leak", intensity: 0.3 },
  { id: "fx6", type: "bloom", intensity: 0.4 },
  { id: "fx7", type: "vhs_tracking", intensity: 0.3 },
  { id: "fx8", type: "overlay", intensity: 0.3 },
  { id: "fx9", type: "halftone_benday", intensity: 0.4 },
  { id: "fx10", type: "comic_ink_edges", intensity: 0.5 },
  { id: "fx11", type: "frame_stutter_anime", intensity: 0.3 },
  { id: "fx12", type: "lens_flare", intensity: 0.5 },
  // Previously working — regression check
  { id: "fx13", type: "blur", intensity: 0.5 },
  { id: "fx14", type: "shake", intensity: 0.4 },
  { id: "fx15", type: "glow", intensity: 0.3 },
  { id: "fx16", type: "rgb_split", intensity: 0.5 },
  { id: "fx17", type: "flash_white", intensity: 0.8 },
  { id: "fx18", type: "vignette_pro", intensity: 0.6 },
  { id: "fx19", type: "desaturate", intensity: 0.3 },
  { id: "fx20", type: "bw_toggle", intensity: 0.8 },
];

const testTransitions = [
  // Previously falling back to "fade" — now fixed
  "dip_black",
  "radial_wipe",
  "clock_wipe",
  "linear_wipe",
  "gradient_wipe",
  "barn_doors",
  "iris",
  "pinwheel",
  "film_burn",
  "spin",
  "blur",
  "pixelate",
  // Previously working — regression check
  "crossfade",
  "whip-pan",
  "zoom-blur",
  "glitch",
  "flash",
  "dissolve",
];

describe("Export Parity — Effect FFmpeg Filter Generation", () => {
  for (const effect of testEffects) {
    it(`generates FFmpeg filters for "${effect.type}"`, () => {
      const filters = effectToFFmpegFilters(effect as any);

      // Every effect should produce at least one filter
      expect(filters.length).toBeGreaterThan(0);

      // Every filter should be a non-empty string
      for (const f of filters) {
        expect(typeof f).toBe("string");
        expect(f.length).toBeGreaterThan(0);
      }
    });
  }

  it("noise_grain produces noise filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "noise_grain", intensity: 0.5 } as any);
    expect(filters.some((f) => f.includes("noise"))).toBe(true);
  });

  it("wave_warp produces geq filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "wave_warp", intensity: 0.4 } as any);
    expect(filters.some((f) => f.includes("geq"))).toBe(true);
  });

  it("fisheye produces lenscorrection filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "fisheye", intensity: 0.6 } as any);
    expect(filters.some((f) => f.includes("lenscorrection"))).toBe(true);
  });

  it("color_balance produces curves filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "color_balance", intensity: 0.5 } as any);
    expect(filters.some((f) => f.includes("curves"))).toBe(true);
  });

  it("light_leak produces compound split+blend filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "light_leak", intensity: 0.3 } as any);
    expect(filters.some((f) => f.includes("blend"))).toBe(true);
  });

  it("bloom produces compound split+blend filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "bloom", intensity: 0.4 } as any);
    expect(filters.some((f) => f.includes("blend"))).toBe(true);
  });

  it("vhs_tracking produces rgbashift+noise filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "vhs_tracking", intensity: 0.3 } as any);
    expect(filters.some((f) => f.includes("rgbashift"))).toBe(true);
  });

  it("overlay produces blend filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "overlay", intensity: 0.3 } as any);
    expect(filters.some((f) => f.includes("blend"))).toBe(true);
  });

  it("halftone_benday produces threshold+tile filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "halftone_benday", intensity: 0.4 } as any);
    expect(filters.some((f) => f.includes("threshold"))).toBe(true);
    expect(filters.some((f) => f.includes("tile"))).toBe(true);
  });

  it("comic_ink_edges produces edgedetect filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "comic_ink_edges", intensity: 0.5 } as any);
    expect(filters.some((f) => f.includes("edgedetect"))).toBe(true);
  });

  it("frame_stutter_anime produces fps filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "frame_stutter_anime", intensity: 0.3 } as any);
    expect(filters.some((f) => f.includes("fps"))).toBe(true);
  });

  it("lens_flare produces compound split+blend filter", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "lens_flare", intensity: 0.5 } as any);
    expect(filters.some((f) => f.includes("blend"))).toBe(true);
  });
});

describe("Export Parity — Transition gl-transition Mapping", () => {
  for (const transition of testTransitions) {
    it(`maps "${transition}" to a gl-transition name`, () => {
      const result = mapTransition(transition as any, 0.5);

      expect(result).toBeDefined();
      expect(result!.name).toBeDefined();
      expect(result!.name.length).toBeGreaterThan(0);
      expect(result!.duration).toBe(0.5);
    });
  }

  it("dip_black maps to fadeBlack (not fade)", () => {
    const result = mapTransition("dip_black", 0.5);
    expect(result!.name).toBe("fadeBlack");
  });

  it("radial_wipe maps to Radial (not fade)", () => {
    const result = mapTransition("radial_wipe", 0.5);
    expect(result!.name).toBe("Radial");
  });

  it("barn_doors maps to doorway (not fade)", () => {
    const result = mapTransition("barn_doors", 0.5);
    expect(result!.name).toBe("doorway");
  });

  it("iris maps to CircleOpen (not fade)", () => {
    const result = mapTransition("iris", 0.5);
    expect(result!.name).toBe("CircleOpen");
  });

  it("film_burn maps to burn (not fade)", () => {
    const result = mapTransition("film_burn", 0.5);
    expect(result!.name).toBe("burn");
  });

  it("spin maps to Angular (not fade)", () => {
    const result = mapTransition("spin", 0.5);
    expect(result!.name).toBe("Angular");
  });

  it("cut returns undefined (no transition)", () => {
    const result = mapTransition("cut", 0.5);
    expect(result).toBeUndefined();
  });

  it("getAvailableTransitions includes all EDL schema transitions", () => {
    const available = getAvailableTransitions();
    const required = [
      "cut", "crossfade", "dissolve", "whip-pan", "zoom-blur", "glitch", "flash",
      "dip_black", "radial_wipe", "clock_wipe", "linear_wipe", "gradient_wipe",
      "barn_doors", "iris", "pinwheel", "film_burn", "spin", "blur", "pixelate",
    ];
    for (const r of required) {
      expect(available).toContain(r);
    }
  });
});

describe("Export Parity — Regression Checks (Previously Working)", () => {
  it("blur still produces boxblur", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "blur", intensity: 0.5 } as any);
    expect(filters.some((f) => f.includes("boxblur"))).toBe(true);
  });

  it("shake still produces crop+scale", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "shake", intensity: 0.4 } as any);
    expect(filters.some((f) => f.includes("crop"))).toBe(true);
  });

  it("glow still produces split+blend", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "glow", intensity: 0.3 } as any);
    expect(filters.some((f) => f.includes("blend"))).toBe(true);
  });

  it("rgb_split still produces rgbashift", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "rgb_split", intensity: 0.5 } as any);
    expect(filters.some((f) => f.includes("rgbashift"))).toBe(true);
  });

  it("flash_white still produces blend", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "flash_white", intensity: 0.8 } as any);
    expect(filters.some((f) => f.includes("blend"))).toBe(true);
  });

  it("vignette_pro still produces vignette", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "vignette_pro", intensity: 0.6 } as any);
    expect(filters.some((f) => f.includes("vignette"))).toBe(true);
  });

  it("desaturate still produces eq saturation", () => {
    const filters = effectToFFmpegFilters({ id: "test", type: "desaturate", intensity: 0.3 } as any);
    expect(filters.some((f) => f.includes("eq=saturation"))).toBe(true);
  });

  it("crossfade still maps to fade", () => {
    const result = mapTransition("crossfade", 0.5);
    expect(result!.name).toBe("fade");
  });

  it("whip-pan still maps to Directional", () => {
    const result = mapTransition("whip-pan", 0.5);
    expect(result!.name).toBe("Directional");
  });
});
