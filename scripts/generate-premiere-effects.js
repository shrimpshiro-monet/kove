const fs = require('fs');

const generateEffectCode = (name, type, rationale) => {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let varName = name.replace(/[^a-zA-Z0-9]+/g, '');
  varName = "Premiere" + varName;
  return `export const ${varName}: EffectItem = {
  id: "${id}",
  type: "${type}",
  aiRationale: "${rationale}"
};`;
};

const generateTransitionCode = (name, type, rationale) => {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let varName = name.replace(/[^a-zA-Z0-9]+/g, '');
  varName = "Premiere" + varName;
  return `export const ${varName}: TransitionItem = {
  id: "${id}",
  type: "${type}",
  aiRationale: "${rationale}"
};`;
};

const effects = [
  ["4-Color Gradient", "generate", "Creates a gradient with four colors."],
  ["Lens Flare", "generate", "Simulates what happens when bright light hits a camera lens."],
  ["Lightning", "generate", "Creates animated lightning bolts or other electric visuals."],
  ["Ramp", "generate", "Creates a color gradient, either linear or radial."],
  ["Black & White", "image-control", "Turns your clip to grayscale."],
  ["Color Pass", "image-control", "Turns a video into grayscale except for one chosen color."],
  ["Color Replace", "image-control", "Replaces a selected color with a new color."],
  ["Gamma Correction", "image-control", "Changes a clip's brightness by adjusting the mid tones."],
  ["Alpha Adjust", "keying", "Adjusts the Opacity percentage to create levels of transparency."],
  ["Color Key", "keying", "Keys out all image pixels like a specified key color."],
  ["Luma Key", "keying", "Removes all areas of a layer based on specific luminance or brightness levels."],
  ["Track Matte Key", "keying", "Reveals one clip through another using a third file as a matte."],
  ["Ultra Key", "keying", "Removes a green or blue screen from your footage."],
  ["Noise", "noise-grain", "Adds random pixels to your footage, creating a grainy, static-like texture."],
  ["Drop Shadow", "perspective", "Adds a shadow that appears behind the clip."],
  ["Alpha Glow", "stylize", "Applies color along the edges of a masked alpha channel."],
  ["Brush Strokes", "stylize", "Applies a rough, painted look to an image."],
  ["Color Emboss", "stylize", "Works like the Emboss effect, without suppressing the image’s original colors."],
  ["Find Edges", "stylize", "Identifies the areas of the image that have significant transitions and emphasizes the edges."],
  ["Mosaic", "stylize", "Fills a clip with solid-color rectangles, pixelating the original image."],
  ["Posterize", "stylize", "Specifies the number of tonal levels for each channel in an image."],
  ["Replicate", "stylize", "Divides the screen into tiles and displays the whole image in each tile."],
  ["Roughen Edges", "stylize", "Roughs up the edges of a clip’s alpha channel."],
  ["Strobe Light", "stylize", "Performs an arithmetic operation on a clip or makes the clip transparent at periodic or random intervals."],
  ["Auto Reframe", "transform", "Auto-reframes your video clips to match the aspect ratio of different platforms."],
  ["Crop", "transform", "Trims pixels from the edges of a clip."],
  ["Edge Feather", "transform", "Adds a soft black border around your video, giving it a subtle vignette look."],
  ["Horizontal Flip", "transform", "Reverses each frame in a clip from left to right."],
  ["Transform", "transform", "Adjusts a clip’s position, size, rotation, and opacity."],
  ["Vertical Flip", "transform", "Turns your clip upside down."],
  ["Metadata & Timecode Burn-in", "utility", "Displays or burns in proper clip metadata on export."],
  ["SDR Conform", "utility", "Converts HDR footage into SDR and modulates brightness and color."],
  ["Simple Text", "utility", "Quickly adds plain, customizable text to your footage."],
  
  // From tables
  ["Extract", "adjust", "Adjust extract effect."],
  ["Levels", "adjust", "Adjust levels effect."],
  ["Lighting Effects", "adjust", "Lighting effects."],
  ["ProcAmp", "adjust", "ProcAmp adjustments."],
  
  ["Bokeh Blur", "blur-sharpen", "Bokeh Blur FX."],
  ["Compound Blur", "blur-sharpen", "Compound Blur FX."],
  ["Directional Blur", "blur-sharpen", "Directional Blur FX."],
  ["Focus Blur", "blur-sharpen", "Focus Blur FX."],
  ["Gaussian Blur", "blur-sharpen", "Gaussian Blur FX."],
  ["Reduce Interlace Flicker", "blur-sharpen", "Reduces interlace flicker."],
  ["Sharpen", "blur-sharpen", "Sharpens the image."],
  ["Unsharp Mask", "blur-sharpen", "Applies an unsharp mask."],
  
  ["ASC CDL", "color-correction", "ASC CDL color correction."],
  ["Brightness & Contrast", "color-correction", "Adjusts brightness and contrast."],
  ["Lumetri Color", "color-correction", "Lumetri Color correction."],
  ["Tint", "color-correction", "Tints the image."],
  ["Video Limiter", "color-correction", "Limits video levels."],
  ["Vignette", "color-correction", "Adds a vignette."],
  
  ["Corner Pin", "distort", "Distorts image using corner pins."],
  ["Lens Distortion", "distort", "Simulates lens distortion."],
  ["Mirror", "distort", "Mirrors the image."],
  ["Spherize", "distort", "Spherizes the image."],
  ["Turbulent Displace", "distort", "Applies turbulent displacement."],
  ["Twirl", "distort", "Twirls the image."],
  ["Warp Stabilizer", "distort", "Stabilizes warped footage."],
  ["Wave Warp", "distort", "Applies a wave warp."],
  
  ["Channel Mix", "image-control", "Channel Mix FX."],
  ["Rounded Crop", "image-control", "Rounded Crop FX."],
  ["Invert", "image-control", "Inverts colors."],
  
  ["VR Blur", "immersive-video", "VR Blur."],
  ["VR Chromatic Aberrations", "immersive-video", "VR Chromatic Aberrations."],
  ["VR Color Gradients", "immersive-video", "VR Color Gradients."],
  ["VR De-Noise", "immersive-video", "VR De-Noise."],
  ["VR Digital Glitch", "immersive-video", "VR Digital Glitch."],
  ["VR Fractal Noise", "immersive-video", "VR Fractal Noise."],
  ["VR Glow", "immersive-video", "VR Glow."],
  ["VR Plane to Sphere", "immersive-video", "VR Plane to Sphere."],
  ["VR Projection", "immersive-video", "VR Projection."],
  ["VR Rotate Sphere", "immersive-video", "VR Rotate Sphere."],
  ["VR Sharpen", "immersive-video", "VR Sharpen."],
  
  ["Logo Cutout", "keying", "Alpha FX."],
  
  ["Echo Glow", "lights-glows", "Echo Glow FX."],
  ["Edge Glow", "lights-glows", "Edge Glow FX."],
  ["Glint", "lights-glows", "Glint FX."],
  ["Light Leaks", "lights-glows", "Light Leaks FX."],
  ["RGB Split", "lights-glows", "RGB Split FX."],
  ["Volumetric Rays", "lights-glows", "Volumetric Rays FX."],
  ["Wonder Glow", "lights-glows", "Wonder Glow FX."],
  
  ["Basic 3D", "perspective", "Basic 3D perspective."],
  ["Long Shadow", "perspective", "Long Shadow FX."],
  
  ["Posterize Time", "time", "Posterize Time effect."],
  
  ["3D Rotate", "transform", "3D Rotate FX."],
  ["Camera Shake", "transform", "Camera Shake FX."],
  ["Grow", "transform", "Grow FX."],
  ["Move", "transform", "Move FX."],
  ["Offset", "transform", "Offset effect."],
  ["Shrink", "transform", "Shrink FX."],
  ["Spacer", "transform", "Spacer FX."],
  ["Spin", "transform", "Spin FX."],
  ["Wiggle", "transform", "Wiggle FX."],
  
  ["Auto Align", "utility", "Auto Align FX."],
  ["Cineon Converter", "utility", "Cineon Converter."],
  ["Clone", "utility", "Clone FX."],
  ["Stroke", "utility", "Stroke FX."]
];

const transitions = [
  ["Block Dissolve", "wipe", "Makes a clip disappear in random blocks."],
  ["Gradient Wipe", "wipe", "Causes pixels to become transparent based on luminance values."],
  ["Linear Wipe", "wipe", "Performs a simple linear wipe of a clip in a specified direction."],
  
  ["Block Motion", "animation", "Block Motion Impacts."],
  ["Flip Motion", "animation", "Flip Motion Impacts."],
  ["Fold Motion", "animation", "Fold Motion Impacts."],
  ["Pop Motion", "animation", "Pop Motion Impacts."],
  ["Pull Motion", "animation", "Pull Motion Impacts."],
  ["Spin Motion", "animation", "Spin Motion Impacts."],
  ["Spring Motion", "animation", "Spring Motion Impacts."],
  ["Travel Motion", "animation", "Travel Motion Impacts."],
  
  ["Additive Dissolve", "dissolve", "Additive Dissolve Impacts."],
  ["Blur Dissolve", "dissolve", "Blur Dissolve Impacts."],
  ["Burn Alpha", "dissolve", "Burn Alpha Impacts."],
  ["Cross Dissolve", "dissolve", "Cross Dissolve Impacts."],
  ["Dip to Black", "dissolve", "Dip to Black Impacts."],
  ["Dip to Color", "dissolve", "Dip to Color Impacts."],
  ["Dip to White", "dissolve", "Dip to White Impacts."],
  ["Film Dissolve", "dissolve", "Film Dissolve Impacts."],
  ["Luma Fade", "dissolve", "Luma Fade Impacts."],
  ["Morph Cut", "dissolve", "Morph Cut transition."],
  ["Mosaic", "dissolve", "Mosaic Impacts."],
  
  ["Chaos", "grunge-distort", "Chaos Impacts."],
  ["Earthquake", "grunge-distort", "Earthquake Impacts."],
  ["Flicker", "grunge-distort", "Flicker Impacts."],
  ["Glass", "grunge-distort", "Glass Impacts."],
  ["Glitch", "grunge-distort", "Glitch Impacts."],
  ["Grunge", "grunge-distort", "Grunge Impacts."],
  ["Kaleidoscope", "grunge-distort", "Kaleidoscope Impacts."],
  ["Liquid Distortion", "grunge-distort", "Liquid Distortion Impacts."],
  ["TV Power", "grunge-distort", "TV Power Impacts."],
  ["VHS Damage", "grunge-distort", "VHS Damage Impacts."],
  
  ["VR Chroma Leaks", "immersive-video", "VR Chroma Leaks."],
  ["VR Gradient Wipe", "immersive-video", "VR Gradient Wipe."],
  ["VR Iris Wipe", "immersive-video", "VR Iris Wipe."],
  ["VR Light Leaks", "immersive-video", "VR Light Leaks."],
  ["VR Light Rays", "immersive-video", "VR Light Rays."],
  ["VR Mobius Zoom", "immersive-video", "VR Mobius Zoom."],
  ["VR Random Blocks", "immersive-video", "VR Random Blocks."],
  ["VR Spherical Blur", "immersive-video", "VR Spherical Blur."],
  
  ["Burn Chroma", "lights-blurs", "Burn Chroma Impacts."],
  ["Chroma Leak", "lights-blurs", "Chroma Leak Impacts."],
  ["Cross Zoom", "lights-blurs", "Cross Zoom Impacts."],
  ["Directional Blur Transition", "lights-blurs", "Directional Blur Impacts."],
  ["Flare", "lights-blurs", "Flare Impacts."],
  ["Flash", "lights-blurs", "Flash Impacts."],
  ["Glow", "lights-blurs", "Glow Impacts."],
  ["Lens Blur", "lights-blurs", "Lens Blur Impacts."],
  ["Light Leak", "lights-blurs", "Light Leak Impacts."],
  ["Light Sweep", "lights-blurs", "Light Sweep Impacts."],
  ["Phosphor", "lights-blurs", "Phosphor Impacts."],
  ["Radial Blur", "lights-blurs", "Radial Blur Impacts."],
  ["Ray", "lights-blurs", "Ray Impacts."],
  ["Solarize", "lights-blurs", "Solarize Impacts."],
  ["Stripe", "lights-blurs", "Stripe Impacts."],
  ["Zoom Blur", "lights-blurs", "Zoom Blur Impacts."],
  
  ["3D Roll", "slide", "3D Roll Impacts."],
  ["Film Roll", "slide", "Film Roll Impacts."],
  ["Push", "slide", "Push Impacts."],
  ["Roll", "slide", "Roll Impacts."],
  ["Split", "slide", "Split Impacts."],
  ["Stretch", "slide", "Stretch Impacts."],
  ["Whip", "slide", "Whip Impacts."],
  
  ["Motion Camera", "smart-tools", "Motion Camera Impacts."],
  ["Motion Tween", "smart-tools", "Motion Tween Impacts."],
  ["Shape Flow", "smart-tools", "Shape Flow Impacts."],
  
  ["Text Animator", "text", "Text Animator Impacts."],
  ["Typewriter", "text", "Typewriter Impacts."],
  
  ["3D Spin", "transformers", "3D Spin Impacts."],
  ["Frame", "transformers", "Frame Impacts."],
  ["Louver", "transformers", "Louver Impacts."],
  ["Mirror Transition", "transformers", "Mirror Impacts."],
  ["Page Peel", "transformers", "Page Peel Impacts."],
  ["Slice", "transformers", "Slice Impacts."],
  ["Wave", "transformers", "Wave Impacts."],
  
  ["Clock Wipe", "wipe", "Clock Wipe Impacts."],
  ["Neon Wipe", "wipe", "Neon Wipe Impacts."],
  ["Panel Wipe", "wipe", "Panel Wipe Impacts."],
  ["Plateau Wipe", "wipe", "Plateau Wipe Impacts."],
  ["Radial Wipe", "wipe", "Star Wipe Impacts."],
  ["Soft Wipe", "wipe", "Soft Wipe Impacts."],
  ["Star Wipe", "wipe", "Star Wipe Impacts."],
  ["Stretch Wipe", "wipe", "Stretch Wipe Impacts."]
];

let effectsFileContent = 'import { EffectItem } from "../types";\n\n';
for (const effect of effects) {
  effectsFileContent += generateEffectCode(effect[0], effect[1], effect[2]) + '\n\n';
}

fs.writeFileSync('src/catalog/effects/premiere.ts', effectsFileContent);

let transitionsFileContent = 'import { TransitionItem } from "../types";\n\n';
for (const transition of transitions) {
  transitionsFileContent += generateTransitionCode(transition[0], transition[1], transition[2]) + '\n\n';
}

fs.writeFileSync('src/catalog/transitions/premiere.ts', transitionsFileContent);

console.log("Files generated.");
