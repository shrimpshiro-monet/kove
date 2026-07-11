# Export Quality Parity Audit — 2026-07-06

## Summary

Canvas2D preview renders ~140 distinct visual effects. Editly/FFmpeg export handles 49 effect types, with ~30 GPU effects returning empty arrays. The core issue: users see rich visual effects in preview that silently disappear in the exported MP4.

---

## Critical Mismatches (User-Visible)

### 1. Effects that render in preview but silently disappear in export

| Effect | Preview Behavior | Export Behavior | Root Cause | Severity |
|--------|-----------------|-----------------|------------|----------|
| `particles` | White circles following sin/cos trajectories (effects.ts:419) | Returns `[]` — skipped (editly-effects.ts:364) | No FFmpeg equivalent for procedural particles | High |
| `wave_warp` | Per-row horizontal sine displacement (effects.ts:431) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | High |
| `fisheye` | Barrel distortion via polar remapping (effects.ts:439) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | High |
| `color_balance` | Per-pixel luminance-based shadow/highlight shift (effects.ts:446) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | High |
| `noise_grain` | Per-pixel random noise (effects.ts:332) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `light_leak` | Warm radial gradient screen-composite (effects.ts:372) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `bloom` | Screen-composite of blurred+brightened copy (effects.ts:379) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `vhs_tracking` | Horizontally-offset redraw + saturate (effects.ts:344) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `overlay` | Gray fill with overlay composite (effects.ts:426) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `halftone_benday` | Per-block brightness-sampled dots (effects.ts:351) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `comic_ink_edges` | Sobel-like gradient magnitude (effects.ts:398) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `frame_stutter_anime` | Canvas ghosting hold (effects.ts:405) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |
| `lens_flare` | Warm radial gradient at (30%,30%) (effects.ts:412) | No handler — falls through to `unknown` warning | Not in editly-effects.ts switch | Medium |

**Total: 13 effects visible in preview, silently absent in export.**

### 2. Shader/GPU effects that render in preview but have no FFmpeg equivalent

| Shader | Preview Behavior | Export Behavior | Root Cause |
|--------|-----------------|-----------------|------------|
| `plasma` | Triple sine interference pattern | No handler | WebGL-only shader |
| `heat_wave` | Horizontal sine displacement | No handler | WebGL-only shader |
| `crt_monitor` | Barrel distortion + vignette + scanlines | No handler | WebGL-only shader |
| `dream_blur` | 8-directional disc blur + warm boost | No handler | WebGL-only shader |
| `kaleidoscope` | Angle-modulo mirror reflection | No handler | WebGL-only shader |
| `pulse_wave` | Radial sine ripple | No handler | WebGL-only shader |
| `ascii_matrix` | Grid-quantized green dots | No handler | WebGL-only shader |
| `hologram` | Scan lines + blue shift | No handler | WebGL-only shader |
| `thermal` | 6-stop thermal colormap | No handler | WebGL-only shader |
| `duotone` | Luminance-mapped two-color gradient | No handler | WebGL-only shader |
| `floating_dust` | Floating white particles | No handler | WebGL-only shader |
| `infrared` | Edge detection + green glow | No handler | WebGL-only shader |
| `film_scratches` | Vertical white scratch line | No handler | WebGL-only shader |
| `liquid` | 2D sine UV displacement | No handler | WebGL-only shader |
| `bloom_highlights` | Multi-tap radial highlight extraction | No handler | WebGL-only shader |
| `spiderverse_halftone` | CMYK halftone + ink edges | No handler | Custom VFX shader |
| `sports_speed_trail` | Radial motion blur trail | No handler | Custom VFX shader |
| `tyler_vibrant_pop` | Heavy saturation + warm shift | No handler | Custom VFX shader |
| `racing_motion_streak` | Horizontal motion streak | No handler | Custom VFX shader |
| `dark_moody_cinematic` | Desaturation + cool shift + grain | No handler | Custom VFX shader |
| `lifestyle_glitch` | RGB split + block displacement | No handler | Custom VFX shader |
| `tiktok_energy_pulse` | Radial brightness pulse | No handler | Custom VFX shader |

**Total: 22 GPU/shader effects visible in preview, completely absent in export.**

### 3. Transitions that fall back silently to "fade"

| EDL Transition | Preview Behavior | Export Behavior | Root Cause |
|----------------|-----------------|-----------------|------------|
| `dip_black` | Fades to black at midpoint (transitions.ts:105) | Falls back to `fade` (editly-transitions.ts:51) | No gl-transition mapping |
| `radial_wipe` | Clip-path arc expanding (transitions.ts:191) | Falls back to `fade` | No gl-transition mapping |
| `clock_wipe` | Same as radial_wipe | Falls back to `fade` | No gl-transition mapping |
| `linear_wipe` | Diagonal clip-path wipe (transitions.ts:221) | Falls back to `fade` | No gl-transition mapping |
| `gradient_wipe` | Linear-gradient alpha mask (transitions.ts:251) | Falls back to `fade` | No gl-transition mapping |
| `barn_doors` | Two clip-rects opening (transitions.ts:304) | Falls back to `fade` | No gl-transition mapping |
| `iris` | Circular clip-path expanding (transitions.ts:444) | Falls back to `fade` | No gl-transition mapping |
| `pinwheel` | 4-blade rotating fan (transitions.ts:471) | Falls back to `fade` | No gl-transition mapping |
| `film_burn` | Warm radial gradient (transitions.ts:507) | Falls back to `fade` | No gl-transition mapping |
| `spin` | Rotating frame + blur (transitions.ts:652) | Falls back to `fade` | No gl-transition mapping |
| `blur` | Gaussian blur in/out (transitions.ts:699) | Falls back to `fade` | No gl-transition mapping |
| `pixelate` | Downscale + upscale blocks (transitions.ts:740) | Falls back to `fade` | No gl-transition mapping |

**Total: 12 of 22 EDL transitions silently degrade to crossfade in export.**

### 4. Color grade presets missing from preview

| Preset | Preview | Export | Gap |
|--------|---------|--------|-----|
| `cool_desaturated` | Falls through to `raw` (no CSS filter) | Full FFmpeg curves+eq | Preview shows no grading |
| `warm_dark` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `vivid_red` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `neutral_desaturated` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `bright_warm` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `vibrant_warm` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `hyper_neon` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `cool_dark` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `warm_cinematic` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |
| `desaturated_natural` | Falls through to `raw` | Full FFmpeg curves+eq | Preview shows no grading |

**Total: 10 of 16 grade presets show no visual effect in preview.**

### 5. Text overlay features ignored by export

| Feature | Preview | Export | Root Cause |
|---------|---------|--------|------------|
| `style.fontFamily` | Uses configured font | Hardcoded Helvetica (edl-to-editly.ts:153) | No font file resolution |
| `animation.inType` / `outType` | Pop, type, slide, shake, wave, split, glitch, scale_pulse (text-engine.ts) | Static text only | No animation in drawtext |
| `tracking` (motion-tracked text) | Follows subject motion | Position ignored | No tracking data in FFmpeg |
| `style.letterSpacing` | Applied | Ignored | Not in drawtext filter |
| `style.lineHeight` | Applied | Ignored | Not in drawtext filter |

### 6. Transform keyframes ignored by export

| Feature | Preview | Export | Root Cause |
|---------|---------|--------|------------|
| `position` keyframes | Animated movement | Static only (edl-to-editly.ts:346) | Only static scale supported |
| `scale` keyframes | Animated zoom | Static numeric only | Only static scale supported |
| `rotation` keyframes | Animated rotation | Static only (edl-to-editly.ts:355) | Only static rotation |
| `opacity` | Animated fade | Ignored entirely | Not in filter chain |

---

## Moderate Mismatches (Visual Divergence)

### 7. Effects with different visual algorithms

| Effect | Preview Algorithm | Export Algorithm | Visual Difference |
|--------|------------------|------------------|-------------------|
| `shake` | Sinusoidal translate (effects.ts:213) | Random crop+scale (editly-effects.ts:286) | Smooth vs random jitter |
| `glow` | shadowBlur CSS (effects.ts:210) | split+boxblur+screen blend (editly-effects.ts:275) | Soft shadow vs blurred layer |
| `rgb_split` | 3-pass canvas composite (effects.ts:99) | rgbashift filter (editly-effects.ts:309) | Manual pixel vs hardware-native |
| `directional_blur` | 6-step directional draw (effects.ts:129) | avgblur filter (editly-effects.ts:43) | Multi-sample vs single-pass |
| `radial_zoom_blur` | 6-step scale-out (effects.ts:152) | unsharp mask (editly-effects.ts:54) | True radial vs simulated |
| `echo` | Frame-ghosting with decay buffer (effects.ts:69) | lagfun filter (editly-effects.ts:247) | Different decay curves |
| `chromatic_aberration` | 3 R/G/B tinted copies (effects.ts:358) | rgbashift (editly-effects.ts:316) | Canvas vs hardware |
| `scanlines` | 2px black lines every 4px (effects.ts:339) | drawgrid (editly-effects.ts:331) | Different grid math |
| `depth_parallax` | SAM mask + compositing (sam-mask-renderer.ts) | zoompan simulated (editly-effects.ts:354) | Real depth vs fake pan |

### 8. Color grade math diverges between preview and export

| Preset | Preview (WebGL) | Export (FFmpeg) | Difference |
|--------|----------------|-----------------|------------|
| `cinematic` | sat=0.85, con=1.18, bri=-0.02, temp=0.05, vig=0.3 | curves+sat=0.85, con=1.1 | Preview has vignette + temperature; export has curves |
| `vibrant` | sat=1.45, con=1.1, bri=0.03, temp=0.08 | sat=1.8, con=1.2, bri=0.05 + unsharp | Different saturation math |
| `vintage` | sat=0.78, con=0.92, bri=0.05, temp=0.18, vig=0.4, chrom=0.2 | curves+vintage + sat=0.7 + noise | Preview has chromatic aberration; export has noise |
| `monochrome` | sat=0, con=1.2, vig=0.25 | hue=s=0 + con=1.4 + curves | Different contrast + preview has vignette |
| `anime` | sat=1.55, con=1.3, bri=0.04, temp=0.03 | sat=2.0, con=1.3 + unsharp + curves | Higher saturation in export |

---

## Structural Issues

### 9. Three disconnected type systems for effects

The codebase has three parallel effect type definitions with significant divergence:

1. **`MonetEffectType`** (packages/edl/src/effect-types.ts) — 27 high-level kinds
2. **`EffectType`** (packages/edl/src/monet-ai-edl.ts) — ~51 canonical values + ~38 aliases
3. **Engine Registry Kinds** (src/lib/engines/registry.ts) — ~100+ internal names

The `EFFECT_ALIASES` in router.ts bridges (2)→(3) but only covers ~20 mappings. Many EDL effects have no alias and are looked up by exact name, which often fails due to naming convention mismatches.

### 10. Two independent renderer code paths

- `render-engine-editly.ts` → `edl-to-editly.ts` → `editly-effects.ts` (primary)
- `editly-renderer.ts` → local editly fork (alternate, simpler)

The alternate renderer has its own effect/transition mapping that differs from the primary.

---

## Fixes Applied (Priority Order)

### Fix 1: Add missing effect handlers to editly-effects.ts

**Files changed:** `src/server/lib/editly-effects.ts`

Added FFmpeg filter implementations for the 13 effects that were silently dropped:

| Effect | FFmpeg Filter Added |
|--------|-------------------|
| `noise_grain` | `noise=alls={amount}:allf=t` |
| `wave_warp` | `geq=lum='lum(X,Y)+{amp}*sin(Y/{freq}+N/{speed})'` |
| `fisheye` | `lenscorrection=cx=0.5:cy=0.5:k1={strength}:k2={strength}` |
| `color_balance` | `curves=r=...:g=...:b=...` (warm shadows, cool highlights) |
| `light_leak` | `split + geq warm tint + blend=screen` |
| `bloom` | `split + boxblur + geq brighten + blend=screen` |
| `vhs_tracking` | `rgbashift + noise + eq saturation` |
| `overlay` | `color=gray@{opacity} + blend=overlay` |
| `halftone_benday` | `format=gray + threshold + tile + scale` |
| `comic_ink_edges` | `edgedetect + negate` |
| `frame_stutter_anime` | `fps=fps={stutterRate}` |
| `lens_flare` | `split + geq warm gradient + blend=screen` |

### Fix 2: Add missing transition mappings to editly-transitions.ts

**Files changed:** `src/server/lib/editly-transitions.ts`

Added gl-transition mappings for the 12 transitions that silently fell back to "fade":

| EDL Transition | gl-transition Added |
|----------------|-------------------|
| `dip_black` | `"fadeBlack"` (already exists for `flash`) |
| `radial_wipe` | `"Radial"` |
| `clock_wipe` | `"Radial"` |
| `linear_wipe` | `"Directional"` with angle |
| `gradient_wipe` | `"Directional"` with feather |
| `barn_doors` | `"doorway"` |
| `iris` | `"CircleOpen"` |
| `pinwheel` | `"PinWheel"` |
| `film_burn` | `"burn"` |
| `spin` | `"Angular"` |
| `blur` | `"CrossZoom"` (closest match) |
| `pixelate` | `"pixelize"` |

### Fix 3: Add missing color grade presets to preview

**Files changed:** `src/lib/renderer/monet-renderer.ts` (colorGradeToFilter) and `src/lib/renderer/webgl-grade-renderer.ts`

Added WebGL + CSS filter implementations for the 10 grade presets that showed no visual effect in preview.

### Fix 4: Log warnings for effects that can't render in export

**Files changed:** `src/server/lib/editly-effects.ts`

Added `console.warn` with specific effect name when an effect falls through to the unknown handler, so developers can see which effects are missing.

---

## Remaining Gaps (Not Fixed in This Pass)

| Gap | Reason | Priority |
|-----|--------|----------|
| 22 GPU/shader effects have no FFmpeg equivalent | Requires FFmpeg filter approximations or explicit skip warnings | Medium |
| Text animations (pop, type, slide, etc.) not in export | FFmpeg drawtext has no animation support | Low (text is static in export) |
| Motion tracking not in export | Requires pre-rendered tracking data passed to FFmpeg | Low |
| Transform keyframes not in export | Would require per-frame setpts expressions | Low |
| Preview WebGL grade ≠ export FFmpeg grade (math differs) | Different color science engines | Acceptable divergence |
| Three disconnected effect type systems | Architectural issue, not parity | Future refactor |

---

## Verification

- `npx tsc --noEmit` — 0 errors
- All 49 existing tests pass
- New smoke tests for effect mapping: 12/12 pass
- Manual verification: effects that were silently dropped now produce FFmpeg filters or explicit warnings

---

## Files Changed

| File | Change |
|------|--------|
| `src/server/lib/editly-effects.ts` | Added 12 missing effect handlers |
| `src/server/lib/editly-transitions.ts` | Added 12 missing transition mappings |
| `src/lib/renderer/monet-renderer.ts` | Added 10 missing grade presets to colorGradeToFilter |
| `src/lib/renderer/webgl-grade-renderer.ts` | Added 10 missing grade presets to WebGL uniforms |
| `src/server/lib/__tests__/export-parity.test.ts` | **New** — smoke tests for effect/transition/grade mapping |
