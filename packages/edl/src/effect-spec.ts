export type EffectParamDef = {
  type: string;
  default: number;
  min: number;
  max: number;
};

export type EffectSpec = {
  name: string;
  params: Record<string, EffectParamDef>;
  canvas2d?: (ctx: CanvasRenderingContext2D, params: Record<string, number>, width: number, height: number) => void;
  ffmpeg?: (params: Record<string, number>) => string[];
};

export const EffectSpecMap: Record<string, EffectSpec> = {
  blur: {
    name: "Blur",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    canvas2d: (ctx, _params, _w, _h) => {
      ctx.filter = `blur(${Math.round((_params.intensity ?? 0.5) * 10)}px)`;
    },
    ffmpeg: (params) => [`boxblur=${Math.round((params.intensity ?? 0.5) * 20)}:${Math.round((params.intensity ?? 0.5) * 10)}`],
  },
  brightness: {
    name: "Brightness",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`eq=brightness=${((params.intensity ?? 0.5) - 0.5) * 0.4}`],
  },
  contrast: {
    name: "Contrast",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`eq=contrast=${0.5 + (params.intensity ?? 0.5) * 1.5}`],
  },
  saturation: {
    name: "Saturation",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`eq=saturation=${(params.intensity ?? 0.5) * 3}`],
  },
  glow: {
    name: "Glow",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const blurAmount = Math.round((params.intensity ?? 0.3) * 30) || 10;
      return [
        `split[glow_a][glow_b]`,
        `[glow_b]boxblur=${blurAmount}:${Math.round(blurAmount / 2)}[glow_blurred]`,
        `[glow_a][glow_blurred]blend=all_mode=screen:all_opacity=${(params.intensity ?? 0.3) * 0.7}`,
      ];
    },
  },
  shake: {
    name: "Camera Shake",
    params: {
      intensity: { type: "number", default: 0.35, min: 0, max: 1 },
    },
    canvas2d: (ctx, params) => {
      const maxShake = (params.intensity ?? 0.35) * 20;
      const offsetX = Math.sin(Date.now() * 0.01) * maxShake;
      const offsetY = Math.cos(Date.now() * 0.013) * maxShake;
      ctx.translate(offsetX, offsetY);
    },
    ffmpeg: (params) => {
      const amplitude = Math.max(2, Math.round((params.intensity ?? 0.35) * 15));
      return [
        `crop=iw-${amplitude * 2}:ih-${amplitude * 2}:${amplitude}+random(1)*${amplitude}:${amplitude}+random(2)*${amplitude}`,
        `scale=1920:1080:flags=lanczos`,
      ];
    },
  },
  zoom_pulse: {
    name: "Zoom Pulse",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const zoomFactor = 1 + (params.intensity ?? 0.3) * 0.3;
      return [
        `zoompan=z='if(between(on,0,10),${zoomFactor},1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`,
      ];
    },
  },
  invert: {
    name: "Invert",
    params: {
      intensity: { type: "number", default: 1, min: 0, max: 1 },
    },
    canvas2d: (ctx, params) => {
      ctx.filter = `invert(${(params.intensity ?? 1).toFixed(2)})`;
    },
    ffmpeg: (params) => {
      const amount = params.intensity ?? 1;
      if (amount >= 1) return [`negate`];
      const opacity = amount.toFixed(2);
      return [
        `split[inv_orig][inv_mod]`,
        `[inv_mod]negate[inv_negated]`,
        `[inv_orig][inv_negated]blend=all_mode=normal:all_opacity=${opacity}`,
      ];
    },
  },
  sharpen: {
    name: "Sharpen",
    params: {
      amount: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    canvas2d: (ctx, params) => {
      const intensity = params.amount ?? 0.5;
      const contrast = 1 + intensity * 0.4;
      const brightness = 1 - intensity * 0.05;
      ctx.filter = `contrast(${contrast}) brightness(${brightness})`;
    },
    ffmpeg: (params) => {
      const amount = ((params.amount ?? 0.5) * 100 / 100) * 2.5;
      return [`unsharp=5:5:${amount.toFixed(2)}:5:5:${(amount / 2).toFixed(2)}`];
    },
  },
  echo: {
    name: "Echo",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
      decay: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`lagfun=decay=${(params.decay ?? 0.5).toFixed(2)}`],
  },
  rgb_split: {
    name: "RGB Split",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const shift = Math.max(1, Math.round((params.intensity ?? 0.5) * 8));
      return [`rgbashift=rh=${-shift}:bh=${shift}`];
    },
  },
  chromatic_aberration: {
    name: "Chromatic Aberration",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const shift = Math.max(1, Math.round((params.intensity ?? 0.5) * 6));
      return [`rgbashift=rh=${-shift}:rv=${Math.round(shift / 2)}:bh=${shift}:bv=${-Math.round(shift / 2)}`];
    },
  },
  glitch: {
    name: "Glitch",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [
      `noise=alls=${Math.round((params.intensity ?? 0.5) * 40)}:allf=t`,
      `rgbashift=rh=${Math.round((params.intensity ?? 0.5) * 10)}:bh=${-Math.round((params.intensity ?? 0.5) * 10)}`,
    ],
  },
  scanlines: {
    name: "Scanlines",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`drawgrid=w=0:h=2:t=1:c=black@${(params.intensity ?? 0.3) * 0.5}`],
  },
  wave_warp: {
    name: "Wave Warp",
    params: {
      intensity: { type: "number", default: 0.4, min: 0, max: 1 },
      speed: { type: "number", default: 2, min: 0, max: 10 },
      frequency: { type: "number", default: 3, min: 1, max: 10 },
    },
    ffmpeg: (params) => {
      const amp = Math.max(1, (params.intensity ?? 0.4) * 15);
      const freq = params.frequency ?? 3;
      const speed = params.speed ?? 2;
      return [`geq=lum='lum(X,Y)+${amp}*sin(Y/${freq}+N/${speed})'`];
    },
  },
  fisheye: {
    name: "Fisheye",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const strength = ((params.intensity ?? 0.5) - 0.5) * 0.4;
      return [`lenscorrection=cx=0.5:cy=0.5:k1=${strength.toFixed(3)}:k2=${strength.toFixed(3)}`];
    },
  },
  color_balance: {
    name: "Color Balance",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
      shadows: { type: "number", default: 0, min: -1, max: 1 },
      highlights: { type: "number", default: 0, min: -1, max: 1 },
    },
    ffmpeg: (params) => {
      const warmth = (params.intensity ?? 0.5) * 0.3;
      return [
        `curves=r='0/0 0.25/${(0.25 + warmth).toFixed(2)} 0.75/${(0.75 - warmth * 0.3).toFixed(2)} 1/1':b='0/0 0.25/${(0.25 - warmth * 0.5).toFixed(2)} 0.75/${(0.75 + warmth * 0.2).toFixed(2)} 1/1'`,
      ];
    },
  },
  noise_grain: {
    name: "Noise Grain",
    params: {
      intensity: { type: "number", default: 0.15, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`noise=alls=${Math.max(1, (params.intensity ?? 0.15) * 40)}:allf=t`],
  },
  light_leak: {
    name: "Light Leak",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const opacity = Math.min(0.5, (params.intensity ?? 0.3) * 0.4);
      return [
        `split[ll_orig][ll_tint]`,
        `[ll_tint]colorbalance=rs=${((params.intensity ?? 0.3) * 0.4).toFixed(2)}:gs=${((params.intensity ?? 0.3) * 0.1).toFixed(2)}:bs=-${((params.intensity ?? 0.3) * 0.2).toFixed(2)}[ll_warm]`,
        `[ll_orig][ll_warm]blend=all_mode=screen:all_opacity=${opacity.toFixed(2)}[ll_out]`,
      ];
    },
  },
  bloom: {
    name: "Bloom",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
      targetHighlights: { type: "number", default: 0, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const blurAmt = Math.max(2, (params.intensity ?? 0.3) * 20);
      const opacity = Math.min(0.6, (params.intensity ?? 0.3) * 0.5);
      return [
        `split[b_orig][b_blur]`,
        `[b_blur]boxblur=${blurAmt}:${blurAmt / 2},eq=brightness=${((params.intensity ?? 0.3) * 0.3).toFixed(2)}[b_bright]`,
        `[b_orig][b_bright]blend=all_mode=screen:all_opacity=${opacity.toFixed(2)}[b_out]`,
      ];
    },
  },
  context_shake: {
    name: "Context Shake",
    params: {
      intensity: { type: "number", default: 0.35, min: 0, max: 1 },
      decay: { type: "number", default: 0.65, min: 0, max: 1 },
    },
    canvas2d: (ctx, params) => {
      const maxShake = (params.intensity ?? 0.35) * 20;
      const offsetX = Math.sin(Date.now() * 0.01) * maxShake;
      const offsetY = Math.cos(Date.now() * 0.013) * maxShake;
      ctx.translate(offsetX, offsetY);
    },
    ffmpeg: (params) => {
      const amplitude = Math.max(2, Math.round((params.intensity ?? 0.35) * 15));
      return [
        `crop=iw-${amplitude * 2}:ih-${amplitude * 2}:${amplitude}+random(1)*${amplitude}:${amplitude}+random(2)*${amplitude}`,
        `scale=1920:1080:flags=lanczos`,
      ];
    },
  },
  whip_pan: {
    name: "Whip Pan",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, width, _height) => {
      const offset = Math.sin(Date.now() * 0.001 * 10) * (params.intensity ?? 0.5) * width * 0.3;
      ctx.translate(offset, 0);
      ctx.filter = `blur(${(params.intensity ?? 0.5) * 10}px)`;
    },
    ffmpeg: (params) => {
      const blurAmount = Math.round((params.intensity ?? 0.5) * 10);
      return [`boxblur=${blurAmount}:${blurAmount}`];
    },
  },
  flash_white: {
    name: "Flash White",
    params: {
      intensity: { type: "number", default: 0.8, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, w, h) => {
      ctx.save();
      ctx.globalAlpha = params.intensity ?? 0.8;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    ffmpeg: (params) => {
      const opacity = (params.intensity ?? 0.8).toFixed(2);
      return [
        `split[fw_orig][fw_white]`,
        `[fw_white]color=white:s=1920x1080[fw_blank]`,
        `[fw_orig][fw_blank]blend=all_mode=normal:all_opacity=${opacity}[fw_out]`,
      ];
    },
  },
  overlay: {
    name: "Overlay",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, w, h) => {
      ctx.save();
      ctx.globalAlpha = (params.intensity ?? 0.3) * 0.3;
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(128, 128, 128, 0.5)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    ffmpeg: (params) => {
      const opacity = Math.min(0.4, (params.intensity ?? 0.3) * 0.3);
      return [`color=gray@${opacity.toFixed(2)}:s=1920x1080,blend=all_mode=overlay:all_opacity=1`];
    },
  },
  color_grade: {
    name: "Color Grade",
    params: {
      saturation: { type: "number", default: 1, min: 0, max: 2 },
      brightness: { type: "number", default: 1, min: 0, max: 2 },
      contrast: { type: "number", default: 1, min: 0, max: 2 },
    },
    canvas2d: (ctx, params) => {
      const sat = params.saturation ?? 1;
      const bright = params.brightness ?? 1;
      const cont = params.contrast ?? 1;
      ctx.filter = `saturate(${sat}) brightness(${bright}) contrast(${cont})`;
    },
    ffmpeg: (params) => {
      const sat = params.saturation ?? 1;
      const bright = params.brightness ?? 1;
      const cont = params.contrast ?? 1;
      return [`eq=saturation=${sat}:brightness=${bright - 1}:contrast=${cont}`];
    },
  },
  mosaic: {
    name: "Mosaic",
    params: {
      horizontalBlocks: { type: "number", default: 20, min: 2, max: 100 },
      verticalBlocks: { type: "number", default: 20, min: 2, max: 100 },
    },
    canvas2d: (ctx, _params, w, h) => {
      const hBlk = _params.horizontalBlocks ?? 20;
      const vBlk = _params.verticalBlocks ?? 20;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, hBlk, vBlk);
      ctx.drawImage(ctx.canvas, 0, 0, hBlk, vBlk, 0, 0, w, h);
      ctx.restore();
    },
    ffmpeg: (params) => {
      const hBlocks = params.horizontalBlocks ?? 20;
      const vBlocks = params.verticalBlocks ?? 20;
      return [`scale=${hBlocks}:${vBlocks}:flags=neighbor,scale=1920:1080:flags=neighbor`];
    },
  },
  find_edges: {
    name: "Find Edges",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    canvas2d: (ctx) => {
      ctx.filter = "contrast(300%) grayscale(100%) invert(100%)";
    },
    ffmpeg: (params) => [`edgedetect=low=0.1:high=0.2`],
  },
  posterize: {
    name: "Posterize",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
      levels: { type: "number", default: 8, min: 2, max: 32 },
    },
    canvas2d: (ctx) => {
      ctx.filter = "contrast(200%) saturate(150%)";
    },
    ffmpeg: (params) => {
      const levels = params.levels ?? 8;
      const step = Math.round(255 / (levels - 1)) || 1;
      return [`lutrgb=r='round(val/${step})*${step}':g='round(val/${step})*${step}':b='round(val/${step})*${step}'`];
    },
  },
  strobe_light: {
    name: "Strobe Light",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
      period: { type: "number", default: 1.0, min: 0.1, max: 5 },
      duration: { type: "number", default: 0.1, min: 0.01, max: 1 },
      strobeType: { type: "number", default: 0, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, w, h) => {
      const period = params.period ?? 1.0;
      const dur = params.duration ?? 0.1;
      if (Date.now() % (period * 1000) < dur * 1000) {
        if ((params.strobeType ?? 0) === 1) {
          ctx.filter = "invert(100%)";
        } else {
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, w, h);
        }
      }
    },
    ffmpeg: (params) => {
      const period = params.period ?? 1.0;
      const dur = params.duration ?? 0.1;
      const strobeType = params.strobeType ?? 0;
      if (strobeType === 1) {
        return [`geq=lum='if(lt(mod(T,${period}),${dur}),255-lum(X,Y),lum(X,Y))'`];
      }
      return [`geq=lum='if(lt(mod(T,${period}),${dur}),0,lum(X,Y))'`];
    },
  },
  mirror: {
    name: "Mirror",
    params: {
      reflectionAngle: { type: "number", default: 90, min: 0, max: 360 },
    },
    canvas2d: (ctx, params, w, h) => {
      const angle = params.reflectionAngle ?? 90;
      ctx.save();
      if (angle === 90 || angle === 270) {
        ctx.drawImage(ctx.canvas, 0, 0, w / 2, h, 0, 0, w / 2, h);
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(ctx.canvas, 0, 0, w / 2, h, w / 2, 0, w / 2, h);
      } else {
        ctx.drawImage(ctx.canvas, 0, 0, w, h / 2, 0, 0, w, h / 2);
        ctx.translate(0, h);
        ctx.scale(1, -1);
        ctx.drawImage(ctx.canvas, 0, 0, w, h / 2, 0, h / 2, w, h / 2);
      }
      ctx.restore();
    },
    ffmpeg: (params) => {
      const angle = params.reflectionAngle ?? 90;
      if (angle === 90 || angle === 270) {
        return [
          `split[mir_orig][mir_flip]`,
          `[mir_flip]crop=iw/2:ih:0:0,hflip[mir_flipped]`,
          `[mir_orig][mir_flipped]overlay=W/2:0`,
        ];
      }
      return [
        `split[mir_orig][mir_flip]`,
        `[mir_flip]crop=iw:ih/2:0:0,vflip[mir_flipped]`,
        `[mir_orig][mir_flipped]overlay=0:H/2`,
      ];
    },
  },
  magnify: {
    name: "Magnify",
    params: {
      centerX: { type: "number", default: 0.5, min: 0, max: 1 },
      centerY: { type: "number", default: 0.5, min: 0, max: 1 },
      magnification: { type: "number", default: 1.5, min: 1, max: 5 },
      size: { type: "number", default: 0.2, min: 0.05, max: 0.5 },
    },
    canvas2d: (ctx, params, w, h) => {
      const cx = params.centerX ?? 0.5;
      const cy = params.centerY ?? 0.5;
      const mag = params.magnification ?? 1.5;
      const sz = (params.size ?? 0.2) * w;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx * w, cy * h, sz, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        ctx.canvas,
        cx * w - sz / mag,
        cy * h - sz / mag,
        (sz * 2) / mag,
        (sz * 2) / mag,
        cx * w - sz,
        cy * h - sz,
        sz * 2,
        sz * 2,
      );
      ctx.restore();
    },
    ffmpeg: (params) => {
      const cx = params.centerX ?? 0.5;
      const cy = params.centerY ?? 0.5;
      const mag = params.magnification ?? 1.5;
      return [`zoompan=z='${mag}':x='iw*${cx}-(iw/zoom/2)':y='ih*${cy}-(ih/zoom/2)':d=1:s=1920x1080`];
    },
  },
  directional_blur: {
    name: "Directional Blur",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
      direction: { type: "number", default: 90, min: 0, max: 360 },
      blurLength: { type: "number", default: 20, min: 1, max: 50 },
    },
    ffmpeg: (params) => {
      const angle = params.direction ?? 90;
      const length = params.blurLength ?? Math.round((params.intensity ?? 0.5) * 30);
      const rad = (angle * Math.PI) / 180;
      const sizeX = Math.max(1, Math.round(Math.abs(Math.cos(rad)) * length));
      const sizeY = Math.max(1, Math.round(Math.abs(Math.sin(rad)) * length));
      return [`avgblur=sizeX=${sizeX}:sizeY=${sizeY}`];
    },
  },
  radial_zoom_blur: {
    name: "Radial Zoom Blur",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`unsharp=13:13:${(params.intensity ?? 0.5) * 3}:13:13:0`],
  },
  motion_blur: {
    name: "Motion Blur",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (_params) => [`tblend=all_mode=average`],
  },
  chromatic_glitch: {
    name: "Chromatic Glitch",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, w, h) => {
      const offset = (params.intensity ?? 0.5) * 10;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
      ctx.drawImage(ctx.canvas, -offset, 0, w, h);
      ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
      ctx.drawImage(ctx.canvas, 0, 0, w, h);
      ctx.fillStyle = "rgba(0, 0, 255, 0.3)";
      ctx.drawImage(ctx.canvas, offset, 0, w, h);
      ctx.restore();
    },
    ffmpeg: (params) => [
      `noise=alls=${Math.round((params.intensity ?? 0.5) * 30)}:allf=t`,
      `rgbashift=rh=${Math.round((params.intensity ?? 0.5) * 5)}:bh=${-Math.round((params.intensity ?? 0.5) * 5)}`,
    ],
  },
  comic_ink_edges: {
    name: "Comic Ink Edges",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const thresh = 0.1 + (params.intensity ?? 0.5) * 0.2;
      return [`edgedetect=low=${thresh.toFixed(2)}:high=${(thresh + 0.1).toFixed(2)}:mode=colors,negate`];
    },
  },
  frame_stutter_anime: {
    name: "Frame Stutter Anime",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const stutterFps = Math.max(6, Math.round(8 + (params.intensity ?? 0.3) * 8));
      return [`fps=fps=${stutterFps}`];
    },
  },
  lens_flare: {
    name: "Lens Flare",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, w, h) => {
      const flareX = w * 0.3;
      const flareY = h * 0.3;
      const flareSize = (params.intensity ?? 0.5) * 100;
      const gradient = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, flareSize);
      gradient.addColorStop(0, `rgba(255, 255, 200, ${params.intensity ?? 0.5})`);
      gradient.addColorStop(0.3, `rgba(255, 200, 100, ${(params.intensity ?? 0.5) * 0.5})`);
      gradient.addColorStop(1, "rgba(255, 150, 50, 0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
    ffmpeg: (params) => {
      const opacity = Math.min(0.5, (params.intensity ?? 0.5) * 0.4);
      return [
        `split[lf_orig][lf_tint]`,
        `[lf_tint]colorbalance=rs=${((params.intensity ?? 0.5) * 0.3).toFixed(2)}:gs=${((params.intensity ?? 0.5) * 0.15).toFixed(2)}[lf_warm]`,
        `[lf_orig][lf_warm]blend=all_mode=screen:all_opacity=${opacity.toFixed(2)}[lf_out]`,
      ];
    },
  },
  particle_system: {
    name: "Particle System",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    canvas2d: (ctx, params, w, h) => {
      const particleCount = Math.floor((params.intensity ?? 0.3) * 50);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${(params.intensity ?? 0.3) * 0.5})`;
      for (let i = 0; i < particleCount; i++) {
        const x = (Math.sin(Date.now() * 0.0005 + i * 0.1) * 0.5 + 0.5) * w;
        const y = (Math.cos(Date.now() * 0.0003 + i * 0.2) * 0.5 + 0.5) * h;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    ffmpeg: (_params) => [],
  },
  vhs_tracking: {
    name: "VHS Tracking",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const shift = Math.max(1, (params.intensity ?? 0.3) * 6);
      return [
        `rgbashift=rh=${shift}:bh=-${shift}`,
        `noise=alls=${((params.intensity ?? 0.3) * 15).toFixed(0)}:allf=t`,
        `eq=saturation=${(1 + (params.intensity ?? 0.3) * 0.3).toFixed(2)}:contrast=${(1 + (params.intensity ?? 0.3) * 0.2).toFixed(2)}`,
      ];
    },
  },
  halftone_benday: {
    name: "Halftone Benday",
    params: {
      intensity: { type: "number", default: 0.4, min: 0, max: 1 },
    },
    ffmpeg: (params) => {
      const dotSize = Math.max(2, Math.round((params.intensity ?? 0.4) * 6));
      return [
        `format=gray`,
        `threshold=128`,
        `tile=${dotSize}x${dotSize}`,
        `scale=1920:1080:flags=neighbor`,
        `format=yuv420p`,
      ];
    },
  },
  posterize_time: {
    name: "Posterize Time",
    params: {
      frameRate: { type: "number", default: 24, min: 1, max: 60 },
    },
    ffmpeg: (params) => [`fps=fps=${params.frameRate ?? 24}`],
  },
  desaturate: {
    name: "Desaturate",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`eq=saturation=${(1 - (params.intensity ?? 0.5)).toFixed(2)}`],
  },
  vignette_pro: {
    name: "Vignette Pro",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`vignette=${((params.intensity ?? 0.5) * Math.PI / 3).toFixed(2)}`],
  },
  bw_toggle: {
    name: "B&W Toggle",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [
      `hue=s=0`,
      `eq=contrast=${(1 + (params.intensity ?? 0.5) * 0.6).toFixed(2)}:brightness=${((params.intensity ?? 0.5) * -0.02).toFixed(3)}`,
    ],
  },
  multi_exposure: {
    name: "Multi Exposure",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [
      `split[me_orig][me_copy]`,
      `[me_copy]crop=iw*0.8:ih*0.8:iw*0.1:ih*0.1,scale=1920:1080[me_crop]`,
      `[me_orig][me_crop]blend=all_mode=screen:all_opacity=${((params.intensity ?? 0.5) * 0.6).toFixed(2)}`,
    ],
  },
  displacement_map: {
    name: "Displacement Map",
    params: {
      intensity: { type: "number", default: 0.3, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`noise=alls=${Math.round((params.intensity ?? 0.3) * 15)}:allf=t`],
  },
  waveform: {
    name: "Waveform",
    params: {
      intensity: { type: "number", default: 0.5, min: 0, max: 1 },
    },
    ffmpeg: (params) => [`geq=lum='lum(X,Y)+${Math.round((params.intensity ?? 0.5) * 20)}*sin(Y/10+N/5)'`],
  },
};

export type EffectSpecKey = keyof typeof EffectSpecMap;
