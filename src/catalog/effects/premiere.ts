import { EffectItem } from "../types";

export const Premiere4ColorGradient: EffectItem = {
  id: "4-color-gradient",
  type: "generate",
  aiRationale: "Creates a gradient with four colors."
};

export const PremiereLensFlare: EffectItem = {
  id: "lens-flare",
  type: "generate",
  aiRationale: "Simulates what happens when bright light hits a camera lens."
};

export const PremiereLightning: EffectItem = {
  id: "lightning",
  type: "generate",
  aiRationale: "Creates animated lightning bolts or other electric visuals."
};

export const PremiereRamp: EffectItem = {
  id: "ramp",
  type: "generate",
  aiRationale: "Creates a color gradient, either linear or radial."
};

export const PremiereBlackWhite: EffectItem = {
  id: "black-white",
  type: "image-control",
  aiRationale: "Turns your clip to grayscale."
};

export const PremiereColorPass: EffectItem = {
  id: "color-pass",
  type: "image-control",
  aiRationale: "Turns a video into grayscale except for one chosen color."
};

export const PremiereColorReplace: EffectItem = {
  id: "color-replace",
  type: "image-control",
  aiRationale: "Replaces a selected color with a new color."
};

export const PremiereGammaCorrection: EffectItem = {
  id: "gamma-correction",
  type: "image-control",
  aiRationale: "Changes a clip's brightness by adjusting the mid tones."
};

export const PremiereAlphaAdjust: EffectItem = {
  id: "alpha-adjust",
  type: "keying",
  aiRationale: "Adjusts the Opacity percentage to create levels of transparency."
};

export const PremiereColorKey: EffectItem = {
  id: "color-key",
  type: "keying",
  aiRationale: "Keys out all image pixels like a specified key color."
};

export const PremiereLumaKey: EffectItem = {
  id: "luma-key",
  type: "keying",
  aiRationale: "Removes all areas of a layer based on specific luminance or brightness levels."
};

export const PremiereTrackMatteKey: EffectItem = {
  id: "track-matte-key",
  type: "keying",
  aiRationale: "Reveals one clip through another using a third file as a matte."
};

export const PremiereUltraKey: EffectItem = {
  id: "ultra-key",
  type: "keying",
  aiRationale: "Removes a green or blue screen from your footage."
};

export const PremiereNoise: EffectItem = {
  id: "noise",
  type: "noise-grain",
  aiRationale: "Adds random pixels to your footage, creating a grainy, static-like texture."
};

export const PremiereDropShadow: EffectItem = {
  id: "drop-shadow",
  type: "perspective",
  aiRationale: "Adds a shadow that appears behind the clip."
};

export const PremiereAlphaGlow: EffectItem = {
  id: "alpha-glow",
  type: "stylize",
  aiRationale: "Applies color along the edges of a masked alpha channel."
};

export const PremiereBrushStrokes: EffectItem = {
  id: "brush-strokes",
  type: "stylize",
  aiRationale: "Applies a rough, painted look to an image."
};

export const PremiereColorEmboss: EffectItem = {
  id: "color-emboss",
  type: "stylize",
  aiRationale: "Works like the Emboss effect, without suppressing the image’s original colors."
};

export const PremiereFindEdges: EffectItem = {
  id: "find-edges",
  type: "stylize",
  aiRationale: "Identifies the areas of the image that have significant transitions and emphasizes the edges."
};

export const PremiereMosaic: EffectItem = {
  id: "mosaic",
  type: "stylize",
  aiRationale: "Fills a clip with solid-color rectangles, pixelating the original image."
};

export const PremierePosterize: EffectItem = {
  id: "posterize",
  type: "stylize",
  aiRationale: "Specifies the number of tonal levels for each channel in an image."
};

export const PremiereReplicate: EffectItem = {
  id: "replicate",
  type: "stylize",
  aiRationale: "Divides the screen into tiles and displays the whole image in each tile."
};

export const PremiereRoughenEdges: EffectItem = {
  id: "roughen-edges",
  type: "stylize",
  aiRationale: "Roughs up the edges of a clip’s alpha channel."
};

export const PremiereStrobeLight: EffectItem = {
  id: "strobe-light",
  type: "stylize",
  aiRationale: "Performs an arithmetic operation on a clip or makes the clip transparent at periodic or random intervals."
};

export const PremiereAutoReframe: EffectItem = {
  id: "auto-reframe",
  type: "transform",
  aiRationale: "Auto-reframes your video clips to match the aspect ratio of different platforms."
};

export const PremiereCrop: EffectItem = {
  id: "crop",
  type: "transform",
  aiRationale: "Trims pixels from the edges of a clip."
};

export const PremiereEdgeFeather: EffectItem = {
  id: "edge-feather",
  type: "transform",
  aiRationale: "Adds a soft black border around your video, giving it a subtle vignette look."
};

export const PremiereHorizontalFlip: EffectItem = {
  id: "horizontal-flip",
  type: "transform",
  aiRationale: "Reverses each frame in a clip from left to right."
};

export const PremiereTransform: EffectItem = {
  id: "transform",
  type: "transform",
  aiRationale: "Adjusts a clip’s position, size, rotation, and opacity."
};

export const PremiereVerticalFlip: EffectItem = {
  id: "vertical-flip",
  type: "transform",
  aiRationale: "Turns your clip upside down."
};

export const PremiereMetadataTimecodeBurnin: EffectItem = {
  id: "metadata-timecode-burn-in",
  type: "utility",
  aiRationale: "Displays or burns in proper clip metadata on export."
};

export const PremiereSDRConform: EffectItem = {
  id: "sdr-conform",
  type: "utility",
  aiRationale: "Converts HDR footage into SDR and modulates brightness and color."
};

export const PremiereSimpleText: EffectItem = {
  id: "simple-text",
  type: "utility",
  aiRationale: "Quickly adds plain, customizable text to your footage."
};

export const PremiereExtract: EffectItem = {
  id: "extract",
  type: "adjust",
  aiRationale: "Adjust extract effect."
};

export const PremiereLevels: EffectItem = {
  id: "levels",
  type: "adjust",
  aiRationale: "Adjust levels effect."
};

export const PremiereLightingEffects: EffectItem = {
  id: "lighting-effects",
  type: "adjust",
  aiRationale: "Lighting effects."
};

export const PremiereProcAmp: EffectItem = {
  id: "procamp",
  type: "adjust",
  aiRationale: "ProcAmp adjustments."
};

export const PremiereBokehBlur: EffectItem = {
  id: "bokeh-blur",
  type: "blur-sharpen",
  aiRationale: "Bokeh Blur FX."
};

export const PremiereCompoundBlur: EffectItem = {
  id: "compound-blur",
  type: "blur-sharpen",
  aiRationale: "Compound Blur FX."
};

export const PremiereDirectionalBlur: EffectItem = {
  id: "directional-blur",
  type: "blur-sharpen",
  aiRationale: "Directional Blur FX."
};

export const PremiereFocusBlur: EffectItem = {
  id: "focus-blur",
  type: "blur-sharpen",
  aiRationale: "Focus Blur FX."
};

export const PremiereGaussianBlur: EffectItem = {
  id: "gaussian-blur",
  type: "blur-sharpen",
  aiRationale: "Gaussian Blur FX."
};

export const PremiereReduceInterlaceFlicker: EffectItem = {
  id: "reduce-interlace-flicker",
  type: "blur-sharpen",
  aiRationale: "Reduces interlace flicker."
};

export const PremiereSharpen: EffectItem = {
  id: "sharpen",
  type: "blur-sharpen",
  aiRationale: "Sharpens the image."
};

export const PremiereUnsharpMask: EffectItem = {
  id: "unsharp-mask",
  type: "blur-sharpen",
  aiRationale: "Applies an unsharp mask."
};

export const PremiereASCCDL: EffectItem = {
  id: "asc-cdl",
  type: "color-correction",
  aiRationale: "ASC CDL color correction."
};

export const PremiereBrightnessContrast: EffectItem = {
  id: "brightness-contrast",
  type: "color-correction",
  aiRationale: "Adjusts brightness and contrast."
};

export const PremiereLumetriColor: EffectItem = {
  id: "lumetri-color",
  type: "color-correction",
  aiRationale: "Lumetri Color correction."
};

export const PremiereTint: EffectItem = {
  id: "tint",
  type: "color-correction",
  aiRationale: "Tints the image."
};

export const PremiereVideoLimiter: EffectItem = {
  id: "video-limiter",
  type: "color-correction",
  aiRationale: "Limits video levels."
};

export const PremiereVignette: EffectItem = {
  id: "vignette",
  type: "color-correction",
  aiRationale: "Adds a vignette."
};

export const PremiereCornerPin: EffectItem = {
  id: "corner-pin",
  type: "distort",
  aiRationale: "Distorts image using corner pins."
};

export const PremiereLensDistortion: EffectItem = {
  id: "lens-distortion",
  type: "distort",
  aiRationale: "Simulates lens distortion."
};

export const PremiereMirror: EffectItem = {
  id: "mirror",
  type: "distort",
  aiRationale: "Mirrors the image."
};

export const PremiereSpherize: EffectItem = {
  id: "spherize",
  type: "distort",
  aiRationale: "Spherizes the image."
};

export const PremiereTurbulentDisplace: EffectItem = {
  id: "turbulent-displace",
  type: "distort",
  aiRationale: "Applies turbulent displacement."
};

export const PremiereTwirl: EffectItem = {
  id: "twirl",
  type: "distort",
  aiRationale: "Twirls the image."
};

export const PremiereWarpStabilizer: EffectItem = {
  id: "warp-stabilizer",
  type: "distort",
  aiRationale: "Stabilizes warped footage."
};

export const PremiereWaveWarp: EffectItem = {
  id: "wave-warp",
  type: "distort",
  aiRationale: "Applies a wave warp."
};

export const PremiereChannelMix: EffectItem = {
  id: "channel-mix",
  type: "image-control",
  aiRationale: "Channel Mix FX."
};

export const PremiereRoundedCrop: EffectItem = {
  id: "rounded-crop",
  type: "image-control",
  aiRationale: "Rounded Crop FX."
};

export const PremiereInvert: EffectItem = {
  id: "invert",
  type: "image-control",
  aiRationale: "Inverts colors."
};

export const PremiereVRBlur: EffectItem = {
  id: "vr-blur",
  type: "immersive-video",
  aiRationale: "VR Blur."
};

export const PremiereVRChromaticAberrations: EffectItem = {
  id: "vr-chromatic-aberrations",
  type: "immersive-video",
  aiRationale: "VR Chromatic Aberrations."
};

export const PremiereVRColorGradients: EffectItem = {
  id: "vr-color-gradients",
  type: "immersive-video",
  aiRationale: "VR Color Gradients."
};

export const PremiereVRDeNoise: EffectItem = {
  id: "vr-de-noise",
  type: "immersive-video",
  aiRationale: "VR De-Noise."
};

export const PremiereVRDigitalGlitch: EffectItem = {
  id: "vr-digital-glitch",
  type: "immersive-video",
  aiRationale: "VR Digital Glitch."
};

export const PremiereVRFractalNoise: EffectItem = {
  id: "vr-fractal-noise",
  type: "immersive-video",
  aiRationale: "VR Fractal Noise."
};

export const PremiereVRGlow: EffectItem = {
  id: "vr-glow",
  type: "immersive-video",
  aiRationale: "VR Glow."
};

export const PremiereVRPlanetoSphere: EffectItem = {
  id: "vr-plane-to-sphere",
  type: "immersive-video",
  aiRationale: "VR Plane to Sphere."
};

export const PremiereVRProjection: EffectItem = {
  id: "vr-projection",
  type: "immersive-video",
  aiRationale: "VR Projection."
};

export const PremiereVRRotateSphere: EffectItem = {
  id: "vr-rotate-sphere",
  type: "immersive-video",
  aiRationale: "VR Rotate Sphere."
};

export const PremiereVRSharpen: EffectItem = {
  id: "vr-sharpen",
  type: "immersive-video",
  aiRationale: "VR Sharpen."
};

export const PremiereLogoCutout: EffectItem = {
  id: "logo-cutout",
  type: "keying",
  aiRationale: "Alpha FX."
};

export const PremiereEchoGlow: EffectItem = {
  id: "echo-glow",
  type: "lights-glows",
  aiRationale: "Echo Glow FX."
};

export const PremiereEdgeGlow: EffectItem = {
  id: "edge-glow",
  type: "lights-glows",
  aiRationale: "Edge Glow FX."
};

export const PremiereGlint: EffectItem = {
  id: "glint",
  type: "lights-glows",
  aiRationale: "Glint FX."
};

export const PremiereLightLeaks: EffectItem = {
  id: "light-leaks",
  type: "lights-glows",
  aiRationale: "Light Leaks FX."
};

export const PremiereRGBSplit: EffectItem = {
  id: "rgb-split",
  type: "lights-glows",
  aiRationale: "RGB Split FX."
};

export const PremiereVolumetricRays: EffectItem = {
  id: "volumetric-rays",
  type: "lights-glows",
  aiRationale: "Volumetric Rays FX."
};

export const PremiereWonderGlow: EffectItem = {
  id: "wonder-glow",
  type: "lights-glows",
  aiRationale: "Wonder Glow FX."
};

export const PremiereBasic3D: EffectItem = {
  id: "basic-3d",
  type: "perspective",
  aiRationale: "Basic 3D perspective."
};

export const PremiereLongShadow: EffectItem = {
  id: "long-shadow",
  type: "perspective",
  aiRationale: "Long Shadow FX."
};

export const PremierePosterizeTime: EffectItem = {
  id: "posterize-time",
  type: "time",
  aiRationale: "Posterize Time effect."
};

export const Premiere3DRotate: EffectItem = {
  id: "3d-rotate",
  type: "transform",
  aiRationale: "3D Rotate FX."
};

export const PremiereCameraShake: EffectItem = {
  id: "camera-shake",
  type: "transform",
  aiRationale: "Camera Shake FX."
};

export const PremiereGrow: EffectItem = {
  id: "grow",
  type: "transform",
  aiRationale: "Grow FX."
};

export const PremiereMove: EffectItem = {
  id: "move",
  type: "transform",
  aiRationale: "Move FX."
};

export const PremiereOffset: EffectItem = {
  id: "offset",
  type: "transform",
  aiRationale: "Offset effect."
};

export const PremiereShrink: EffectItem = {
  id: "shrink",
  type: "transform",
  aiRationale: "Shrink FX."
};

export const PremiereSpacer: EffectItem = {
  id: "spacer",
  type: "transform",
  aiRationale: "Spacer FX."
};

export const PremiereSpin: EffectItem = {
  id: "spin",
  type: "transform",
  aiRationale: "Spin FX."
};

export const PremiereWiggle: EffectItem = {
  id: "wiggle",
  type: "transform",
  aiRationale: "Wiggle FX."
};

export const PremiereAutoAlign: EffectItem = {
  id: "auto-align",
  type: "utility",
  aiRationale: "Auto Align FX."
};

export const PremiereCineonConverter: EffectItem = {
  id: "cineon-converter",
  type: "utility",
  aiRationale: "Cineon Converter."
};

export const PremiereClone: EffectItem = {
  id: "clone",
  type: "utility",
  aiRationale: "Clone FX."
};

export const PremiereStroke: EffectItem = {
  id: "stroke",
  type: "utility",
  aiRationale: "Stroke FX."
};

