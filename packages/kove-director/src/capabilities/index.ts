/**
 * Kove Skill Registry — all capabilities imported and registered.
 *
 * Import this file to register all capabilities at module load.
 * The registry then provides manifest building, lookup, and search.
 */

// Foundation
export type { Capability, CapabilityStatus, CapabilityCategory, CapabilityContext } from "./types";
export {
  registerCapability,
  registerAll,
  lookupCapability,
  searchByTrigger,
  getByCategory,
  getByStatus,
  buildManifest,
  buildJsonManifest,
  getStats,
} from "./registry";

// Auto-register all capabilities via side-effect imports
import "./audio/audio-dynamics";
import "./audio/audio-eq";
import "./audio/audio-mixing";
import "./audio/beat-sync";
import "./audio/ducking";
import "./audio/dynamic-sfx";
import "./audio/fade";
import "./audio/sfx-synthesis";
import "./audio/volume";
import "./camera/crop";
import "./camera/face-track";
import "./camera/ken-burns-pan";
import "./camera/reframe";
import "./camera/stabilize";
import "./composition/broll";
import "./composition/depth-parallax";
import "./composition/mask-composite";
import "./composition/multi-cam";
import "./composition/multi-track";
import "./composition/pip";
import "./composition/split-screen";
import "./composition/subject-isolation";
import "./composition/text-behind-subject";
import "./edit/beat-cut";
import "./edit/delete";
import "./edit/freeze-frame";
import "./edit/move";
import "./edit/posterize-time";
import "./edit/ripple-delete";
import "./edit/speed-ramp";
import "./edit/speed-static";
import "./edit/split";
import "./edit/trim";
import "./edit/undo-redo";
import "./effects/background-blur";
import "./effects/camera-blur";
import "./effects/chromatic-burst";
import "./effects/color-curves";
import "./effects/color-grade";
import "./effects/color-lut";
import "./effects/color-pulse";
import "./effects/color-wheels";
import "./effects/directional-blur";
import "./effects/echo";
import "./effects/flash";
import "./effects/gaussian-blur";
import "./effects/gl-transition-effect";
import "./effects/interlace-flicker";
import "./effects/invert-color";
import "./effects/motion-track-effect";
import "./effects/parallax-3d";
import "./effects/player-glow";
import "./effects/pull-out";
import "./effects/push-in";
import "./effects/shake";
import "./effects/sharpen";
import "./effects/speed-ramp-effect";
import "./effects/unsharp-mask";
import "./effects/vignette-punch";
import "./effects/whip-pan";
import "./overlays/face-detect";
import "./overlays/kinetic-caption";
import "./overlays/logo-watermark";
import "./overlays/lower-third";
import "./overlays/lyric-text";
import "./overlays/motion-graphics";
import "./overlays/subtitle-auto";
import "./overlays/text";
import "./overlays/title-card";
import "./transitions/barn-doors";
import "./transitions/blur";
import "./transitions/crossfade";
import "./transitions/custom-transition";
import "./transitions/dip-to-black";
import "./transitions/dissolve";
import "./transitions/film-burn";
import "./transitions/flash-transition";
import "./transitions/gl-transition-experimental";
import "./transitions/glitch";
import "./transitions/gradient-wipe";
import "./transitions/iris";
import "./transitions/linear-wipe";
import "./transitions/morph";
import "./transitions/pinwheel";
import "./transitions/pixelate";
import "./transitions/radial-wipe";
import "./transitions/slide";
import "./transitions/spin";
import "./transitions/whip-pan";
import "./transitions/zoom-blur";
