import type { StyleDNA } from "../types";

import { spiderverseAction } from "./spiderverse-action";
import { tarantinoDialogue } from "./tarantino-dialogue";
import { wesAndersonSymmetry } from "./wes-anderson-symmetry";
import { nolanTrailer } from "./nolan-trailer";
import { a24Horror } from "./a24-horror";
import { edgarWrightSnap } from "./edgar-wright-snap";
import { CYBERPUNK_NOIR } from "./cyberpunk-noir";
import { LOFI_HIPHOP } from "./lofi-hiphop";
import { EIGHTIES_VHS_SYNTH } from "./80s-vhs-synth";
import { NINETIES_GRUNGE } from "./90s-grunge";
import { Y2K_DIGITAL } from "./y2k-digital";
import { CINEMATIC_NOIR } from "./cinematic-noir";
import { TIKTOK_ENERGETIC } from "./tiktok-energetic";
import { DREAMY_SOFT } from "./dreamy";
import { FILM_NOIR_CLASSIC } from "./film-noir";
import { VIBRANT_NEON } from "./vibrant-neon";
import { SLOW_MOTION_BEAUTY } from "./slow-motion-beauty";

export const STYLE_LIBRARY: Record<string, StyleDNA> = {
  spiderverse_action: spiderverseAction,
  tarantino_dialogue: tarantinoDialogue,
  wes_anderson_centered: wesAndersonSymmetry,
  nolan_trailer_imax: nolanTrailer,
  a24_elevated_horror: a24Horror,
  edgar_wright_snap_comedy: edgarWrightSnap,
  cyberpunk_neon_noir: CYBERPUNK_NOIR,
  lofi_hiphop_chill: LOFI_HIPHOP,
  "80s_vhs_synthwave": EIGHTIES_VHS_SYNTH,
  "90s_grunge_raw": NINETIES_GRUNGE,
  y2k_early_digital_cam: Y2K_DIGITAL,
  cinematic_noir: CINEMATIC_NOIR,
  tiktok_energetic: TIKTOK_ENERGETIC,
  dreamy_soft: DREAMY_SOFT,
  film_noir_classic: FILM_NOIR_CLASSIC,
  vibrant_neon: VIBRANT_NEON,
  slow_motion_beauty: SLOW_MOTION_BEAUTY,
};

export const STYLE_TRIGGERS: Record<string, string> = {
  spiderverse: "spiderverse_action",
  "spider-verse": "spiderverse_action",
  "spider verse": "spiderverse_action",
  "miles morales": "spiderverse_action",
  comic: "spiderverse_action",
  "comic book": "spiderverse_action",
  inked: "spiderverse_action",
  halftone: "spiderverse_action",
  benay: "spiderverse_action",

  tarantino: "tarantino_dialogue",
  "pulp fiction": "tarantino_dialogue",
  "kill bill": "tarantino_dialogue",
  "diner scene": "tarantino_dialogue",
  "django unchained": "tarantino_dialogue",

  "wes anderson": "wes_anderson_centered",
  symmetric: "wes_anderson_centered",
  "grand budapest": "wes_anderson_centered",
  storybook: "wes_anderson_centered",
  centered: "wes_anderson_centered",
  pastel: "wes_anderson_centered",

  nolan: "nolan_trailer_imax",
  inception: "nolan_trailer_imax",
  interstellar: "nolan_trailer_imax",
  imax: "nolan_trailer_imax",
  "trailer feel": "nolan_trailer_imax",
  oppenheimer: "nolan_trailer_imax",

  a24: "a24_elevated_horror",
  "elevated horror": "a24_elevated_horror",
  hereditary: "a24_elevated_horror",
  midsommar: "a24_elevated_horror",
  "art horror": "a24_elevated_horror",
  dread: "a24_elevated_horror",

  "edgar wright": "edgar_wright_snap_comedy",
  "scott pilgrim": "edgar_wright_snap_comedy",
  "baby driver": "edgar_wright_snap_comedy",
  "snap edit": "edgar_wright_snap_comedy",
  "whip pan": "edgar_wright_snap_comedy",

  cyberpunk: "cyberpunk_neon_noir",
  "blade runner": "cyberpunk_neon_noir",
  "neon noir": "cyberpunk_neon_noir",
  "neon rain": "cyberpunk_neon_noir",

  lofi: "lofi_hiphop_chill",
  "lo-fi": "lofi_hiphop_chill",
  "lofi hip hop": "lofi_hiphop_chill",
  cozy: "lofi_hiphop_chill",
  chill: "lofi_hiphop_chill",
  "study beats": "lofi_hiphop_chill",

  "80s": "80s_vhs_synthwave",
  "1980s": "80s_vhs_synthwave",
  "miami vice": "80s_vhs_synthwave",
  synthwave: "80s_vhs_synthwave",
  retrowave: "80s_vhs_synthwave",

  "90s": "90s_grunge_raw",
  "1990s": "90s_grunge_raw",
  grunge: "90s_grunge_raw",
  nirvana: "90s_grunge_raw",

  y2k: "y2k_early_digital_cam",
  "2000s": "y2k_early_digital_cam",
  "flip phone": "y2k_early_digital_cam",
  "early digital": "y2k_early_digital_cam",

  "cinematic noir": "cinematic_noir",
  "noir cinematic": "cinematic_noir",
  "dark cinematic": "cinematic_noir",

  "tiktok energetic": "tiktok_energetic",
  "tiktok hype": "tiktok_energetic",
  "viral edit": "tiktok_energetic",
  "fast cuts": "tiktok_energetic",

  dreamy: "dreamy_soft",
  dreamlike: "dreamy_soft",
  ethereal: "dreamy_soft",
  soft: "dreamy_soft",

  "film noir": "film_noir_classic",
  "noir classic": "film_noir_classic",
  "black and white": "film_noir_classic",
  detective: "film_noir_classic",

  "vibrant neon": "vibrant_neon",
  "neon vibrant": "vibrant_neon",
  electric: "vibrant_neon",
  neon: "vibrant_neon",

  "slow motion": "slow_motion_beauty",
  "slowmo beauty": "slow_motion_beauty",
  luxury: "slow_motion_beauty",
  elegant: "slow_motion_beauty",
};

export function findStyleByTrigger(text: string): StyleDNA[] {
  const lower = text.toLowerCase();
  const matches = new Set<string>();
  for (const [trigger, styleId] of Object.entries(STYLE_TRIGGERS)) {
    if (lower.includes(trigger)) matches.add(styleId);
  }
  return Array.from(matches).map((id) => STYLE_LIBRARY[id]).filter(Boolean);
}
