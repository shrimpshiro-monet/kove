// src/server/lib/editly-effects.ts
// Converts MonetEDL effects into real FFmpeg filter chains
// Pattern: Effect.copy() before apply() prevents mutation bugs (from MoviePy research)

import { EffectSpecMap } from "@monet/edl";
import type { Effect, Shot } from "../types/edl";

export interface FFmpegFilter {
  filter: string;
  options: Record<string, string | number>;
}

/**
 * Deep copy an effect to prevent mutation during filter generation.
 * Pattern from MoviePy: Effect.copy() before apply() prevents bugs
 * when the same effect instance is reused across multiple shots.
 */
export function copyEffect(effect: Effect): Effect {
  return {
    ...effect,
    params: effect.params ? { ...effect.params } : undefined,
  };
}

/**
 * Convert a MonetEDL effect into one or more FFmpeg filter strings.
 * These get injected into Editly's customFrame or applied via
 * the ffmpegFilter layer option.
 */
export function effectToFFmpegFilters(effect: Effect): string[] {
  // Always work on a copy to prevent mutation
  const fx = copyEffect(effect);
  const intensity = fx.intensity ?? 0.5;

  switch (effect.type as string) {
    // ─── BLUR EFFECTS ───
    case "blur":
      return [`boxblur=${Math.round(intensity * 20)}:${Math.round(intensity * 10)}`];

    case "gaussian-blur":
    case "gaussianBlur":
    case "gaussian_blur": {
      const blurriness = (effect.params?.blurriness ?? Math.round(intensity * 20)) || 10;
      const dims = (effect.params?.dimensions as any) ?? "horizontal and vertical";
      let rx = blurriness;
      let ry = blurriness;
      if (dims === "horizontal") ry = 1;
      if (dims === "vertical") rx = 1;
      return [`boxblur=${rx || 1}:${ry || 1}`];
    }

    case "camera-blur":
    case "camera_blur":
    case "cameraBlur": {
      const blurRadius = (effect.params?.blurRadius ?? Math.round(intensity * 30)) || 15;
      return [`boxblur=${blurRadius}:${Math.round(blurRadius / 3)}`];
    }

    case "directional_blur":
    case "directionalBlur":
    case "directional-blur": {
      const angle = effect.params?.direction ?? 90;
      const length = (effect.params?.blurLength ?? Math.round(intensity * 30)) || 15;
      const rad = (angle * Math.PI) / 180;
      const sizeX = Math.max(1, Math.round(Math.abs(Math.cos(rad)) * length));
      const sizeY = Math.max(1, Math.round(Math.abs(Math.sin(rad)) * length));
      return [`avgblur=sizeX=${sizeX}:sizeY=${sizeY}`];
    }

    case "radial_zoom_blur":
    case "radialZoomBlur":
    case "radial-zoom-blur":
      // Simulated with multiple scaled overlays
      return [`unsharp=13:13:${intensity * 3}:13:13:0`];

    case "motion_blur":
    case "motionBlur":
    case "motion-blur":
      return [`tblend=all_mode=average`];

    // ─── SHARPEN EFFECTS ───
    case "sharpen": {
      const amountVal = effect.params?.amount ?? (intensity * 100);
      const amount = (amountVal / 100) * 2.5; // Scale 0 to 2.5
      return [`unsharp=5:5:${amount.toFixed(2)}:5:5:${(amount / 2).toFixed(2)}`];
    }

    case "unsharp-mask":
    case "unsharp_mask":
    case "unsharpMask": {
      const radius = effect.params?.radius ?? 2.0;
      const amountVal = effect.params?.amount ?? (intensity * 100);
      const msize = Math.max(3, Math.min(23, Math.round(radius * 2) | 1)); // Ensure odd integer
      const amount = (amountVal / 100) * 3.0; // Scale 0 to 3.0
      return [`unsharp=${msize}:${msize}:${amount.toFixed(2)}:${msize}:${msize}:${(amount / 2).toFixed(2)}`];
    }

    case "reduce-interlace-flicker":
    case "reduce_interlace_flicker":
    case "reduceInterlaceFlicker": {
      const softness = effect.params?.softness ?? intensity;
      const verticalBlurRadius = Math.max(1, Math.round(softness * 5));
      return [`boxblur=1:${verticalBlurRadius}`];
    }

    // ─── INVERT EFFECTS ───
    case "invert": {
      const blend = effect.params?.blend ?? 0; // 0-100, where 100 is original, 0 is fully inverted
      const channel = (effect.params?.channel as any) ?? "RGB";
      const opacity = ((100 - blend) / 100).toFixed(2);
      
      let negateFilter = "negate";
      if (channel === "Red" || channel === 1) negateFilter = "lutrgb=r=neg";
      else if (channel === "Green" || channel === 2) negateFilter = "lutrgb=g=neg";
      else if (channel === "Blue" || channel === 3) negateFilter = "lutrgb=b=neg";
      else if (channel === "Alpha" || channel === 4) negateFilter = "lutrgb=a=neg";
      else if (channel === "Hue" || channel === 6) negateFilter = "hue=h=180";
      else if (channel === "Lightness" || channel === 7) negateFilter = "lutyuv=y=neg";
      else if (channel === "Saturation" || channel === 8) negateFilter = "hue=s=-1";

      if (blend === 0) {
        return [negateFilter];
      } else {
        return [
          `split[inv_orig][inv_mod]`,
          `[inv_mod]${negateFilter}[inv_negated]`,
          `[inv_orig][inv_negated]blend=all_mode=normal:all_opacity=${opacity}`,
        ];
      }
    }

    // ─── DISTORTION EFFECTS ───
    case "corner_pin":
    case "cornerPin":
    case "corner-pin": {
      const x0 = effect.params?.topLeftX ?? 0;
      const y0 = effect.params?.topLeftY ?? 0;
      const x1 = effect.params?.topRightX ?? 1;
      const y1 = effect.params?.topRightY ?? 0;
      const x2 = effect.params?.bottomLeftX ?? 0;
      const y2 = effect.params?.bottomLeftY ?? 1;
      const x3 = effect.params?.bottomRightX ?? 1;
      const y3 = effect.params?.bottomRightY ?? 1;
      return [`perspective=x0='W*${x0}':y0='H*${y0}':x1='W*${x1}':y1='H*${y1}':x2='W*${x2}':y2='H*${y2}':x3='W*${x3}':y3='H*${y3}':sense=destination`];
    }

    case "lens_distortion":
    case "lensDistortion":
    case "lens-distortion": {
      const curvature = effect.params?.curvature ?? (intensity - 0.5) * 0.5;
      const cx = effect.params?.horizontalDecenter ?? 0.5;
      const cy = effect.params?.verticalDecenter ?? 0.5;
      return [`lenscorrection=cx=${cx}:cy=${cy}:k1=${curvature}:k2=${curvature}`];
    }

    case "magnify": {
      const cx = effect.params?.centerX ?? 0.5;
      const cy = effect.params?.centerY ?? 0.5;
      const mag = effect.params?.magnification ?? (1 + intensity * 2);
      return [`zoompan=z='${mag}':x='iw*${cx}-(iw/zoom/2)':y='ih*${cy}-(ih/zoom/2)':d=1:s=1920x1080`];
    }

    case "mirror": {
      const angle = effect.params?.reflectionAngle ?? 90;
      if (angle === 90 || angle === 270) {
        return [
          `split[mir_orig][mir_flip]`,
          `[mir_flip]crop=iw/2:ih:0:0,hflip[mir_flipped]`,
          `[mir_orig][mir_flipped]overlay=W/2:0`,
        ];
      } else {
        return [
          `split[mir_orig][mir_flip]`,
          `[mir_flip]crop=iw:ih/2:0:0,vflip[mir_flipped]`,
          `[mir_orig][mir_flipped]overlay=0:H/2`,
        ];
      }
    }

    // ─── STYLIZE EFFECTS ───
    case "alpha_glow":
    case "alphaGlow":
    case "alpha-glow": {
      const radius = (effect.params?.glowRadius ?? Math.round(intensity * 30)) || 15;
      const bright = effect.params?.brightness ?? 1.5;
      return [
        `split[glow_orig][glow_blur]`,
        `[glow_blur]boxblur=${radius}:${radius},geq=r='r(X,Y)*${bright}':g='g(X,Y)*${bright}':b='b(X,Y)*${bright}'[glow_colored]`,
        `[glow_orig][glow_colored]blend=all_mode=screen`,
      ];
    }

    case "brush_strokes":
    case "brushStrokes":
    case "brush-strokes": {
      const size = (effect.params?.brushSize ?? Math.round(intensity * 10)) || 5;
      return [`smartblur=lr=${size}:ls=-1:lt=0`];
    }

    case "color_emboss":
    case "colorEmboss":
    case "color-emboss": {
      const relief = (effect.params?.relief ?? Math.round(intensity * 3)) || 2;
      const rStr = `-${relief} -1 0 -1 1 1 0 1 ${relief}`;
      return [`convolution="${rStr}:${rStr}:${rStr}:${rStr}"`];
    }

    case "find_edges":
    case "findEdges":
    case "find-edges": {
      const isInv = effect.params?.invert ?? 0;
      if (isInv === 1) {
        return [`edgedetect=low=0.1:high=0.2,negate`];
      }
      return [`edgedetect=low=0.1:high=0.2`];
    }

    case "mosaic": {
      const hBlocks = (effect.params?.horizontalBlocks ?? Math.max(4, Math.round((1 - intensity) * 100))) || 20;
      const vBlocks = (effect.params?.verticalBlocks ?? Math.max(4, Math.round((1 - intensity) * 100))) || 20;
      return [`scale=${hBlocks}:${vBlocks}:flags=neighbor,scale=1920:1080:flags=neighbor`];
    }

    case "posterize": {
      const levels = (effect.params?.levels ?? Math.max(2, Math.round((1 - intensity) * 32))) || 8;
      const step = Math.round(255 / (levels - 1)) || 1;
      return [`lutrgb=r='round(val/${step})*${step}':g='round(val/${step})*${step}':b='round(val/${step})*${step}'`];
    }

    case "replicate": {
      const count = effect.params?.count ?? 2;
      if (count === 2) {
        return [
          `split=4[rep1][rep2][rep3][rep4]`,
          `[rep1]scale=iw/2:ih/2[tl];[rep2]scale=iw/2:ih/2[tr];[rep3]scale=iw/2:ih/2[bl];[rep4]scale=iw/2:ih/2[br]`,
          `[tl][tr]hstack[top];[bl][br]hstack[bottom];[top][bottom]vstack`,
        ];
      } else {
        return [`scale=iw/${count}:ih/${count},tile=${count}x${count}`];
      }
    }

    case "roughen_edges":
    case "roughenEdges":
    case "roughen-edges": {
      const border = (effect.params?.border ?? Math.round(intensity * 10)) || 5;
      return [`boxblur=${border}:luma_radius=${border},threshold=128`];
    }

    case "strobe_light":
    case "strobeLight":
    case "strobe-light": {
      const period = effect.params?.period ?? 1.0;
      const duration = effect.params?.duration ?? 0.1;
      const strobeType = effect.params?.strobeType ?? 0;
      if (strobeType === 1) {
        return [`geq=lum='if(lt(mod(T,${period}),${duration}),255-lum(X,Y),lum(X,Y))'`];
      }
      return [`geq=lum='if(lt(mod(T,${period}),${duration}),0,lum(X,Y))'`];
    }

    // ─── TIME EFFECTS ───
    case "echo": {
      const decay = effect.params?.decay ?? 0.5; // 0-1
      return [`lagfun=decay=${decay.toFixed(2)}`];
    }

    case "posterize-time":
    case "posterize_time":
    case "posterizeTime": {
      const frameRate = effect.params?.frameRate ?? 24;
      return [`fps=fps=${frameRate}`];
    }

    // ─── COLOR EFFECTS ───
    case "brightness":
      return [`eq=brightness=${(intensity - 0.5) * 0.4}`];

    case "contrast":
      return [`eq=contrast=${0.5 + intensity * 1.5}`];

    case "saturation":
      return [`eq=saturation=${intensity * 3}`];

    case "color_shift":
    case "colorShift":
    case "color-shift":
      return [`hue=h=${Math.round(intensity * 60)}`];

    // ─── GLOW / BLOOM ───
    case "glow": {
      const blurAmount = Math.round(intensity * 30) || 10;
      // Split → blur one copy → screen blend back
      return [
        `split[glow_a][glow_b]`,
        `[glow_b]boxblur=${blurAmount}:${Math.round(blurAmount / 2)}[glow_blurred]`,
        `[glow_a][glow_blurred]blend=all_mode=screen:all_opacity=${intensity * 0.7}`,
      ];
    }

    // ─── DISTORTION ───
    case "shake": {
      const amplitude = Math.max(2, Math.round(intensity * 15));
      // Random crop offset simulates camera shake
      return [
        `crop=iw-${amplitude * 2}:ih-${amplitude * 2}:` +
        `${amplitude}+random(1)*${amplitude}:` +
        `${amplitude}+random(2)*${amplitude}`,
        `scale=1920:1080:flags=lanczos`,
      ];
    }

    case "zoom_pulse":
    case "zoomPulse":
    case "zoom-pulse": {
      const zoomFactor = 1 + intensity * 0.3;
      return [
        `zoompan=z='if(between(on,0,10),${zoomFactor},1)':` +
        `d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `s=1920x1080:fps=30`,
      ];
    }

    // ─── STYLISTIC ───
    case "rgb_split":
    case "rgbSplit":
    case "rgb-split": {
      const shift = Math.max(1, Math.round(intensity * 8));
      return [`rgbashift=rh=${-shift}:bh=${shift}`];
    }

    case "chromatic_aberration":
    case "chromaticAberration":
    case "chromatic-aberration": {
      const shift = Math.max(1, Math.round(intensity * 6));
      return [`rgbashift=rh=${-shift}:rv=${Math.round(shift / 2)}:bh=${shift}:bv=${-Math.round(shift / 2)}`];
    }

    case "glitch": {
      // Combine noise + chromashift + random displacement
      return [
        `noise=alls=${Math.round(intensity * 40)}:allf=t`,
        `rgbashift=rh=${Math.round(intensity * 10)}:bh=${-Math.round(intensity * 10)}`,
      ];
    }

    case "scanlines":
      return [
        `drawgrid=w=0:h=2:t=1:c=black@${intensity * 0.5}`,
      ];

    case "waveform":
      return [`geq=lum='lum(X,Y)+${Math.round(intensity * 20)}*sin(Y/10+N/5)'`];

    // ─── FILM ───
    case "displacement_map":
      return [`noise=alls=${Math.round(intensity * 15)}:allf=t`];

    // ─── SUBJECT EFFECTS (require masks — degrade gracefully) ───
    case "facial_blur":
    case "facialBlur":
    case "facial-blur":
    case "subject_blur":
    case "subject-blur":
    case "background_blur":
    case "background-blur":
      // Without SAM/MediaPipe masks, apply uniform blur as fallback
      return [`boxblur=${Math.round(intensity * 15)}:${Math.round(intensity * 8)}`];

    case "depth_parallax":
    case "depthParallax":
    case "depth-parallax":
      // Simulated parallax via slight zoom + pan
      return [
        `zoompan=z='1+${intensity * 0.1}*sin(on/30)':` +
        `x='iw/2-(iw/zoom/2)+${Math.round(intensity * 20)}*sin(on/25)':` +
        `y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30:d=1`,
      ];

    case "particles":
      // Particles can't be done in pure FFmpeg — skip gracefully
      return [];

    // ─── COMIC / STYLE EFFECTS ───
    case "halftone":
    case "halftone_dot": {
      // Ben-Day dot pattern: threshold + tile to create dot matrix
      const dotSize = Math.max(2, Math.round((1 - intensity) * 8));
      return [
        `format=gray`,
        `threshold=128`,
        `tile=${dotSize}x${dotSize}`,
        `scale=1920:1080:flags=neighbor`,
        `format=yuv420p`,
      ];
    }

    case "ink_edges":
    case "inkEdges":
    case "ink-edges": {
      // Comic-style ink outlines: edge detect + negate for black lines
      const edgeLow = (0.05 + intensity * 0.15).toFixed(2);
      const edgeHigh = (0.1 + intensity * 0.2).toFixed(2);
      return [`edgedetect=low=${edgeLow}:high=${edgeHigh}:mode=colors`];
    }

    case "frame_stutter":
    case "frameStutter":
    case "frame-stutter": {
      // Stepped frame-rate: reduce to 8-12fps for hand-drawn feel
      const stutterFps = Math.max(6, Math.round(8 + intensity * 8));
      return [`fps=fps=${stutterFps}`];
    }

    // ─── VIGNETTE ───
    case "vignette_pro":
    case "vignettePro":
    case "vignette-pro": {
      // Strong radial vignette: angle controls darkness spread
      const angle = (intensity * Math.PI) / 3;
      return [`vignette=${angle.toFixed(2)}`];
    }

    // ─── B&W TOGGLE ───
    case "bw_toggle":
    case "bwToggle":
    case "bw-toggle": {
      // Full desaturation with contrast boost
      return [
        `hue=s=0`,
        `eq=contrast=${(1 + intensity * 0.6).toFixed(2)}:brightness=${(intensity * -0.02).toFixed(3)}`,
      ];
    }

    // ─── FLASH WHITE ───
    case "flash_white":
    case "flashWhite":
    case "flash-white": {
      // White flash overlay: blend white at intensity
      return [
        `split[fw_orig][fw_white]`,
        `[fw_white]color=white:s=1920x1080[fw_blank]`,
        `[fw_orig][fw_blank]blend=all_mode=normal:all_opacity=${intensity.toFixed(2)}[fw_out]`,
      ];
    }

    // ─── MULTI-EXPOSURE ───
    case "multi_exposure":
    case "multiExposure":
    case "multi-exposure": {
      // Double exposure: blend current frame with a shifted copy
      return [
        `split[me_orig][me_copy]`,
        `[me_copy]crop=iw*0.8:ih*0.8:iw*0.1:ih*0.1,scale=1920:1080[me_crop]`,
        `[me_orig][me_crop]blend=all_mode=screen:all_opacity=${(intensity * 0.6).toFixed(2)}`,
      ];
    }

    // ─── DESATURATE ───
    case "desaturate": {
      // Partial desaturation: reduce saturation by intensity amount
      const sat = (1 - intensity).toFixed(2);
      return [`eq=saturation=${sat}`];
    }

    // ─── NOISE GRAIN ───
    case "noise_grain":
    case "noiseGrain":
    case "noise-grain": {
      const amount = Math.max(1, intensity * 40);
      return [`noise=alls=${amount}:allf=t`];
    }

    // ─── WAVE WARP ───
    case "wave_warp":
    case "waveWarp":
    case "wave-warp": {
      const amp = Math.max(1, intensity * 15);
      const freq = effect.params?.frequency ?? 3;
      const speed = effect.params?.speed ?? 2;
      return [`geq=lum='lum(X,Y)+${amp}*sin(Y/${freq}+N/${speed})'`];
    }

    // ─── FISHEYE ───
    case "fisheye":
    case "fisheye_lens":
    case "fisheyeLens": {
      const strength = (intensity - 0.5) * 0.4;
      return [`lenscorrection=cx=0.5:cy=0.5:k1=${strength.toFixed(3)}:k2=${strength.toFixed(3)}`];
    }

    // ─── COLOR BALANCE ───
    case "color_balance":
    case "colorBalance":
    case "color-balance": {
      const warmth = intensity * 0.3;
      return [
        `curves=r='0/0 0.25/${(0.25 + warmth).toFixed(2)} 0.75/${(0.75 - warmth * 0.3).toFixed(2)} 1/1':b='0/0 0.25/${(0.25 - warmth * 0.5).toFixed(2)} 0.75/${(0.75 + warmth * 0.2).toFixed(2)} 1/1'`,
      ];
    }

    // ─── LIGHT LEAK ───
    case "light_leak":
    case "lightLeak":
    case "light-leak": {
      const opacity = Math.min(0.5, intensity * 0.4);
      return [
        `split[ll_orig][ll_tint]`,
        `[ll_tint]colorbalance=rs=${(intensity * 0.4).toFixed(2)}:gs=${(intensity * 0.1).toFixed(2)}:bs=-${(intensity * 0.2).toFixed(2)}[ll_warm]`,
        `[ll_orig][ll_warm]blend=all_mode=screen:all_opacity=${opacity.toFixed(2)}[ll_out]`,
      ];
    }

    // ─── BLOOM ───
    case "bloom": {
      const blurAmt = Math.max(2, intensity * 20);
      const opacity = Math.min(0.6, intensity * 0.5);
      return [
        `split[b_orig][b_blur]`,
        `[b_blur]boxblur=${blurAmt}:${blurAmt / 2},eq=brightness=${(intensity * 0.3).toFixed(2)}[b_bright]`,
        `[b_orig][b_bright]blend=all_mode=screen:all_opacity=${opacity.toFixed(2)}[b_out]`,
      ];
    }

    // ─── VHS TRACKING ───
    case "vhs_tracking":
    case "vhsTracking":
    case "vhs-tracking": {
      const shift = Math.max(1, intensity * 6);
      return [
        `rgbashift=rh=${shift}:bh=-${shift}`,
        `noise=alls=${(intensity * 15).toFixed(0)}:allf=t`,
        `eq=saturation=${(1 + intensity * 0.3).toFixed(2)}:contrast=${(1 + intensity * 0.2).toFixed(2)}`,
      ];
    }

    // ─── OVERLAY ───
    case "overlay": {
      const opacity = Math.min(0.4, intensity * 0.3);
      return [`color=gray@${opacity.toFixed(2)}:s=1920x1080,blend=all_mode=overlay:all_opacity=1`];
    }

    // ─── HALFTONE BENDAY ───
    case "halftone_benday":
    case "halftoneBenday":
    case "halftone-benday": {
      const dotSize = Math.max(2, Math.round(intensity * 6));
      return [
        `format=gray`,
        `threshold=128`,
        `tile=${dotSize}x${dotSize}`,
        `scale=1920:1080:flags=neighbor`,
        `format=yuv420p`,
      ];
    }

    // ─── COMIC INK EDGES ───
    case "comic_ink_edges":
    case "comicInkEdges":
    case "comic-ink-edges": {
      const thresh = 0.1 + intensity * 0.2;
      return [`edgedetect=low=${thresh.toFixed(2)}:high=${(thresh + 0.1).toFixed(2)}:mode=colors,negate`];
    }

    // ─── FRAME STUTTER ANIME ───
    case "frame_stutter_anime":
    case "frameStutterAnime":
    case "frame-stutter-anime": {
      const stutterFps = Math.max(6, Math.round(8 + intensity * 8));
      return [`fps=fps=${stutterFps}`];
    }

    // ─── LENS FLARE ───
    case "lens_flare":
    case "lensFlare":
    case "lens-flare": {
      const size = Math.max(10, intensity * 80);
      const opacity = Math.min(0.5, intensity * 0.4);
      return [
        `split[lf_orig][lf_tint]`,
        `[lf_tint]colorbalance=rs=${(intensity * 0.3).toFixed(2)}:gs=${(intensity * 0.15).toFixed(2)}[lf_warm]`,
        `[lf_orig][lf_warm]blend=all_mode=screen:all_opacity=${opacity.toFixed(2)}[lf_out]`,
      ];
    }

    default: {
      const spec = EffectSpecMap[effect.type as string];
      if (spec?.ffmpeg) {
        const params: Record<string, number> = {
          intensity: effect.intensity ?? 0.5,
          ...(effect.params as Record<string, number> ?? {}),
        };
        for (const [key, def] of Object.entries(spec.params)) {
          if (params[key] === undefined) {
            params[key] = def.default;
          }
        }
        return spec.ffmpeg(params);
      }
      console.warn(`[editly-effects] Unknown effect type: ${effect.type}`);
      return [];
    }
  }
}

/**
 * Build the complete FFmpeg filter chain for a shot's effects.
 * Handles compound effects (glow uses split+blend) correctly.
 */
export function buildShotFilterChain(shot: Shot): string | undefined {
  if (!shot.effects || shot.effects.length === 0) return undefined;

  const allFilters: string[] = [];
  let hasCompoundFilter = false;

  for (const effect of shot.effects) {
    const filters = effectToFFmpegFilters(effect);
    if (filters.length === 0) continue;

    // Check if any filter uses split/blend (compound)
    if (filters.some(f => f.includes("split["))) {
      hasCompoundFilter = true;
    }
    allFilters.push(...filters);
  }

  if (allFilters.length === 0) return undefined;

  // For compound filters (glow), join with semicolons
  // For simple filters, join with commas
  if (hasCompoundFilter) {
    return allFilters.join(";");
  }
  return allFilters.join(",");
}

/**
 * Build speed filter for a shot.
 * Returns the setpts expression for speed changes.
 */
export function buildSpeedFilter(shot: Shot): string | undefined {
  const speed = shot.timing.speed;
  if (!speed || speed === 1.0) return undefined;

  // setpts: PTS * (1/speed) — speed 2.0 = PTS*0.5, speed 0.5 = PTS*2.0
  const ptsFactor = (1 / speed).toFixed(4);
  return `setpts=${ptsFactor}*PTS`;
}

/**
 * Build speed ramp filter for a shot.
 * Transitions from startSpeed to endSpeed over the shot duration.
 */
export function buildSpeedRampFilter(shot: Shot): string | undefined {
  if (!shot.timing.speedRamp) return undefined;

  const { startSpeed, endSpeed } = shot.timing.speedRamp;
  const duration = shot.timing.duration;

  // Linear interpolation of PTS factor over time
  const startFactor = (1 / startSpeed).toFixed(4);
  const endFactor = (1 / endSpeed).toFixed(4);

  return `setpts='lerp(${startFactor},${endFactor},T/${duration.toFixed(2)})*PTS'`;
}
